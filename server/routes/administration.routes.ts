import { Router, Request, Response } from 'express';
import {
  getStates,
  getDistricts,
  getSubDistricts,
  getVillages,
  searchAdministrativeUnits,
  getAdministrativeUnitByCode,
  getLGDDataSourceStatus,
  resolveAdministrativeEnrichment,
} from '../services/administrativeGeographyService';
import {
  executeAuthoritativeLgdSync,
  getLgdSyncStatus,
} from '../services/lgdIngestionService';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { LgdAdministrativeTier } from '../config/lgdConfig';
import { AdminUnitType } from '../../shared/types';

export const administrationRouter = Router();

// ============================================================================
// 1. AUTHORITATIVE ADMINISTRATIVE HIERARCHY TRAVERSAL
// ============================================================================

/**
 * GET /api/administration/states
 * Retrieves all registered States in the authoritative LGD hierarchy.
 */
administrationRouter.get('/states', async (_req: Request, res: Response) => {
  try {
    const states = await getStates();
    res.json({ states, count: states.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/administration/states/:stateCode/districts
 * Retrieves all Districts under a specific State code.
 */
administrationRouter.get('/states/:stateCode/districts', async (req: Request, res: Response) => {
  try {
    const stateCode = typeof req.params.stateCode === 'string' ? req.params.stateCode : req.params.stateCode?.[0];
    if (!stateCode || stateCode.trim().length === 0) {
      return res.status(400).json({ error: 'stateCode parameter is required' });
    }
    const districts = await getDistricts(stateCode.trim());
    res.json({ state_code: stateCode.trim(), districts, count: districts.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/administration/districts/:districtCode/subdistricts
 * Retrieves all Sub-Districts / Tehsils under a specific District code.
 */
administrationRouter.get('/districts/:districtCode/subdistricts', async (req: Request, res: Response) => {
  try {
    const districtCode = typeof req.params.districtCode === 'string' ? req.params.districtCode : req.params.districtCode?.[0];
    if (!districtCode || districtCode.trim().length === 0) {
      return res.status(400).json({ error: 'districtCode parameter is required' });
    }
    const subdistricts = await getSubDistricts(districtCode.trim());
    res.json({ district_code: districtCode.trim(), subdistricts, count: subdistricts.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/administration/subdistricts/:code/villages
 * Retrieves Revenue Villages under a Sub-District code with server-side pagination & search.
 */
administrationRouter.get('/subdistricts/:code/villages', async (req: Request, res: Response) => {
  try {
    const subDistrictCode = typeof req.params.code === 'string' ? req.params.code : req.params.code?.[0];
    if (!subDistrictCode || subDistrictCode.trim().length === 0) {
      return res.status(400).json({ error: 'Subdistrict code parameter is required' });
    }

    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const search = req.query.search ? String(req.query.search) : undefined;

    const result = await getVillages(subDistrictCode.trim(), { page, limit, search });
    res.json({
      sub_district_code: subDistrictCode.trim(),
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/administration/search?q=...&unit_type=...
 * Searches administrative units across names and LGD codes.
 */
administrationRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const queryText = req.query.q ? String(req.query.q) : '';
    if (!queryText || queryText.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" is required for search' });
    }

    const unitType = req.query.unit_type as AdminUnitType | undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;

    const results = await searchAdministrativeUnits(queryText, { unit_type: unitType, limit });
    res.json({ query: queryText, results, count: results.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/administration/units/:code
 * Retrieves a single administrative unit by its official LGD code.
 */
administrationRouter.get('/units/:code', async (req: Request, res: Response) => {
  try {
    const code = typeof req.params.code === 'string' ? req.params.code : req.params.code?.[0];
    if (!code) {
      return res.status(400).json({ error: 'Unit code parameter is required' });
    }
    const unitType = req.query.unit_type as AdminUnitType | undefined;
    const unit = await getAdministrativeUnitByCode(code.trim(), unitType);

    if (!unit) {
      return res.status(404).json({ error: `Administrative unit with code "${code}" not found` });
    }

    res.json({ unit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/administration/enrichment
 * Resolves authoritative administrative hierarchy for provided LGD codes.
 */
administrationRouter.get('/enrichment', async (req: Request, res: Response) => {
  try {
    const stateLgdCode = req.query.state_lgd_code as string | undefined;
    const districtLgdCode = req.query.district_lgd_code as string | undefined;
    const subdistrictLgdCode = req.query.subdistrict_lgd_code as string | undefined;
    const villageLgdCode = req.query.village_lgd_code as string | undefined;

    const enrichment = await resolveAdministrativeEnrichment({
      stateLgdCode,
      districtLgdCode,
      subdistrictLgdCode,
      villageLgdCode,
    });

    res.json(enrichment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 2. LGD SYNCHRONIZATION & TELEMETRY CONTROL
// ============================================================================

/**
 * GET /api/administration/sync/status
 * Retrieves operational status, records per tier, and recent sync history.
 */
administrationRouter.get('/sync/status', async (_req: Request, res: Response) => {
  try {
    const status = await getLgdSyncStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/administration/sync
 * Triggers on-demand authoritative LGD ingestion.
 * Restricted to authorized supervisory officers (Admin / LAO).
 * Enforces single-execution concurrency lock.
 */
administrationRouter.post(
  '/sync',
  requireAuth,
  requireRole(['admin', 'lao']),
  async (req: Request, res: Response) => {
    try {
      const { tier, max_records_per_tier, batch_size } = req.body || {};

      if (tier && !['states', 'districts', 'subDistricts', 'villages'].includes(tier)) {
        return res.status(400).json({
          error: `Invalid tier "${tier}". Must be one of: "states", "districts", "subDistricts", "villages"`,
        });
      }

      const actor = (req as any).user?.full_name || (req as any).user?.email || 'Authorized Officer';

      const summary = await executeAuthoritativeLgdSync({
        tier: tier as LgdAdministrativeTier | undefined,
        maxRecordsPerTier: max_records_per_tier ? Number(max_records_per_tier) : undefined,
        batchSize: batch_size ? Number(batch_size) : undefined,
        actor,
      });

      res.status(200).json({
        success: true,
        message: `Authoritative LGD sync completed with status: ${summary.status}`,
        summary,
      });
    } catch (err: any) {
      const isLockError = err.message.includes('already in progress');
      const status = isLockError ? 409 : 500;
      res.status(status).json({
        error: err.message,
        is_locked: isLockError,
      });
    }
  }
);
