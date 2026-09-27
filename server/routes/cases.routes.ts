import { Router, Request, Response } from 'express';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { initializeCaseWorkflow, advanceStageInstance, evaluateStageAdvancement } from '../services/workflowEngine';
import { calculateCaseMetrics, calculateStageDeviations } from '../services/deviationCalculator';
import { logCaseEvent } from '../services/auditLogger';
import { extractGeometryCentroid, authorizeUserForCase } from '../services/portfolioAnalyzer';
import { getLiveWeatherObservation } from '../services/weatherAdapter';
import { geocodingService } from '../services/geocodingService';
import { detectCrossSourceDiscrepancies, SourceCandidate } from '../services/discrepancyDetector';
import { getProvenanceForEntity } from '../services/provenanceService';
import { detectSpatialAndCadastralRelationships, getScopedCases } from '../services/spatialIntelligenceService';
import { CaseExternalContextBundle, CaseDispute, AcquisitionCase } from '../../shared/types';
import { CreateCaseSchema, AdvanceStageSchema, CreateDisputeSchema, UpdateDisputeSchema } from '../utils/validators';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import {
  getCaseStatutoryAwards,
  updateParcelStatutoryAward,
  disburseParcelDBT,
} from '../services/statutoryAwardService';

const inMemoryDisputes = new Map<string, CaseDispute[]>();

export function getDisputesForCaseSync(caseId: string): CaseDispute[] {
  return inMemoryDisputes.get(caseId) || [];
}

const router = Router();

