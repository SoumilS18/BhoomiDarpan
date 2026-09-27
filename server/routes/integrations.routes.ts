import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  listDataSources,
  getDataSource,
  updateDataSource,
  testDataSourceConnectivity,
} from '../services/dataSourceRegistry';
import {
  getProvenanceForEntity,
  verifyProvenance,
} from '../services/provenanceService';
import { geocodingService } from '../services/geocodingService';
import {
  getStates,
  getDistricts,
  getSubDistricts,
  getVillages,
  getLocalities,
  getGeographyProvenance,
  createSubDistrict,
} from '../services/administrativeGeographyService';
import { CreateSubDistrictSchema } from '../utils/validators';
import { executeImportPipeline } from '../services/dataImportPipeline';
import { syncSource } from '../services/synchronizationService';
import { listDiscrepancies, resolveDiscrepancy } from '../services/discrepancyDetector';
import { getCachedObservation } from '../services/weatherAdapter';
import { routingService } from '../services/routingService';
import { satelliteService } from '../services/satelliteService';
import { translationService } from '../services/translationService';
import { getIntegrationPolicy, updateIntegrationPolicy } from '../services/policyEngine';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.middleware';

const router = Router();
const OUTBOUND_WINDOW_MS = 60_000;
const OUTBOUND_MAX_REQUESTS_PER_WINDOW = 120;
const outboundRequestBuckets = new Map<string, { count: number; resetAt: number }>();

function requireOutboundQuota(req: Request, res: Response, next: () => void) {
  const user = (req as any).user;
  const key = user?.id || req.ip || 'anonymous';
  const now = Date.now();
  const current = outboundRequestBuckets.get(key);
  const bucket = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + OUTBOUND_WINDOW_MS };

  bucket.count += 1;
  outboundRequestBuckets.set(key, bucket);

  if (bucket.count > OUTBOUND_MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: 'External integration request limit exceeded. Please retry after the current one-minute window.',
      code: 'EXTERNAL_INTEGRATION_RATE_LIMITED',
      retry_after_seconds: Math.ceil((bucket.resetAt - now) / 1000),
    });
  }

  next();
}

// ============================================================================
// 1. DATA SOURCES REGISTRY
// ============================================================================

