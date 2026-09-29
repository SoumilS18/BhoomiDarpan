import { Router, Request, Response } from 'express';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { validateGeoJSON } from '../utils/geojsonValidator';
import { logCaseEvent } from '../services/auditLogger';
import { PARCEL_STATUS_COLORS } from '../../shared/utils/geojson';
import { AcquisitionCase } from '../../shared/types';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { authorizeUserForCase } from '../services/portfolioAnalyzer';
import {
  getGISOverview,
  getScopedCases,
  getScopedProjects,
  getParcelsForCase,
  getCaseSpatialContext,
  findNearbyEntities,
  generateCasesGeoJSON,
  generateProjectsGeoJSON,
  generateParcelsGeoJSON,
  computeAccurateCentroid,
  getPortfolioSpatialRelationships,
  detectSpatialAndCadastralRelationships,
  resolveSpatialConflict,
  simulateSpatialResolution,
  generateCorridorGeoJSON,
  computeCorridorAndCasesMiter,
} from '../services/spatialIntelligenceService';
import { getSpatialPolicySync } from '../services/policyEngine';

const router = Router();

// ============================================================================
// DAY 6: AUTHENTICATED GIS & SPATIAL INTELLIGENCE ENDPOINTS
// ============================================================================

// GET /api/gis/overview (or /overview) - High-level spatial overview & layer status
const handleOverview = async (req: Request, res: Response) => {
  try {
    const overview = await getGISOverview(req.user);
    res.json(overview);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
router.get('/overview', requireAuth, handleOverview);
router.get('/gis/overview', requireAuth, handleOverview);

// GET /api/gis/cases (or /cases) - GeoJSON FeatureCollection of cases with spatial filters
const handleCases = async (req: Request, res: Response) => {
  try {
    let cases = await getScopedCases(req.user);

    // Apply query filters
    const { state, district, subdistrict, tehsil, village, project_id, status, risk_level, bbox, has_geometry } = req.query;

    if (state && typeof state === 'string') {
      cases = cases.filter((c) => (c.state && c.state.toLowerCase() === state.toLowerCase()) || c.state_lgd_code === state);
    }
    if (district && typeof district === 'string') {
      cases = cases.filter((c) => (c.district && c.district.toLowerCase() === district.toLowerCase()) || c.district_lgd_code === district);
    }
    const sub = subdistrict || tehsil;
    if (sub && typeof sub === 'string') {
      cases = cases.filter((c) => (c.tehsil && c.tehsil.toLowerCase() === sub.toLowerCase()) || c.subdistrict_lgd_code === sub);
    }
    if (village && typeof village === 'string') {
      cases = cases.filter((c) => (c.village && c.village.toLowerCase() === village.toLowerCase()) || c.village_lgd_code === village);
    }
    if (project_id && typeof project_id === 'string') {
      cases = cases.filter((c) => c.project_id === project_id);
    }
    if (status && typeof status === 'string') {
      cases = cases.filter((c) => c.status === status);
    }
    if (risk_level && typeof risk_level === 'string') {
      cases = cases.filter((c) => (c as any).risk_level === risk_level);
    }
    if (has_geometry === 'true') {
      cases = cases.filter((c) => Boolean(c.geojson_boundary));
    } else if (has_geometry === 'false') {
      cases = cases.filter((c) => !c.geojson_boundary);
    }

    // Bounding box filter: bbox=minLng,minLat,maxLng,maxLat
    if (bbox && typeof bbox === 'string') {
      const parts = bbox.split(',').map(Number);
      if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
        const [minLng, minLat, maxLng, maxLat] = parts;
        cases = cases.filter((c) => {
          const centroid = computeAccurateCentroid(c.geojson_boundary);
          if (!centroid) return false;
          const [lat, lng] = centroid;
          return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
        });
      }
    }

    const featureCollection = generateCasesGeoJSON(cases);
    res.json(featureCollection);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
router.get('/cases', requireAuth, handleCases);
router.get('/gis/cases', requireAuth, handleCases);

// GET /api/gis/projects (or /projects) - GeoJSON FeatureCollection of projects
const handleProjects = async (req: Request, res: Response) => {
  try {
    const projects = await getScopedProjects(req.user);
    const cases = await getScopedCases(req.user);
    const featureCollection = generateProjectsGeoJSON(projects, cases);
    res.json(featureCollection);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
router.get('/projects', requireAuth, handleProjects);
router.get('/gis/projects', requireAuth, handleProjects);

// GET /api/gis/parcels (or /parcels) - Cadastral parcels GeoJSON
const handleParcels = async (req: Request, res: Response) => {
  try {
    // Citizens/Viewers cannot view internal cadastral parcels
    if (req.user?.role === 'viewer') {
      return res.json({ type: 'FeatureCollection', features: [] });
    }

    const { case_id } = req.query;
    if (!case_id || typeof case_id !== 'string') {
      return res.status(400).json({ error: 'case_id query parameter is required for cadastral parcels.' });
    }

    // Verify user has scope to view this case
    const scopedCases = await getScopedCases(req.user);
    const hasAccess = scopedCases.some((c) => c.id === case_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied: case is outside your authorized operational scope.' });
    }

    const parcels = await getParcelsForCase(case_id);
    const featureCollection = generateParcelsGeoJSON(parcels);
    res.json(featureCollection);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
router.get('/parcels', requireAuth, handleParcels);
router.get('/gis/parcels', requireAuth, handleParcels);

// GET /api/gis/spatial-context/:caseId - Complete case spatial context
const handleSpatialContext = async (req: Request, res: Response) => {
  try {
    const rawCaseId = req.params.caseId;
    const caseId = Array.isArray(rawCaseId) ? rawCaseId[0] : rawCaseId;
    const context = await getCaseSpatialContext(caseId, req.user);
    if (!context) {
      return res.status(404).json({ error: 'Case not found or outside authorized operational jurisdiction.' });
    }
    res.json(context);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
router.get('/spatial-context/:caseId', requireAuth, handleSpatialContext);
router.get('/gis/spatial-context/:caseId', requireAuth, handleSpatialContext);

// GET /api/gis/spatial-relationships (or /spatial-relationships) - Portfolio-wide spatial & cadastral relationships
const handlePortfolioRelationships = async (req: Request, res: Response) => {
  try {
    const summary = await getPortfolioSpatialRelationships(req.user);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
router.get('/spatial-relationships', requireAuth, handlePortfolioRelationships);
router.get('/gis/spatial-relationships', requireAuth, handlePortfolioRelationships);

// GET /api/gis/spatial-relationships/:caseId (or /spatial-relationships/:caseId) - Case-specific spatial & cadastral relationships
const handleCaseRelationships = async (req: Request, res: Response) => {
  try {
    const rawCaseId = req.params.caseId;
    const caseId = Array.isArray(rawCaseId) ? rawCaseId[0] : rawCaseId;
    const scopedCases = await getScopedCases(req.user);
    const sourceCase = scopedCases.find((c) => c.id === caseId);

    if (!sourceCase) {
      return res.status(404).json({ error: 'Case not found or outside authorized operational jurisdiction.' });
    }

    const relationships = await detectSpatialAndCadastralRelationships(sourceCase, scopedCases);
    res.json({
      case_id: sourceCase.id,
      case_number: sourceCase.case_number,
      title: sourceCase.title,
      total_relationships: relationships.length,
      relationships,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
router.get('/spatial-relationships/:caseId', requireAuth, handleCaseRelationships);
router.get('/gis/spatial-relationships/:caseId', requireAuth, handleCaseRelationships);

// GET /api/gis/nearby (or /nearby) - Proximity search around coordinate [lat, lng]
const handleNearby = async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        error: 'Valid numeric latitude [-90, 90] and longitude [-180, 180] query parameters are required.',
      });
    }

    const radiusKm = req.query.radius_km ? parseFloat(req.query.radius_km as string) : undefined;
    const nearby = await findNearbyEntities(lat, lng, radiusKm, req.user);

    res.json({
      search_center: [lat, lng],
      radius_km: radiusKm || getSpatialPolicySync().nearby_search_radius_km,
      total_found: nearby.length,
      entities: nearby,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
router.get('/nearby', requireAuth, handleNearby);
router.get('/gis/nearby', requireAuth, handleNearby);

// GET /api/gis/layers - Available layer manifest
const handleLayers = async (req: Request, res: Response) => {
  try {
    const overview = await getGISOverview(req.user);
    res.json({ layers: overview.layer_manifest });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
router.get('/layers', requireAuth, handleLayers);
router.get('/gis/layers', requireAuth, handleLayers);

export const inMemoryCorridors = new Map<string, any>();

export { generateCorridorGeoJSON, computeCorridorAndCasesMiter };

// ============================================================================
// PROJECT CORRIDOR MANAGEMENT ENDPOINTS
// ============================================================================

// GET /api/cases/:id/corridor - Get Project Corridor Details & Alignment
router.get(['/cases/:id/corridor', '/gis/cases/:id/corridor'], requireAuth, async (req: Request, res: Response) => {
  try {
    const rawCaseId = req.params.id;
    const caseId = Array.isArray(rawCaseId) ? rawCaseId[0] : rawCaseId;

    const scopedCases = await getScopedCases(req.user);
    const caseItem = scopedCases.find((c) => c.id === caseId);

    if (!caseItem) {
      return res.status(404).json({ error: 'Case not found or outside authorized operational scope.' });
    }

    const stored = inMemoryCorridors.get(caseId);
    if (stored) {
      return res.json(stored);
    }

    // Default corridor metadata derived from case and project
    const caseCentroid = computeAccurateCentroid(caseItem.geojson_boundary) || [18.5204, 73.8567];
    const defaultStart = {
      latitude: Number((caseCentroid[0] - 0.015).toFixed(6)),
      longitude: Number((caseCentroid[1] - 0.015).toFixed(6)),
      landmark: `Origin: Village ${caseItem.village || 'Sector 1'}`,
    };
    const defaultEnd = {
      latitude: Number((caseCentroid[0] + 0.015).toFixed(6)),
      longitude: Number((caseCentroid[1] + 0.015).toFixed(6)),
      landmark: `Terminus: District ${caseItem.district || 'Bypass'} Arterial`,
    };

    const defaultCorridor = {
      case_id: caseId,
      project_id: caseItem.project_id,
      project_name: caseItem.project?.name || 'Infrastructure Scheme',
      sponsoring_agency: caseItem.project?.sponsoring_agency || 'Competent Authority',
      corridor_name: `${caseItem.title} - Alignment Package`,
      corridor_type: 'highway',
      total_length_km: Math.max(5, Math.round((caseItem.total_area_hectares || 10) * 1.5)),
      right_of_way_width_meters: 550,
      start_point: defaultStart,
      end_point: defaultEnd,
      intermediate_waypoints: [],
      geojson_corridor: caseItem.geojson_boundary || generateCorridorGeoJSON(defaultStart, defaultEnd, [], 550),
      status: 'active_alignment',
      updated_at: new Date().toISOString(),
    };

    inMemoryCorridors.set(caseId, defaultCorridor);
    res.json(defaultCorridor);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve project corridor details' });
  }
});

// POST /api/cases/:id/corridor - Create or update Project Corridor Details & GIS Geometry
router.post(
  ['/cases/:id/corridor', '/gis/cases/:id/corridor'],
  requireAuth,
  requireRole(['admin', 'project_officer', 'lao', 'revenue_inspector']),
  async (req: Request, res: Response) => {
    try {
      const rawCaseId = req.params.id;
      const caseId = Array.isArray(rawCaseId) ? rawCaseId[0] : rawCaseId;

      const scopedCases = await getScopedCases(req.user);
      const caseItem = scopedCases.find((c) => c.id === caseId);

      if (!caseItem) {
        return res.status(404).json({ error: 'Case not found or outside authorized scope.' });
      }

      const body = req.body || {};
      let corridorGeoJSON = body.geojson_corridor;

      if (!corridorGeoJSON && body.start_point && body.end_point) {
        corridorGeoJSON = generateCorridorGeoJSON(
          body.start_point,
          body.end_point,
          body.intermediate_waypoints || [],
          body.right_of_way_width_meters || 550
        );
      }

      const updatedCorridor = {
        case_id: caseId,
        project_id: caseItem.project_id,
        project_name: caseItem.project?.name || 'Infrastructure Scheme',
        sponsoring_agency: body.sponsoring_agency || caseItem.project?.sponsoring_agency || 'Competent Authority',
        corridor_name: body.corridor_name || `${caseItem.title} - Alignment Package`,
        corridor_type: body.corridor_type || 'highway',
        total_length_km: Number(body.total_length_km) || 25,
        right_of_way_width_meters: Number(body.right_of_way_width_meters) || 60,
        start_point: body.start_point || { latitude: 18.5204, longitude: 73.8567, landmark: 'Origin Anchor' },
        end_point: body.end_point || { latitude: 18.5913, longitude: 73.7389, landmark: 'Terminus Anchor' },
        intermediate_waypoints: body.intermediate_waypoints || [],
        geojson_corridor: corridorGeoJSON,
        status: 'active_alignment',
        updated_at: new Date().toISOString(),
      };

      inMemoryCorridors.set(caseId, updatedCorridor);

      // Also update case geojson_boundary if generated
      if (corridorGeoJSON) {
        caseItem.geojson_boundary = corridorGeoJSON;
        if (isSupabaseConfigured) {
          try {
            const supabase = getSupabase();
            await supabase
              .from('acquisition_cases')
              .update({ geojson_boundary: corridorGeoJSON })
              .eq('id', caseId);
          } catch {
            // Memory store updated
          }
        }
      }

      await logCaseEvent({
        case_id: caseId,
        event_type: 'CASE_UPDATED',
        title: `Project Corridor Configured: ${updatedCorridor.corridor_name}`,
        description: `Alignment span of ${updatedCorridor.total_length_km} km with ${updatedCorridor.right_of_way_width_meters}m RoW buffer projected to GIS layer.`,
        actor_name: req.user?.full_name || 'Revenue Officer',
        metadata: {
          corridor_type: updatedCorridor.corridor_type,
          span_km: updatedCorridor.total_length_km,
          row_width_meters: updatedCorridor.right_of_way_width_meters,
        },
      });

      res.json({
        success: true,
        message: 'Project corridor alignment and Right-of-Way buffer saved and projected to GIS map!',
        corridor: updatedCorridor,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update project corridor details' });
    }
  }
);

// ============================================================================
// CASE GIS ENDPOINTS
// ============================================================================

// GET /api/cases/:id/gis - Get combined FeatureCollection of case boundary, corridor & parcels
router.get(['/cases/:id/gis', '/gis/cases/:id'], requireAuth, async (req: Request, res: Response) => {
  try {
    const rawCaseId = req.params.id;
    const caseId = Array.isArray(rawCaseId) ? rawCaseId[0] : rawCaseId;

    const scopedCases = await getScopedCases(req.user);
    let caseItem = scopedCases.find((c) => c.id === caseId);
    let parcels: any[] = [];

    if (isSupabaseConfigured) {
      try {
        const supabase = getSupabase();
        const { data: dbCase } = await supabase
          .from('acquisition_cases')
          .select('id, case_number, title, total_area_hectares, geojson_boundary')
          .eq('id', caseId)
          .single();

        if (dbCase) caseItem = { ...caseItem, ...dbCase } as any;

        const { data: dbParcels } = await supabase
          .from('parcels')
          .select('*')
          .eq('case_id', caseId)
          .order('created_at', { ascending: true });

        if (dbParcels) parcels = dbParcels;
      } catch {
        // Fall back to memory store
      }
    }

    if (!caseItem) {
      return res.status(404).json({ error: 'Case not found or outside authorized operational jurisdiction.' });
    }

    if (parcels.length === 0) {
      parcels = await getParcelsForCase(caseId);
    }

    const features: any[] = [];

    // 1. Add Case Boundary Feature if present
    if (caseItem.geojson_boundary) {
      const boundaryGeom =
        caseItem.geojson_boundary.type === 'Feature'
          ? caseItem.geojson_boundary.geometry
          : caseItem.geojson_boundary.type === 'FeatureCollection'
          ? caseItem.geojson_boundary.features[0]?.geometry
          : caseItem.geojson_boundary;

      if (boundaryGeom) {
        features.push({
          type: 'Feature',
          id: `boundary-${caseItem.id}`,
          properties: {
            layer_type: 'case_boundary',
            case_number: caseItem.case_number,
            title: caseItem.title,
            total_area_hectares: caseItem.total_area_hectares,
          },
          geometry: boundaryGeom,
        });
      }
    }

    // 2. Add Parcel Features
    (parcels || []).forEach((p: any) => {
      if (p.geojson_geometry) {
        const parcelGeom =
          p.geojson_geometry.type === 'Feature'
            ? p.geojson_geometry.geometry
            : p.geojson_geometry;

        const statusColor = PARCEL_STATUS_COLORS[p.acquisition_status] || PARCEL_STATUS_COLORS.identified;

        features.push({
          type: 'Feature',
          id: `parcel-${p.id}`,
          properties: {
            layer_type: 'parcel',
            parcel_id: p.id,
            survey_number: p.survey_number,
            khata_number: p.khata_number,
            landowner_names: p.landowner_names,
            land_type: p.land_type,
            area_acres: p.area_acres,
            compensation_amount: p.compensation_amount,
            acquisition_status: p.acquisition_status,
            color: statusColor.stroke,
            fillColor: statusColor.fill,
          },
          geometry: parcelGeom,
        });
      }
    });

    // 3. Detect and include Spatial & Cadastral Relationships
    const fullSourceCase = (scopedCases.find((c) => c.id === caseId) || caseItem) as any as AcquisitionCase;
    const relationships = await detectSpatialAndCadastralRelationships(fullSourceCase, scopedCases);

    relationships.forEach((rel) => {
      // Add intersection geometry feature if available
      if (rel.intersection_geojson) {
        features.push({
          type: 'Feature',
          id: `intersection-${rel.related_case_id}`,
          properties: {
            layer_type: 'relationship_intersection',
            related_case_id: rel.related_case_id,
            related_case_number: rel.related_case_number,
            related_project_name: rel.related_project_name,
            relationship_type: rel.relationship_type,
            intersection_area_hectares: rel.intersection_area_hectares,
            overlap_pct: rel.overlap_pct,
            shared_survey_numbers: rel.shared_survey_numbers,
            alternative_solutions: rel.alternative_solutions,
            color: '#dc2626', // Red warning
            fillColor: '#ef4444',
          },
          geometry: rel.intersection_geojson,
        });
      }

      // Add related case boundary if overlapping
      if (rel.relationship_type === 'boundary_overlap' || rel.relationship_type === 'complete_enclosure') {
        const relatedCase = scopedCases.find((c) => c.id === rel.related_case_id);
        if (relatedCase?.geojson_boundary) {
          const relGeom =
            relatedCase.geojson_boundary.type === 'Feature'
              ? relatedCase.geojson_boundary.geometry
              : relatedCase.geojson_boundary.type === 'FeatureCollection'
              ? relatedCase.geojson_boundary.features[0]?.geometry
              : relatedCase.geojson_boundary;

          if (relGeom) {
            features.push({
              type: 'Feature',
              id: `related-boundary-${rel.related_case_id}`,
              properties: {
                layer_type: 'related_case_boundary',
                related_case_id: rel.related_case_id,
                related_case_number: rel.related_case_number,
                related_project_name: rel.related_project_name,
                relationship_type: rel.relationship_type,
                color: '#f59e0b', // Amber
                fillColor: '#fbbf24',
              },
              geometry: relGeom,
            });
          }
        }
      }
    });

    const featureCollection = {
      type: 'FeatureCollection',
      features,
    };

    res.json({
      case_id: caseId,
      has_geometry: features.length > 0,
      total_parcels: parcels?.length || 0,
      parcels_with_geometry: features.filter((f) => f.properties.layer_type === 'parcel').length,
      spatial_relationships: relationships,
      gis_data: featureCollection,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cases/:id/geojson - Save/update case boundary GeoJSON
router.post('/cases/:id/geojson', requireAuth, requireRole(['admin', 'project_officer', 'lao', 'revenue_inspector']), async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { id: caseId } = req.params;
    const { geojson, actorName } = req.body;

    if (!geojson) {
      return res.status(400).json({ error: 'geojson object is required' });
    }

    // Strictly validate GeoJSON structure
    const validation = validateGeoJSON(geojson);
    if (!validation.valid) {
      return res.status(400).json({
        error: `Invalid GeoJSON: ${validation.error}`,
      });
    }

    const supabase = getSupabase();

    const { data: updatedCase, error } = await supabase
      .from('acquisition_cases')
      .update({
        geojson_boundary: geojson,
      })
      .eq('id', caseId)
      .select('id, case_number, title, geojson_boundary')
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Log audit event
    await logCaseEvent({
      case_id: typeof caseId === 'string' ? caseId : (caseId as any)[0],
      event_type: 'CASE_BOUNDARY_UPDATED',
      title: 'Case Spatial Boundary Demarcated',
      description: `Spatial boundary (${validation.type}) validated and saved.`,
      actor_name: actorName || 'GIS Specialist',
      metadata: {
        geojson_type: validation.type,
        bbox: validation.bbox,
      },
    });

    res.json({
      success: true,
      message: 'Case boundary geometry successfully updated.',
      case: updatedCase,
      bbox: validation.bbox,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cases/:id/resolve-spatial-conflict - Execute statutory conflict resolution or physical clearance offset
const handleResolveSpatialConflict = async (req: Request, res: Response) => {
  try {
    const { id: caseId } = req.params;
    const {
      related_case_id,
      strategy_type,
      statutory_order_reference,
      notes,
      actor_name,
      buffer_meters,
      shift_direction,
    } = req.body;

    if (!related_case_id || !strategy_type || !statutory_order_reference) {
      return res.status(400).json({
        error: 'related_case_id, strategy_type, and statutory_order_reference are required.',
      });
    }

    const result = await resolveSpatialConflict({
      caseId: typeof caseId === 'string' ? caseId : (caseId as any)[0],
      relatedCaseId: related_case_id,
      strategyType: strategy_type,
      statutoryOrderReference: statutory_order_reference,
      notes,
      actorName: actor_name,
      bufferMeters: buffer_meters ? Number(buffer_meters) : undefined,
      shiftDirection: shift_direction,
      user: req.user,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
router.post('/cases/:id/resolve-spatial-conflict', requireAuth, requireRole(['admin', 'project_officer', 'lao', 'revenue_inspector']), handleResolveSpatialConflict);
router.post('/gis/cases/:id/resolve-spatial-conflict', requireAuth, requireRole(['admin', 'project_officer', 'lao', 'revenue_inspector']), handleResolveSpatialConflict);

// POST /api/cases/:id/simulate-spatial-resolution - Simulate proposed clearance/resolution before execution
const handleSimulateSpatialResolution = async (req: Request, res: Response) => {
  try {
    const rawCaseId = req.params.id;
    const caseId = Array.isArray(rawCaseId) ? rawCaseId[0] : rawCaseId;
    const { related_case_id, strategy_type, buffer_meters, shift_direction } = req.body;

    const scopedCases = await getScopedCases(req.user);
    const sourceCase = scopedCases.find((c) => c.id === caseId);
    const relatedCase = scopedCases.find((c) => c.id === related_case_id);

    if (!sourceCase) {
      return res.status(404).json({ error: 'Source case not found or outside authorized jurisdiction.' });
    }

    const simulation = simulateSpatialResolution(
      sourceCase.geojson_boundary,
      relatedCase?.geojson_boundary,
      {
        strategyType: strategy_type || 'boundary_offset_clearance',
        shiftDirection: shift_direction,
        bufferMeters: buffer_meters !== undefined ? Number(buffer_meters) : undefined,
        sourceTotalAreaHa: sourceCase.total_area_hectares,
      }
    );

    res.json(simulation);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
router.post('/cases/:id/simulate-spatial-resolution', requireAuth, handleSimulateSpatialResolution);
router.post('/gis/cases/:id/simulate-spatial-resolution', requireAuth, handleSimulateSpatialResolution);

// POST /api/cases/:id/parcels - Add parcel with optional geometry
router.post('/cases/:id/parcels', requireAuth, requireRole(['admin', 'project_officer', 'lao', 'revenue_inspector']), async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { id: caseId } = req.params;

    // Verify user is authorized for this case within project and territorial scope
    const authCheck = await authorizeUserForCase((req as any).user, String(caseId));
    if (!authCheck.authorized) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }
    const {
      survey_number,
      khata_number,
      landowner_names,
      land_type,
      area_acres,
      compensation_amount,
      acquisition_status,
      geojson_geometry,
      actorName,
    } = req.body;

    if (!survey_number || typeof survey_number !== 'string' || survey_number.trim().length === 0) {
      return res.status(400).json({ error: 'survey_number is required and cannot be empty' });
    }

    const area = Number(area_acres);
    if (isNaN(area) || area <= 0) {
      return res.status(400).json({ error: 'area_acres must be a positive number' });
    }

    // If geometry is provided, strictly validate it
    if (geojson_geometry) {
      const validation = validateGeoJSON(geojson_geometry);
      if (!validation.valid) {
        return res.status(400).json({ error: `Invalid parcel geometry: ${validation.error}` });
      }
    }

    const supabase = getSupabase();

    const { data: newParcel, error } = await supabase
      .from('parcels')
      .insert({
        case_id: caseId,
        survey_number: survey_number.trim(),
        khata_number: khata_number ? String(khata_number).trim() : null,
        landowner_names: Array.isArray(landowner_names)
          ? landowner_names.filter((n) => typeof n === 'string' && n.trim().length > 0)
          : [],
        land_type: land_type || 'Agricultural',
        area_acres: area,
        compensation_amount: Number(compensation_amount || 0),
        acquisition_status: acquisition_status || 'identified',
        geojson_geometry: geojson_geometry || null,
      })
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Log audit event
    await logCaseEvent({
      case_id: typeof caseId === 'string' ? caseId : (caseId as any)[0],
      event_type: 'PARCEL_REGISTERED',
      title: `Cadastral Parcel Registered: Survey #${newParcel.survey_number}`,
      description: `Registered ${newParcel.area_acres} acres for survey #${newParcel.survey_number} with status ${newParcel.acquisition_status}.`,
      actor_name: actorName || 'Revenue Officer',
      metadata: {
        parcel_id: newParcel.id,
        survey_number: newParcel.survey_number,
        has_geometry: Boolean(geojson_geometry),
      },
    });

    res.status(201).json({ parcel: newParcel });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/cases/:id/parcels/:parcelId - Update parcel
router.patch('/cases/:id/parcels/:parcelId', requireAuth, requireRole(['admin', 'project_officer', 'lao', 'revenue_inspector', 'approver']), async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { id: caseId, parcelId } = req.params;

    // Verify user is authorized for this case within project and territorial scope
    const authCheck = await authorizeUserForCase((req as any).user, String(caseId));
    if (!authCheck.authorized) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const {
      survey_number,
      khata_number,
      landowner_names,
      land_type,
      area_acres,
      compensation_amount,
      acquisition_status,
      geojson_geometry,
      actorName,
    } = req.body;

    const updates: any = {};
    if (survey_number !== undefined) updates.survey_number = String(survey_number).trim();
    if (khata_number !== undefined) updates.khata_number = khata_number ? String(khata_number).trim() : null;
    if (landowner_names !== undefined) updates.landowner_names = Array.isArray(landowner_names) ? landowner_names : [];
    if (land_type !== undefined) updates.land_type = land_type;
    if (area_acres !== undefined) updates.area_acres = Number(area_acres);
    if (compensation_amount !== undefined) updates.compensation_amount = Number(compensation_amount);
    if (acquisition_status !== undefined) updates.acquisition_status = acquisition_status;

    if (geojson_geometry !== undefined) {
      if (geojson_geometry === null) {
        updates.geojson_geometry = null;
      } else {
        const validation = validateGeoJSON(geojson_geometry);
        if (!validation.valid) {
          return res.status(400).json({ error: `Invalid parcel geometry: ${validation.error}` });
        }
        updates.geojson_geometry = geojson_geometry;
      }
    }

    const supabase = getSupabase();

    const { data: updatedParcel, error } = await supabase
      .from('parcels')
      .update(updates)
      .eq('id', parcelId)
      .eq('case_id', caseId)
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    await logCaseEvent({
      case_id: typeof caseId === 'string' ? caseId : (caseId as any)[0],
      event_type: 'PARCEL_UPDATED',
      title: `Parcel Updated: Survey #${updatedParcel.survey_number}`,
      description: `Updated parcel status to ${updatedParcel.acquisition_status}.`,
      actor_name: actorName || (req as any).user?.name || (req as any).user?.full_name || 'Revenue Officer',
      actor_id: (req as any).user?.id,
      metadata: { parcel_id: parcelId, updates },
    });

    res.json({ parcel: updatedParcel });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cases/:id/parcels/:parcelId - Delete parcel
router.delete('/cases/:id/parcels/:parcelId', requireAuth, requireRole(['admin', 'project_officer', 'lao', 'revenue_inspector']), async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { id: caseId, parcelId } = req.params;

    // Verify user is authorized for this case within project and territorial scope
    const authCheck = await authorizeUserForCase((req as any).user, String(caseId));
    if (!authCheck.authorized) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const supabase = getSupabase();

    const { data: parcel, error: fetchErr } = await supabase
      .from('parcels')
      .select('id, survey_number')
      .eq('id', parcelId)
      .eq('case_id', caseId)
      .single();

    if (fetchErr || !parcel) {
      return res.status(404).json({ error: 'Parcel not found in this case' });
    }

    const { error } = await supabase
      .from('parcels')
      .delete()
      .eq('id', parcelId)
      .eq('case_id', caseId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    await logCaseEvent({
      case_id: typeof caseId === 'string' ? caseId : (caseId as any)[0],
      event_type: 'PARCEL_REMOVED',
      title: `Parcel Removed: Survey #${parcel?.survey_number || parcelId}`,
      description: `Parcel record removed from case by ${(req as any).user?.name || 'Revenue Officer'}.`,
      actor_name: (req as any).user?.name || (req as any).user?.full_name || 'Revenue Officer',
      actor_id: (req as any).user?.id,
      metadata: { parcel_id: parcelId, survey_number: parcel?.survey_number },
    });

    res.json({ success: true, message: 'Parcel removed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