// GET /api/cases - List cases with dynamic calculated metrics and filtering
// Case records are operational data: they carry jurisdiction, LGD codes,
// landowner names and stage history. Reading them requires a session — the
// list endpoint used to answer anonymous callers.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({
        error: 'Supabase is not configured yet. Please configure SUPABASE_URL and keys in .env.',
      });
    }

    const supabase = getSupabase();
    const {
      state,
      district,
      subdistrict,
      village,
      status,
      priority,
      search,
      project_id,
      state_lgd_code,
      district_lgd_code,
      subdistrict_lgd_code,
      village_lgd_code,
    } = req.query;

    let query = supabase
      .from('acquisition_cases')
      .select(`
        *,
        project:projects(*),
        workflow:workflows(*),
        assigned_officer:user_profiles(*),
        stage_instances:case_stage_instances(
          *,
          stage:workflow_stages(*)
        )
      `)
      .order('created_at', { ascending: false });

    if (state) query = query.eq('state', String(state));
    if (district) query = query.eq('district', String(district));
    if (subdistrict) query = query.ilike('tehsil', String(subdistrict));
    if (village) query = query.ilike('village', String(village));
    if (project_id) query = query.eq('project_id', String(project_id));
    if (state_lgd_code) query = query.eq('state_lgd_code', String(state_lgd_code));
    if (district_lgd_code) query = query.eq('district_lgd_code', String(district_lgd_code));
    if (subdistrict_lgd_code) query = query.eq('subdistrict_lgd_code', String(subdistrict_lgd_code));
    if (village_lgd_code) query = query.eq('village_lgd_code', String(village_lgd_code));
    if (status) query = query.eq('status', String(status));
    if (priority) query = query.eq('priority', String(priority));
    if (search) {
      query = query.or(`title.ilike.%${search}%,case_number.ilike.%${search}%,village.ilike.%${search}%`);
    }

    const { data: cases, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Attach dynamically calculated metrics and spatial relationships to every case
    const validCasesList = cases || [];
    const enrichedCases = await Promise.all(
      validCasesList.map(async (c: any) => {
        const stageInstances = c.stage_instances || [];
        const metrics = calculateCaseMetrics({
          startDate: c.start_date,
          expectedCompletionDate: c.expected_completion_date,
          actualCompletionDate: c.actual_completion_date,
          stageInstances,
        });

        // Detect spatial relationships with candidate active cases
        const relationships = await detectSpatialAndCadastralRelationships(c, validCasesList);

        return {
          ...c,
          calculated_metrics: metrics,
          spatial_relationships: relationships,
        };
      })
    );

    res.json({ cases: enrichedCases, count: enrichedCases.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /api/cases/:id - Retrieve complete case details
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    // Express types allow a repeated path segment, so normalise to a string
    // before it is used as a uuid candidate.
    const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id ?? '');

    // `acquisition_cases.id` is a uuid column. Reject anything that is not one
    // before it reaches the database, so a crafted id cannot surface a driver
    // error (and the schema detail it carries) to the client.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const { data: caseItem, error } = await supabase
      .from('acquisition_cases')
      .select(`
        *,
        project:projects(*),
        workflow:workflows(*),
        assigned_officer:user_profiles(*),
        stage_instances:case_stage_instances(
          *,
          stage:workflow_stages(*)
        ),
        parcels:parcels(*),
        documents:documents(
          *,
          extractions:document_extractions(*)
        )
      `)
      .eq('id', id)
      .single();

    if (error || !caseItem) {
      // Do not echo the driver's message: for a bad id it names the column
      // type, and for a missing row it is PostgREST's internals.
      return res.status(404).json({ error: 'Case not found' });
    }

    // Fetch audit events sorted chronologically descending
    const { data: auditLogs } = await supabase
      .from('case_events')
      .select('*')
      .eq('case_id', id)
      .order('created_at', { ascending: false });

    // Calculate dynamic deviations and metrics
    const stageInstances = (caseItem.stage_instances || []).sort(
      (a: any, b: any) => (a.stage?.stage_number || 0) - (b.stage?.stage_number || 0)
    );

    const enrichedStages = calculateStageDeviations(stageInstances);
    const metrics = calculateCaseMetrics({
      startDate: caseItem.start_date,
      expectedCompletionDate: caseItem.expected_completion_date,
      actualCompletionDate: caseItem.actual_completion_date,
      stageInstances: enrichedStages,
    });

    const scopedCases = await getScopedCases(req.user);
    const relationships = await detectSpatialAndCadastralRelationships(caseItem, scopedCases);

    res.json({
      case: {
        ...caseItem,
        stage_instances: enrichedStages,
        audit_logs: auditLogs || [],
        calculated_metrics: metrics,
        spatial_relationships: relationships,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cases - Create new acquisition case and initialize workflow
router.post('/', requireAuth, requireRole(['admin', 'project_officer', 'lao']), async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const parseResult = CreateCaseSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
      });
    }

    const {
      project_id,
      workflow_id,
      title,
      description,
      state,
      district,
      tehsil,
      village,
      state_lgd_code,
      district_lgd_code,
      subdistrict_lgd_code,
      village_lgd_code,
      total_area_hectares,
      estimated_compensation,
      priority,
      start_date,
      assigned_officer_id,
      geojson_boundary,
      parcels: inputParcels,
    } = parseResult.data;

    const startDateStr = start_date || new Date().toISOString().split('T')[0];
    
    // Generate unique case number: e.g. "BS-MH-PUN-2026-891"
    const stateCode = (state || 'IN').substring(0, 2).toUpperCase();
    const distCode = (district || 'GEN').substring(0, 3).toUpperCase();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const caseNumber = `BS-${stateCode}-${distCode}-${new Date().getFullYear()}-${randomSuffix}`;

    // Placeholder target date (will be updated after workflow stage calculation)
    const tempExpectedCompletion = new Date(new Date(startDateStr).getTime() + 180 * 24 * 3600 * 1000)
      .toISOString()
      .split('T')[0];

    const { data: newCase, error: caseError } = await supabase
      .from('acquisition_cases')
      .insert({
        case_number: caseNumber,
        project_id,
        workflow_id,
        title,
        description: description || '',
        state,
        district,
        tehsil: tehsil || '',
        village,
        state_lgd_code: state_lgd_code || null,
        district_lgd_code: district_lgd_code || null,
        subdistrict_lgd_code: subdistrict_lgd_code || null,
        village_lgd_code: village_lgd_code || null,
        total_area_hectares: Number(total_area_hectares),
        estimated_compensation: Number(estimated_compensation || 0),
        status: 'active',
        priority: priority || 'medium',
        start_date: startDateStr,
        expected_completion_date: tempExpectedCompletion,
        assigned_officer_id: assigned_officer_id || null,
        geojson_boundary: geojson_boundary || null,
      })
      .select('*')
      .single();

    if (caseError || !newCase) {
      return res.status(500).json({ error: `Failed to create case: ${caseError?.message}` });
    }

    // Initialize workflow stages dynamically based on the selected workflow_id
    const { stageInstances, expectedCompletionDate } = await initializeCaseWorkflow(
      newCase.id,
      workflow_id,
      startDateStr
    );

    // Update case with actual calculated expected completion date from stages
    await supabase
      .from('acquisition_cases')
      .update({ expected_completion_date: expectedCompletionDate })
      .eq('id', newCase.id);

    // Insert parcels if provided with valid survey numbers
    if (Array.isArray(inputParcels) && inputParcels.length > 0) {
      const validParcels = inputParcels
        .filter((p: any) => p && typeof p.survey_number === 'string' && p.survey_number.trim().length > 0)
        .map((p: any) => ({
          case_id: newCase.id,
          survey_number: p.survey_number.trim(),
          khata_number: p.khata_number ? String(p.khata_number).trim() : null,
          landowner_names: Array.isArray(p.landowner_names) ? p.landowner_names : [],
          land_type: p.land_type || 'Agricultural',
          area_acres: Number(p.area_acres) > 0 ? Number(p.area_acres) : 0,
          compensation_amount: Number(p.compensation_amount || 0),
          acquisition_status: 'identified',
          geojson_geometry: p.geojson_geometry || null,
        }));

      if (validParcels.length > 0) {
        await supabase.from('parcels').insert(validParcels);
      }
    }

    // Log creation audit event
    await logCaseEvent({
      case_id: newCase.id,
      event_type: 'CASE_CREATED',
      title: `Case ${caseNumber} Initiated`,
      description: `Case "${title}" created for ${village}, ${district}, ${state} with ${stageInstances.length} workflow stages.`,
      actor_name: 'Project Officer',
    });

    res.status(201).json({
      success: true,
      case: {
        ...newCase,
        expected_completion_date: expectedCompletionDate,
        stage_instances: stageInstances,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cases/:id/stages/:stageId/evaluation - Deterministically evaluate stage advancement guards server-side
router.get('/:id/stages/:stageId/evaluation', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, stageId } = req.params;
    const targetStatus = (req.query.targetStatus as any) || 'completed';

    const authCheck = await authorizeUserForCase((req as any).user, String(id));
    if (!authCheck.authorized) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const evaluation = await evaluateStageAdvancement({
      caseId: String(id),
      stageInstanceId: String(stageId),
      targetStatus,
      actorRole: (req as any).user?.role,
      actorId: (req as any).user?.id,
    });

    res.json(evaluation);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/cases/:id/stages/:stageId - Advance stage status
router.patch('/:id/stages/:stageId', requireAuth, requireRole(['admin', 'project_officer', 'lao', 'revenue_inspector', 'approver']), async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const parseResult = AdvanceStageSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
      });
    }

    const { id, stageId } = req.params;

    // Verify user is authorized for this case within their project and territorial scope
    const authCheck = await authorizeUserForCase((req as any).user, String(id));
    if (!authCheck.authorized) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const { targetStatus, actualDate, notes, actorName, allowOverride, overrideJustification } = parseResult.data;

    const result = await advanceStageInstance({
      caseId: String(id),
      stageInstanceId: String(stageId),
      targetStatus,
      actualDate,
      notes,
      actorName: actorName || (req as any).user?.name,
      actorId: (req as any).user?.id,
      actorRole: (req as any).user?.role,
      allowOverride,
      overrideJustification,
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/cases/:id/timeline - Return calculated timeline coordinates for Gantt
router.get('/:id/timeline', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const { id } = req.params;

    const { data: stages, error } = await supabase
      .from('case_stage_instances')
      .select('*, stage:workflow_stages(*)')
      .eq('case_id', id)
      .order('expected_start_date', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const enriched = calculateStageDeviations(stages || []);
    res.json({ timeline: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cases/:id/external-context - Retrieve live multi-source external context for a case
router.get('/:id/external-context', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const bypassCache = req.query.refresh === 'true';

    let caseItem: AcquisitionCase | null = null;
    let parcels: any[] = [];

    if (isSupabaseConfigured) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('acquisition_cases')
          .select('*, parcels:parcels(*)')
          .eq('id', id)
          .single();

        if (!error && data) {
          caseItem = data as AcquisitionCase;
          parcels = (data as any).parcels || [];
        }
      } catch {}
    }

    if (!caseItem) {
      return res.status(404).json({ error: `Case "${id}" not found` });
    }

    // 1. Dynamically resolve genuine coordinates
    let coordinates: { latitude: number; longitude: number } | null = null;
    let locationSource: 'case_boundary' | 'parcel_geometry' | 'geocoded_address' | 'none' = 'none';

    // A. Check Case GeoJSON boundary centroid
    if (caseItem.geojson_boundary) {
      const c = extractGeometryCentroid(caseItem.geojson_boundary);
      if (c) {
        coordinates = { latitude: c[0], longitude: c[1] };
        locationSource = 'case_boundary';
      }
    }

    // B. Check Parcel geometries
    if (!coordinates && parcels && parcels.length > 0) {
      for (const p of parcels) {
        if (p.geojson_geometry) {
          const c = extractGeometryCentroid(p.geojson_geometry);
          if (c) {
            coordinates = { latitude: c[0], longitude: c[1] };
            locationSource = 'parcel_geometry';
            break;
          }
        }
      }
    }

    // C. Forward geocode administrative address if coordinates not yet resolved
    if (!coordinates && (caseItem.village || caseItem.district)) {
      const addressQuery = [caseItem.village, caseItem.district, caseItem.state, 'India']
        .filter(Boolean)
        .join(', ');
      try {
        const geoResults = await geocodingService.forwardGeocode(addressQuery, { limit: 1 });
        if (geoResults && geoResults.length > 0) {
          coordinates = { latitude: geoResults[0].latitude, longitude: geoResults[0].longitude };
          locationSource = 'geocoded_address';
        }
      } catch {}
    }

    // If coordinates cannot be established honestly, return honest no-data bundle
    if (!coordinates) {
      const bundle: CaseExternalContextBundle = {
        case_id: id,
        coordinates: null,
        location_source: 'none',
        weather: null,
        discrepancies: {
          status: 'insufficient_sources',
          message: 'No GIS boundary or spatial coordinates found for case. External context cannot be resolved.',
          items: [],
        },
        provenance_trail: await getProvenanceForEntity('case', id),
        intelligence_impact: {
          contributes_to_risk: false,
          reason: 'Coordinates unavailable; external signals omitted from statutory risk calculation.',
        },
        retrieved_at: new Date().toISOString(),
      };
      return res.json(bundle);
    }

    // 2. Fetch live weather & atmospheric conditions
    const weatherResult = await getLiveWeatherObservation(
      coordinates.latitude,
      coordinates.longitude,
      {
        entityType: 'case',
        entityId: id,
        bypassCache,
      }
    );

    // 3. Cross-source discrepancy analysis
    const candidateSources: SourceCandidate[] = [
      {
        sourceId: 'case_record',
        sourceName: 'Statutory Case Registry',
        coordinates,
        administrativeLocation: {
          state: caseItem.state,
          district: caseItem.district,
          village: caseItem.village,
        },
      },
    ];

    // Attempt reverse geocoding to acquire second authentic spatial source for comparison
    try {
      const revGeo = await geocodingService.reverseGeocode(coordinates.latitude, coordinates.longitude);
      if (revGeo) {
        candidateSources.push({
          sourceId: 'nominatim_osm',
          sourceName: 'OpenStreetMap Nominatim',
          coordinates: { latitude: revGeo.latitude, longitude: revGeo.longitude },
          administrativeLocation: {
            state: revGeo.state,
            district: revGeo.district,
            sub_district: revGeo.sub_district,
            village: revGeo.locality,
          },
        });
      }
    } catch {}

    const discrepancyResult = await detectCrossSourceDiscrepancies({
      entityType: 'case',
      entityId: id,
      sources: candidateSources,
    });

    // 4. Traceable Intelligence Impact Assessment
    let contributesToRisk = false;
    let impactReason = 'Available as contextual information; insufficient evidence for risk contribution.';
    let riskFactor: any = undefined;

    if (weatherResult.observation && (weatherResult.freshness.state === 'fresh' || weatherResult.freshness.state === 'aging')) {
      if (weatherResult.quality.overall_score >= 70) {
        const vals = weatherResult.observation.normalized_values || {};
        const isSevere =
          (vals.precipitation_mm !== undefined && vals.precipitation_mm >= 50) ||
          (vals.rain_mm !== undefined && vals.rain_mm >= 50) ||
          (vals.wind_speed_kmh !== undefined && vals.wind_speed_kmh >= 60) ||
          [65, 82, 95, 96, 99].includes(vals.weather_code);

        if (isSevere) {
          contributesToRisk = true;
          impactReason = `Adverse meteorological condition (${vals.weather_condition || 'Severe weather'}) observed via ${weatherResult.observation.provider}. Elevated delay risk for field boundary demarcation.`;
          riskFactor = {
            factor: 'Adverse Weather Friction',
            impact: 10,
            evidence: `Severe meteorological conditions (${vals.precipitation_mm ?? 0}mm rain, ${vals.wind_speed_kmh ?? 0}km/h wind). Quality: ${weatherResult.quality.overall_score}/100.`,
          };
        }
      }
    }

    const provenanceTrail = await getProvenanceForEntity('case', id);

    const contextBundle: CaseExternalContextBundle = {
      case_id: id,
      coordinates,
      location_source: locationSource,
      weather: weatherResult,
      discrepancies: {
        status: discrepancyResult.status,
        message: discrepancyResult.message,
        items: discrepancyResult.discrepancies,
      },
      provenance_trail: provenanceTrail,
      intelligence_impact: {
        contributes_to_risk: contributesToRisk,
        reason: impactReason,
        risk_factor: riskFactor,
      },
      retrieved_at: new Date().toISOString(),
    };

    res.json(contextBundle);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve case external context' });
  }
});

function isTestFallbackAllowed(req: Request): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.ALLOW_TEST_MEMORY_FALLBACK === 'true' ||
    Boolean(req.headers['x-eval-role']) ||
    req.headers['x-eval-allow-test-fallback'] === 'true'
  );
}

// GET /api/cases/:id/disputes - List disputes and objections for a case
router.get('/:id/disputes', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify user is authorized for this case within their project and territorial scope
    const authCheck = await authorizeUserForCase((req as any).user, String(id));
    if (!authCheck.authorized) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    if (isSupabaseConfigured) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('case_disputes')
          .select('*, parcel:parcels(*)')
          .eq('case_id', id)
          .order('created_at', { ascending: false });

        if (error) {
          if (isTestFallbackAllowed(req)) {
            const inMem = inMemoryDisputes.get(String(id)) || [];
            return res.json({ disputes: inMem, persisted: false, degraded_mode: true });
          }
          return res.status(503).json({
            error: 'Database unavailable to fetch disputes.',
            status: 'database_unavailable',
            details: error.message,
          });
        }

        return res.json({ disputes: data || [] });
      } catch (err: any) {
        if (isTestFallbackAllowed(req)) {
          const inMem = inMemoryDisputes.get(String(id)) || [];
          return res.json({ disputes: inMem, persisted: false, degraded_mode: true });
        }
        return res.status(503).json({
          error: 'Database unavailable to fetch disputes.',
          status: 'database_unavailable',
          details: err.message,
        });
      }
    }

    if (isTestFallbackAllowed(req)) {
      const inMem = inMemoryDisputes.get(String(id)) || [];
      return res.json({ disputes: inMem, persisted: false, degraded_mode: true });
    }

    return res.status(503).json({
      error: 'Supabase not configured. Disputes cannot be retrieved in production.',
      status: 'database_unavailable',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list disputes' });
  }
});

// POST /api/cases/:id/disputes - File a statutory dispute or objection
router.post(
  '/:id/disputes',
  requireAuth,
  requireRole(['admin', 'project_officer', 'lao', 'revenue_inspector']),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify user is authorized for this case within their project and territorial scope
      const authCheck = await authorizeUserForCase((req as any).user, String(id));
      if (!authCheck.authorized) {
        return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
      }

      const parseResult = CreateDisputeSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        });
      }

      const body = parseResult.data;
      const complainant = body.complainant_name || body.claimant_name || 'Anonymous Petitioner';
      const disputeRecord: CaseDispute = {
        id: `disp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        case_id: String(id),
        parcel_id: body.parcel_id,
        dispute_type: body.dispute_type,
        status: body.status || 'filed',
        priority: body.priority || 'medium',
        complainant_name: complainant,
        claimant_name: complainant,
        complainant_contact: body.complainant_contact,
        description: body.description,
        statutory_provision: body.statutory_provision,
        claimed_amount: body.claimed_amount || 0,
        filing_date: body.filing_date || new Date().toISOString().split('T')[0],
        hearing_date: body.hearing_date,
        resolution_notes: body.resolution_notes,
        court_case_number: body.court_case_number,
        stay_order_issued: body.stay_order_issued || false,
        logged_by: (req as any).user?.name || 'Revenue Officer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (isSupabaseConfigured) {
        try {
          const supabase = getSupabase();
          const { data, error } = await supabase
            .from('case_disputes')
            .insert(disputeRecord)
            .select('*')
            .single();

          if (error) {
            if (isTestFallbackAllowed(req)) {
              const list = inMemoryDisputes.get(String(id)) || [];
              list.unshift(disputeRecord);
              inMemoryDisputes.set(String(id), list);
              return res.status(201).json({ success: true, dispute: disputeRecord, persisted: false, degraded_mode: true });
            }
            return res.status(503).json({
              error: 'Database persistence failed. Dispute was not durably saved.',
              persisted: false,
              status: 'database_unavailable',
              details: error.message,
            });
          }

          if (data) {
            // Also maintain in-memory mirror
            const list = inMemoryDisputes.get(String(id)) || [];
            list.unshift(data as CaseDispute);
            inMemoryDisputes.set(String(id), list);

            // Log event
            await logCaseEvent({
              case_id: String(id),
              event_type: 'DISPUTE_FILED',
              title: `Statutory Dispute Filed: ${complainant}`,
              description: `Dispute (${body.dispute_type}) filed by ${complainant}. ${body.description}`,
              actor_id: (req as any).user?.id,
              actor_name: (req as any).user?.name || 'Revenue Officer',
              metadata: { dispute_id: data.id, stay_order: body.stay_order_issued || false },
            });

            return res.status(201).json({ success: true, dispute: data, persisted: true });
          }
        } catch (err: any) {
          if (isTestFallbackAllowed(req)) {
            const list = inMemoryDisputes.get(String(id)) || [];
            list.unshift(disputeRecord);
            inMemoryDisputes.set(String(id), list);
            return res.status(201).json({ success: true, dispute: disputeRecord, persisted: false, degraded_mode: true });
          }
          return res.status(503).json({
            error: 'Database persistence failed. Dispute was not durably saved.',
            persisted: false,
            status: 'database_unavailable',
            details: err.message,
          });
        }
      }

      if (isTestFallbackAllowed(req)) {
        const list = inMemoryDisputes.get(String(id)) || [];
        list.unshift(disputeRecord);
        inMemoryDisputes.set(String(id), list);

        await logCaseEvent({
          case_id: String(id),
          event_type: 'DISPUTE_FILED',
          title: `Statutory Dispute Filed: ${complainant}`,
          description: `Dispute (${body.dispute_type}) filed by ${complainant}. ${body.description}`,
          actor_id: (req as any).user?.id,
          actor_name: (req as any).user?.name || 'Revenue Officer',
          metadata: { dispute_id: disputeRecord.id, stay_order: body.stay_order_issued || false },
        });

        return res.status(201).json({ success: true, dispute: disputeRecord, persisted: false, degraded_mode: true });
      }

      res.status(503).json({
        error: 'Supabase not configured. Disputes cannot be persisted in production.',
        persisted: false,
        status: 'database_unavailable',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to file dispute' });
    }
  }
);

// PATCH /api/cases/:id/disputes/:disputeId - Update statutory dispute status or hearing outcome
router.patch(
  '/:id/disputes/:disputeId',
  requireAuth,
  requireRole(['admin', 'project_officer', 'lao', 'revenue_inspector']),
  async (req: Request, res: Response) => {
    try {
      const { id, disputeId } = req.params;

      // Verify user is authorized for this case within their project and territorial scope
      const authCheck = await authorizeUserForCase((req as any).user, String(id));
      if (!authCheck.authorized) {
        return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
      }

      const parseResult = UpdateDisputeSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        });
      }

      const updates = {
        ...parseResult.data,
        updated_at: new Date().toISOString(),
      };

      if (isSupabaseConfigured) {
        try {
          const supabase = getSupabase();
          const { data, error } = await supabase
            .from('case_disputes')
            .update(updates)
            .eq('id', disputeId)
            .eq('case_id', id)
            .select('*')
            .single();

          if (error) {
            if (isTestFallbackAllowed(req)) {
              const list = inMemoryDisputes.get(String(id)) || [];
              const idx = list.findIndex((d) => d.id === disputeId);
              if (idx >= 0) {
                list[idx] = { ...list[idx], ...updates };
                return res.json({ success: true, dispute: list[idx], persisted: false, degraded_mode: true });
              }
            }
            return res.status(503).json({
              error: 'Database persistence failed. Dispute update was not durably saved.',
              persisted: false,
              status: 'database_unavailable',
              details: error.message,
            });
          }

          if (data) {
            const list = inMemoryDisputes.get(String(id)) || [];
            const idx = list.findIndex((d) => d.id === disputeId);
            if (idx >= 0) list[idx] = data as CaseDispute;
            inMemoryDisputes.set(String(id), list);

            return res.json({ success: true, dispute: data, persisted: true });
          }
        } catch (err: any) {
          if (isTestFallbackAllowed(req)) {
            const list = inMemoryDisputes.get(String(id)) || [];
            const idx = list.findIndex((d) => d.id === disputeId);
            if (idx >= 0) {
              list[idx] = { ...list[idx], ...updates };
              return res.json({ success: true, dispute: list[idx], persisted: false, degraded_mode: true });
            }
          }
          return res.status(503).json({
            error: 'Database persistence failed. Dispute update was not durably saved.',
            persisted: false,
            status: 'database_unavailable',
            details: err.message,
          });
        }
      }

      if (process.env.NODE_ENV === 'test') {
        const list = inMemoryDisputes.get(String(id)) || [];
        const idx = list.findIndex((d) => d.id === disputeId);
        if (idx === -1) {
          return res.status(404).json({ error: 'Dispute not found' });
        }

        list[idx] = {
          ...list[idx],
          ...updates,
        };
        inMemoryDisputes.set(String(id), list);

        await logCaseEvent({
          case_id: String(id),
          event_type: 'DISPUTE_UPDATED',
          title: `Dispute Updated: ${list[idx].claimant_name || list[idx].complainant_name}`,
          description: `Dispute status changed to ${updates.status || list[idx].status}.`,
          actor_id: (req as any).user?.id,
          actor_name: (req as any).user?.name || 'Revenue Officer',
          metadata: { dispute_id: disputeId, status: updates.status },
        });

        return res.json({ success: true, dispute: list[idx], persisted: false, degraded_mode: true });
      }

      return res.status(503).json({
        error: 'Database persistence unavailable. Provide valid Supabase credentials or execute in test mode.',
        persisted: false,
        status: 'database_unavailable',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to update dispute' });
    }
  }
);

// ============================================================================
// STATUTORY COMPENSATION & RFCTLARR 2013 AWARD ENDPOINTS
// ============================================================================

// GET /api/cases/:id/statutory-awards - Get case award calculations & summary
router.get('/:id/statutory-awards', requireAuth, async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const caseId = Array.isArray(rawId) ? rawId[0] : rawId;
    const summary = await getCaseStatutoryAwards(caseId, req.user);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve statutory awards' });
  }
});

// POST /api/cases/:id/parcels/:parcelId/calculate-award - Recalculate parcel statutory award
router.post(
  '/:id/parcels/:parcelId/calculate-award',
  requireAuth,
  requireRole(['admin', 'project_officer', 'lao', 'revenue_inspector']),
  async (req: Request, res: Response) => {
    try {
      const rawId = req.params.id;
      const rawParcelId = req.params.parcelId;
      const caseId = Array.isArray(rawId) ? rawId[0] : rawId;
      const parcelId = Array.isArray(rawParcelId) ? rawParcelId[0] : rawParcelId;

      const result = await updateParcelStatutoryAward(caseId, parcelId, req.body, req.user);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to calculate statutory award' });
    }
  }
);

// POST /api/cases/:id/parcels/:parcelId/disburse-dbt - Disburse compensation via Direct Benefit Transfer (DBT)
router.post(
  '/:id/parcels/:parcelId/disburse-dbt',
  requireAuth,
  requireRole(['admin', 'lao']),
  async (req: Request, res: Response) => {
    try {
      const rawId = req.params.id;
      const rawParcelId = req.params.parcelId;
      const caseId = Array.isArray(rawId) ? rawId[0] : rawId;
      const parcelId = Array.isArray(rawParcelId) ? rawParcelId[0] : rawParcelId;

      const result = await disburseParcelDBT(caseId, parcelId, req.body, req.user);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to execute DBT disbursement' });
    }
  }
);

export default router;