// GET /api/data-sources - List all registered sources with live operational status
router.get('/data-sources', optionalAuth, async (_req: Request, res: Response) => {
  try {
    const sources = await listDataSources();
    res.json({ sources, count: sources.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list data sources' });
  }
});

// GET /api/integrations/sources - List all registered sources (Day 8 statutory integration alias)
router.get('/integrations/sources', optionalAuth, async (_req: Request, res: Response) => {
  try {
    const sources = await listDataSources();
    res.json({ sources, count: sources.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list data sources' });
  }
});

// GET /api/data-sources/:id - Get source details
router.get('/data-sources/:id', optionalAuth, async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const source = await getDataSource(id);
    if (!source) {
      return res.status(404).json({ error: `Data source "${id}" not found` });
    }
    res.json({ source });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/data-sources/:id - Enable/disable or configure source (Admin only)
router.patch('/data-sources/:id', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const { is_enabled, sync_mode, metadata } = req.body;
    const updated = await updateDataSource(id, { is_enabled, sync_mode, metadata });
    if (!updated) {
      return res.status(404).json({ error: `Data source "${id}" not found` });
    }
    res.json({ success: true, source: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/data-sources/:id/test - Perform live handshake test
router.post('/data-sources/:id/test', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const result = await testDataSourceConnectivity(id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 2. DATA PROVENANCE
// ============================================================================

// GET /api/provenance/:entityType/:entityId - Retrieve origin & audit trail
router.get('/provenance/:entityType/:entityId', async (req: Request, res: Response) => {
  try {
    const entityType = String(req.params.entityType);
    const entityId = String(req.params.entityId);
    const provenance = await getProvenanceForEntity(entityType, entityId);
    res.json({ provenance, count: provenance.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/provenance/:id/verify - Human verification
router.post('/provenance/:id/verify', requireAuth, requireRole(['admin', 'project_officer', 'lao']), async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const { status, notes } = req.body;
    const verifier = (req as any).user?.full_name || 'Authorized Officer';

    if (!['human_verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "human_verified" or "rejected"' });
    }

    const updated = await verifyProvenance(id, status, verifier, notes);
    if (!updated) {
      return res.status(404).json({ error: 'Provenance record not found' });
    }

    res.json({ success: true, provenance: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 3. GEOCODING ADAPTER
// ============================================================================

// GET /api/geocoding/forward?q=...
router.get('/geocoding/forward', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const limit = req.query.limit ? Number(req.query.limit) : 5;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const results = await geocodingService.forwardGeocode(query, { limit });
    res.json({ results, count: results.length, provider: geocodingService.getProviderName() });
  } catch (err: any) {
    res.status(500).json({ error: err.message, provider: geocodingService.getProviderName() });
  }
});

// GET /api/geocoding/reverse?lat=...&lng=...
router.get('/geocoding/reverse', async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Valid numeric "lat" and "lng" parameters are required' });
    }

    const result = await geocodingService.reverseGeocode(lat, lng);
    if (!result) {
      return res.status(404).json({ error: 'No location details found for coordinates' });
    }

    res.json({ result, provider: geocodingService.getProviderName() });
  } catch (err: any) {
    res.status(500).json({ error: err.message, provider: geocodingService.getProviderName() });
  }
});

// ============================================================================
// 4. ADMINISTRATIVE GEOGRAPHY
// ----------------------------------------------------------------------------
// Every response carries `provenance`. When the authoritative LGD source has
// not been ingested, `provenance.authoritative` is false and the collections
// are EMPTY — the API never substitutes a bundled reference subset so that a
// partial hierarchy can pass for production data.
// ============================================================================

async function geographyEnvelope() {
  return { provenance: await getGeographyProvenance() };
}

// GET /api/geography/status — honest availability of the authoritative source
router.get('/geography/status', async (_req: Request, res: Response) => {
  try {
    res.json(await geographyEnvelope());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/geography/states
router.get('/geography/states', async (_req: Request, res: Response) => {
  try {
    const states = await getStates();
    res.json({ states, count: states.length, ...(await geographyEnvelope()) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/geography/districts?state=... or state_code=...
router.get('/geography/districts', async (req: Request, res: Response) => {
  try {
    const stateCode = (req.query.state || req.query.state_code) as string;
    if (!stateCode) {
      return res.status(400).json({ error: 'state or state_code query parameter is required' });
    }
    const districts = await getDistricts(stateCode);
    res.json({ districts, count: districts.length, ...(await geographyEnvelope()) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/geography/subdistricts?district=... or district_code=...
router.get(['/geography/subdistricts', '/geography/sub-districts'], async (req: Request, res: Response) => {
  try {
    const districtCode = (req.query.district || req.query.district_code) as string;
    if (!districtCode) {
      return res.status(400).json({ error: 'district or district_code query parameter is required' });
    }
    const subdistricts = await getSubDistricts(districtCode);
    res.json({ subdistricts, count: subdistricts.length, ...(await geographyEnvelope()) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/geography/subdistricts — Add missing Sub-District / Tehsil (Authorized Officers only)
router.post(
  ['/geography/subdistricts', '/geography/sub-districts'],
  requireAuth,
  requireRole(['admin', 'lao', 'project_officer', 'revenue_inspector']),
  async (req: Request, res: Response) => {
    try {
      const parseResult = CreateSubDistrictSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        });
      }

      const { name, code, state_code, district_code, local_name } = parseResult.data;
      const user = (req as any).user;

      // Enforce territorial jurisdiction scoping for jurisdiction-bound roles
      if (user) {
        if (user.jurisdiction_state_lgd_code && user.jurisdiction_state_lgd_code !== state_code) {
          return res.status(403).json({
            error: `Territorial jurisdiction mismatch: User is restricted to state "${user.jurisdiction_state_lgd_code}".`,
          });
        }
        if (user.jurisdiction_district_lgd_code && user.jurisdiction_district_lgd_code !== district_code) {
          return res.status(403).json({
            error: `Territorial jurisdiction mismatch: User is restricted to district "${user.jurisdiction_district_lgd_code}".`,
          });
        }
      }

      const createdUnit = await createSubDistrict({
        name,
        code,
        state_code,
        district_code,
        local_name,
        created_by: user?.full_name || 'Authorized Officer',
      });

      res.status(201).json({
        success: true,
        subdistrict: createdUnit,
        ...(await geographyEnvelope()),
      });
    } catch (err: any) {
      const isConflict =
        err.message?.includes('already exists') ||
        err.message?.includes('duplicate key') ||
        err.message?.includes('uq_admin_unit_type_code');
      const status = isConflict ? 409 : 400;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/geography/localities?subdistrict=...&search=...
// Server-side search + pagination: the browser never loads the full village
// tier (720k+ rows), and the search runs against ingested LGD codes only.
router.get(['/geography/localities', '/geography/villages'], async (req: Request, res: Response) => {
  try {
    const subDistrictCode = (req.query.subdistrict || req.query.sub_district || req.query.code) as string;
    if (!subDistrictCode) {
      return res.status(400).json({ error: 'subdistrict query parameter is required' });
    }
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    const search = (req.query.search || req.query.q) ? String(req.query.search || req.query.q) : undefined;
    const result = await getVillages(subDistrictCode, { page, limit, search });
    res.json({
      sub_district_code: subDistrictCode,
      localities: result.villages,
      ...result,
      ...(await geographyEnvelope()),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// 5. DATA IMPORT PIPELINE
// ============================================================================

// POST /api/import/batch - Ingest structured datasets (Admin / Officers)
router.post('/import/batch', requireAuth, requireRole(['admin', 'project_officer', 'lao']), async (req: Request, res: Response) => {
  try {
    const { raw_data, batch_type, format, source_id, source_record_ref } = req.body;

    if (!raw_data) {
      return res.status(400).json({ error: 'raw_data is required' });
    }

    if (!['administrative_units', 'parcels'].includes(batch_type)) {
      return res.status(400).json({ error: 'batch_type must be "administrative_units" or "parcels"' });
    }

    if (!['json', 'csv', 'geojson'].includes(format)) {
      return res.status(400).json({ error: 'format must be "json", "csv", or "geojson"' });
    }

    const summary = await executeImportPipeline(raw_data, {
      batchType: batch_type,
      format,
      sourceId: source_id || 'manual_upload',
      sourceRecordRef: source_record_ref,
      createdBy: (req as any).user?.full_name,
    });

    res.status(201).json({ summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 6. SYNCHRONIZATION & DISCREPANCIES
// ============================================================================

// POST /api/data-sources/:id/sync - Trigger on-demand synchronization (Officer / Admin)
router.post('/data-sources/:id/sync', requireAuth, requireRole(['admin', 'project_officer', 'lao']), async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const { coordinates, entityType, entityId } = req.body || {};
    const result = await syncSource(id, {
      coordinates,
      entityType,
      entityId,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Sync failed' });
  }
});

// GET /api/discrepancies - List cross-source discrepancies
router.get('/discrepancies', optionalAuth, async (req: Request, res: Response) => {
  try {
    const entityType = req.query.entity_type as string | undefined;
    const entityId = req.query.entity_id as string | undefined;
    const resolutionState = req.query.resolution_state as any;

    const discrepancies = await listDiscrepancies({
      entityType,
      entityId,
      resolutionState,
    });
    res.json({ discrepancies, count: discrepancies.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/discrepancies/:id - Resolve discrepancy (Officer / Admin)
router.patch('/discrepancies/:id', requireAuth, requireRole(['admin', 'project_officer', 'lao']), async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const { state, notes } = req.body;
    const resolvedBy = (req as any).user?.full_name || 'Authorized Officer';

    if (!['acknowledged', 'resolved', 'dismissed'].includes(state)) {
      return res.status(400).json({ error: 'Valid resolution state (acknowledged, resolved, dismissed) required' });
    }

    const updated = await resolveDiscrepancy(id, {
      state,
      notes,
      resolvedBy,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Discrepancy record not found' });
    }

    res.json({ success: true, discrepancy: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/observations - Get observation details by entity
router.get('/observations', optionalAuth, async (req: Request, res: Response) => {
  try {
    const entityType = req.query.entity_type as string;
    const entityId = req.query.entity_id as string;

    if (!entityType || !entityId) {
      return res.status(400).json({ error: 'entity_type and entity_id query parameters are required' });
    }

    const obs = await getCachedObservation(entityType, entityId);
    if (!obs) {
      return res.status(404).json({ error: 'No observations found for specified entity' });
    }

    res.json({ observation: obs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 7. DAY 8: EXTERNAL INTEGRATIONS (ROUTING, SATELLITE, TRANSLATION, POLICY)
// ============================================================================

const LatLngPointSchema = z
  .object({
    lat: z.number().finite('Latitude must be a finite number').min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
    lng: z.number().finite('Longitude must be a finite number').min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
  })
  .strict();

const CalculateRouteSchema = z
  .object({
    origin: LatLngPointSchema,
    destination: LatLngPointSchema,
    profile: z.enum(['driving', 'walking', 'cycling']).optional().default('driving'),
    waypoints: z.array(LatLngPointSchema).max(25).optional(),
  })
  .strict();

// POST /api/integrations/routing/calculate - Calculate normalized road route
router.post(
  '/integrations/routing/calculate',
  // optionalAuth: anonymous callers are still constrained by requireOutboundQuota +
  // strict schema; validation errors must surface as HTTP 400 regardless of auth.
  optionalAuth,
  requireOutboundQuota,
  async (req: Request, res: Response) => {
  try {
    const parseResult = CalculateRouteSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid route calculation input coordinates or profile.',
        details: parseResult.error.flatten(),
      });
    }

    const route = await routingService.calculateRoute(parseResult.data);
    res.json(route);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Route calculation failed' });
  }
  }
);

// GET /api/integrations/satellite/layers - List active satellite map layers
router.get('/integrations/satellite/layers', optionalAuth, async (_req: Request, res: Response) => {
  try {
    const layers = satelliteService.getAvailableLayers();
    res.json({ layers, count: layers.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list satellite layers' });
  }
});

// GET /api/integrations/bhuvan/catalogue - Data-driven catalogue of verified Bhuvan layers
router.get('/integrations/bhuvan/catalogue', optionalAuth, async (req: Request, res: Response) => {
  try {
    const workspace = req.query.workspace as string | undefined;
    const catalogue = satelliteService.getBhuvanCatalogue();
    const filtered = workspace ? catalogue.filter(l => l.workspace === workspace) : catalogue;
    res.json({
      catalogue: filtered,
      count: filtered.length,
      verified_count: filtered.filter(l => l.verification_status === 'verified').length,
      attribution: 'ISRO / NRSC Bhuvan',
      disclaimer: 'Thematic reference spatial data. Not cadastral ground truth. Intended for planning and development purposes only.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve Bhuvan catalogue' });
  }
});

const BhuvanResolveLayersSchema = z
  .object({
    state_codes: z.array(z.string().max(10)).optional(),
    state_names: z.array(z.string().max(100)).optional(),
    bbox: z
      .tuple([
        z.number().finite().min(-180).max(180),
        z.number().finite().min(-90).max(90),
        z.number().finite().min(-180).max(180),
        z.number().finite().min(-90).max(90),
      ])
      .optional(),
    workspace: z.enum(['lulc', 'disaster', 'admin', 'vector', 'moef', 'pmgsy']).optional(),
  })
  .strict();

// POST /api/integrations/bhuvan/resolve-layers - Dynamically resolve Bhuvan layers for jurisdiction
router.post('/integrations/bhuvan/resolve-layers', optionalAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = BhuvanResolveLayersSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid layer resolution parameters.',
        details: parseResult.error.flatten(),
      });
    }

    const result = satelliteService.resolveBhuvanLayers(parseResult.data as any);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to resolve Bhuvan layers' });
  }
});

// GET /api/integrations/bhuvan/health - Fast health check of Bhuvan workspace
router.get('/integrations/bhuvan/health', optionalAuth, async (_req: Request, res: Response) => {
  try {
    const health = await satelliteService.getBhuvanHealth();
    res.json(health);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to check Bhuvan health' });
  }
});

// GET /api/integrations/satellite/imagery-metadata - Search Sentinel-2 STAC metadata
router.get(
  '/integrations/satellite/imagery-metadata',
  optionalAuth,
  requireOutboundQuota,
  async (req: Request, res: Response) => {
  try {
    const bboxQuery = req.query.bbox as string;
    if (!bboxQuery) {
      return res.status(400).json({
        error: 'Query parameter "bbox" is required as "minLng,minLat,maxLng,maxLat" (WGS-84).',
      });
    }

    const parts = bboxQuery.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length !== 4 || parts.some((n) => isNaN(n) || !isFinite(n))) {
      return res.status(400).json({
        error: 'bbox must contain exactly 4 valid numbers: minLng,minLat,maxLng,maxLat.',
      });
    }

    const bbox: [number, number, number, number] = [parts[0], parts[1], parts[2], parts[3]];
    const maxCloud = req.query.max_cloud_cover ? parseFloat(req.query.max_cloud_cover as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;

    const fromDate = req.query.date_from as string | undefined;
    const toDate = req.query.date_to as string | undefined;
    const dateRange = fromDate || toDate ? { from: fromDate || '', to: toDate || '' } : undefined;

    const metadata = await satelliteService.searchImageryMetadata(bbox, {
      maxCloudCover: isNaN(maxCloud as number) ? undefined : maxCloud,
      limit: isNaN(limit) ? 5 : limit,
      dateRange,
    });

    res.json(metadata);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Satellite metadata search failed' });
  }
  }
);

const SatelliteMetadataPostSchema = z
  .object({
    bbox: z.tuple([
      z.number().finite().min(-180).max(180),
      z.number().finite().min(-90).max(90),
      z.number().finite().min(-180).max(180),
      z.number().finite().min(-90).max(90),
    ]),
    dateRange: z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .strict()
      .optional(),
    maxCloudCover: z.number().finite().min(0).max(100).optional(),
    limit: z.number().int().min(1).max(50).optional().default(5),
  })
  .strict();

// POST /api/integrations/satellite/imagery-metadata - Search Sentinel-2 STAC metadata via POST body
router.post(
  '/integrations/satellite/imagery-metadata',
  optionalAuth,
  requireOutboundQuota,
  async (req: Request, res: Response) => {
  try {
    const parseResult = SatelliteMetadataPostSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'JSON body must include valid "bbox": [minLng, minLat, maxLng, maxLat].',
        details: parseResult.error.flatten(),
      });
    }

    const { bbox, dateRange, maxCloudCover, limit } = parseResult.data;
    const mappedDateRange = dateRange && (dateRange.from || dateRange.to)
      ? { from: dateRange.from || '', to: dateRange.to || '' }
      : undefined;
    const metadata = await satelliteService.searchImageryMetadata(bbox, {
      dateRange: mappedDateRange,
      maxCloudCover,
      limit,
    });

    res.json(metadata);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Satellite metadata search failed' });
  }
  }
);

const TranslateTextSchema = z
  .object({
    text: z.string().min(1, 'Text cannot be empty').max(10000, 'Text exceeds maximum length of 10,000 characters'),
    source_language: z.string().max(10).optional().default('en'),
    target_language: z.string().min(2, 'Target language code must be provided (e.g., "hi", "mr", "en")').max(10),
    domain: z.enum(['legal', 'land_revenue', 'general']).optional().default('land_revenue'),
  })
  .strict();

// POST /api/integrations/translation/translate - Multilingual notice & document translation
router.post(
  '/integrations/translation/translate',
  optionalAuth,
  requireOutboundQuota,
  async (req: Request, res: Response) => {
  try {
    const parseResult = TranslateTextSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid translation request body.',
        details: parseResult.error.flatten(),
      });
    }

    const result = await translationService.translate(parseResult.data);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Translation processing failed' });
  }
  }
);

// GET /api/integrations/policy - Retrieve active statutory IntegrationPolicy
router.get('/integrations/policy', optionalAuth, async (_req: Request, res: Response) => {
  try {
    const policy = await getIntegrationPolicy();
    res.json({ policy });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve integration policy' });
  }
});

const UpdateIntegrationPolicySchema = z
  .object({
    routing_provider: z.enum(['osrm', 'google_routes']).optional(),
    geocoding_provider: z.enum(['nominatim', 'google_geocoding']).optional(),
    map_provider: z.enum(['osm', 'maptiler', 'carto_positron', 'carto_dark', 'google']).optional(),
    satellite_layer_provider: z.enum(['bhuvan', 'google_hybrid', 'maptiler_satellite']).optional(),
    satellite_metadata_provider: z.enum(['copernicus', 'none']).optional(),
    translation_provider: z.enum(['bhashini', 'gemini', 'none']).optional(),
    ocr_provider: z.enum(['gemini', 'tesseract_offline']).optional(),
    maptiler_style: z.enum(['streets-v2', 'basic-v2', 'satellite', 'hybrid', 'topo-v2', 'outdoor-v2', 'dataviz-light', 'dataviz-dark']).optional(),
  })
  .strict();

// PUT /api/integrations/policy - Update statutory IntegrationPolicy (Admin / Officer)
router.put(
  '/integrations/policy',
  requireAuth,
  requireRole(['admin', 'project_officer', 'lao']),
  async (req: Request, res: Response) => {
    try {
      const parseResult = UpdateIntegrationPolicySchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Invalid integration policy payload.',
          details: parseResult.error.flatten(),
        });
      }

      const actorName = (req as any).user?.full_name || 'Authorized Officer';
      const actorId = (req as any).user?.id;

      const updated = await updateIntegrationPolicy(parseResult.data, actorName, actorId);
      res.json({ success: true, policy: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update integration policy' });
    }
  }
);

export default router;
