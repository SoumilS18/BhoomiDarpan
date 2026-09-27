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
  createSubDistrict,
} from '../services/administrativeGeographyService';
import { CreateSubDistrictSchema } from '../utils/validators';
import {
  executeAuthoritativeLgdSync,
  getLgdSyncStatus,
} from '../services/lgdIngestionService';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { getRecentAuditLogs, logCaseEvent } from '../services/auditLogger';
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
 * POST /api/administration/subdistricts
 * Creates a missing Sub-District / Tehsil with non-authoritative reference provenance.
 */
administrationRouter.post(
  ['/subdistricts', '/sub-districts'],
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
    const queryText = (req.query.q || req.query.query) ? String(req.query.q || req.query.query) : '';
    if (!queryText || queryText.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" or "query" is required for search' });
    }

    const unitType = (req.query.unit_type || req.query.type) as AdminUnitType | undefined;
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
administrationRouter.get('/enrichment', requireAuth, async (req: Request, res: Response) => {
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
administrationRouter.get('/sync/status', requireAuth, async (_req: Request, res: Response) => {
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

// ============================================================================
// 4. GLOBAL AUDIT LEDGER
// ============================================================================

/**
 * GET /api/administration/audit
 *
 * Most recent audit events across every case, for the administration console.
 *
 * Reuses the existing `case_events` table written by `auditLogger.logCaseEvent`
 * — no separate audit store is introduced. The response reports which store it
 * came from so the interface can state honestly whether records are durable
 * (`database`) or held only in this server process (`memory`, used when
 * Supabase is unconfigured or the query fails).
 *
 * Restricted to administrators: a cross-case ledger is not case-scoped data.
 */
administrationRouter.get(
  '/audit',
  requireAuth,
  requireRole(['admin']),
  async (req: Request, res: Response) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const eventType = req.query.event_type ? String(req.query.event_type) : undefined;
      const caseId = req.query.case_id ? String(req.query.case_id) : undefined;

      if (isSupabaseConfigured) {
        try {
          const supabase = getSupabase();
          let query = supabase
            .from('case_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
          if (caseId) query = query.eq('case_id', caseId);
          if (eventType) query = query.eq('event_type', eventType);

          const { data, error } = await query;
          if (!error && data) {
            return res.json({ events: data, source: 'database', count: data.length });
          }
          if (error) {
            console.warn('[Administration] case_events query failed:', error.message);
          }
        } catch (err: any) {
          console.warn('[Administration] case_events query threw:', err.message);
        }
      }

      // Durable store unavailable — report the in-process buffer explicitly
      // rather than presenting it as a persisted ledger.
      const events = getRecentAuditLogs({ case_id: caseId, event_type: eventType })
        .slice(-limit)
        .reverse();
      res.json({ events, source: 'memory', count: events.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ============================================================================
// 4. USER ACCESS MANAGEMENT & REVOCATION
// ============================================================================

/**
 * GET /api/administration/users
 * Lists registered officers and their assigned roles/jurisdictions.
 */
administrationRouter.get(
  '/users',
  requireAuth,
  requireRole(['admin']),
  async (_req: Request, res: Response) => {
    try {
      if (isSupabaseConfigured) {
        const supabase = getSupabase();
        const { data: users, error } = await supabase
          .from('user_profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && users) {
          return res.json({ users, count: users.length });
        }
      }

      return res.json({ users: [], count: 0 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * DELETE /api/administration/users/:id
 * Revokes officer access, deletes Supabase auth account, and cleans user profile.
 */
administrationRouter.delete(
  '/users/:id',
  requireAuth,
  requireRole(['admin']),
  async (req: Request, res: Response) => {
    try {
      const targetUserId = typeof req.params.id === 'string' ? req.params.id : String(req.params.id || '');
      const caller = (req as any).user;

      if (!targetUserId || targetUserId.trim().length === 0) {
        return res.status(400).json({ error: 'Target user ID is required.' });
      }

      if (caller && caller.id === targetUserId) {
        return res.status(400).json({
          error: 'Self-revocation is prohibited. An administrator cannot revoke their own active account.',
        });
      }

      if (isSupabaseConfigured) {
        const supabase = getSupabase();

        // 1. Fetch user to verify existence and get details for audit
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', targetUserId)
          .single();

        // 2. Delete auth user from Supabase Auth
        try {
          await supabase.auth.admin.deleteUser(targetUserId);
        } catch (authErr: any) {
          console.warn('[Administration] Supabase auth user deletion warning:', authErr?.message);
        }

        // 3. Delete profile row
        const { error: delErr } = await supabase
          .from('user_profiles')
          .delete()
          .eq('id', targetUserId);

        if (delErr) {
          return res.status(500).json({ error: delErr.message });
        }

        // 4. Log audit event
        await logCaseEvent({
          event_type: 'USER_ACCESS_REVOKED',
          title: `Access Revoked: ${profile?.full_name || targetUserId}`,
          description: `Administrator ${caller?.full_name || 'Admin'} revoked access for ${profile?.full_name || targetUserId} (${profile?.email || 'N/A'}, role: ${profile?.role || 'N/A'}).`,
          actor_id: caller?.id,
          actor_name: caller?.full_name || 'Administrator',
          metadata: {
            revoked_user_id: targetUserId,
            revoked_user_email: profile?.email,
            revoked_user_role: profile?.role,
          },
        });

        return res.json({
          success: true,
          message: `Access successfully revoked for ${profile?.full_name || targetUserId}.`,
        });
      }

      return res.json({
        success: true,
        message: `User ${targetUserId} access revoked (in-memory mode).`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
