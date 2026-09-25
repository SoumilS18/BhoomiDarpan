import {
  LgdAdministrativeTier,
  CANONICAL_LGD_RESOURCES,
  executeLgdQuery,
  getLgdServerConfig,
} from '../config/lgdConfig';
import {
  AdministrativeUnit,
  AdminUnitType,
  LgdSyncSummary,
  LgdSyncTierSummary,
  LgdSyncStatus,
} from '../../shared/types';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { logCaseEvent } from './auditLogger';
import {
  registerAdministrativeUnit,
  getAdministrativeUnitByCode,
  getTotalUnitsCount,
  getUnitsCountByTier,
  inMemoryUnitsStore,
} from './administrativeGeographyService';

// Canonical mapping between LGD tiers and DB unit_type
export const TIER_TO_UNIT_TYPE: Record<LgdAdministrativeTier, AdminUnitType> = {
  states: 'state',
  districts: 'district',
  subDistricts: 'sub_district',
  villages: 'village',
};

export const UNIT_TYPE_TO_TIER: Record<string, LgdAdministrativeTier> = {
  state: 'states',
  district: 'districts',
  sub_district: 'subDistricts',
  locality: 'villages',
  village: 'villages',
};

export interface NormalizedLgdRecord {
  unit_type: AdminUnitType;
  code: string;
  name: string;
  local_name?: string | null;
  parent_code?: string | null;
  state_code?: string | null;
  district_code?: string | null;
  sub_district_code?: string | null;
  census_code?: string | null;
  source_resource_id: string;
  last_updated?: string | null;
  metadata?: Record<string, any>;
}

// Global synchronization lock
let isSyncLocked = false;
let currentLockOwner: string | null = null;
let lockAcquiredAt: string | null = null;

// In-memory sync history log for auditability & telemetry
const SYNC_HISTORY: LgdSyncSummary[] = [];

/**
 * Normalizes raw records returned by data.gov.in LGD APIs into canonical normalized objects.
 * Handles both snake_case (states, districts, sub-districts) and camelCase (villages).
 */
export function normalizeLgdSourceRecord(
  tier: LgdAdministrativeTier,
  raw: any,
  resourceId: string
): NormalizedLgdRecord | null {
  if (!raw || typeof raw !== 'object') return null;

  switch (tier) {
    case 'states': {
      const code = String(raw.state_code ?? raw.stateCode ?? '').trim();
      const name = String(raw.state_name_english ?? raw.stateNameEnglish ?? '').trim();
      if (!code || !name) return null;

      return {
        unit_type: 'state',
        code,
        name,
        local_name: raw.state_name_local || raw.stateNameLocal || null,
        parent_code: null,
        state_code: code,
        census_code: raw.state_census2011_code ? String(raw.state_census2011_code).trim() : null,
        source_resource_id: resourceId,
        last_updated: raw.last_updated || raw.data_gov_update_date || null,
        metadata: {
          state_or_ut: raw.state_or_ut || null,
          source_tier: tier,
        },
      };
    }

    case 'districts': {
      const code = String(raw.district_code ?? raw.districtCode ?? '').trim();
      const name = String(raw.district_name_english ?? raw.districtNameEnglish ?? '').trim();
      const parentCode = String(raw.state_code ?? raw.stateCode ?? '').trim();
      if (!code || !name) return null;

      return {
        unit_type: 'district',
        code,
        name,
        local_name: raw.district_name_local || raw.districtNameLocal || null,
        parent_code: parentCode || null,
        state_code: parentCode || null,
        district_code: code,
        census_code: raw.district_census2011_code ? String(raw.district_census2011_code).trim() : null,
        source_resource_id: resourceId,
        last_updated: raw.last_updated || raw.data_gov_update_date || null,
        metadata: {
          state_name_english: raw.state_name_english || raw.stateNameEnglish || null,
          source_tier: tier,
        },
      };
    }

    case 'subDistricts': {
      const code = String(raw.subdistrict_code ?? raw.subdistrictCode ?? '').trim();
      const name = String(raw.subdistrict_name_english ?? raw.subdistrictNameEnglish ?? '').trim();
      const districtCode = String(raw.district_code ?? raw.districtCode ?? '').trim();
      const stateCode = String(raw.state_code ?? raw.stateCode ?? '').trim();
      if (!code || !name) return null;

      return {
        unit_type: 'sub_district',
        code,
        name,
        local_name: raw.subdistrict_name_local || raw.subdistrictNameLocal || null,
        parent_code: districtCode || null,
        state_code: stateCode || null,
        district_code: districtCode || null,
        sub_district_code: code,
        census_code: raw.subdistrict_census2011_code ? String(raw.subdistrict_census2011_code).trim() : null,
        source_resource_id: resourceId,
        last_updated: raw.last_updated || raw.data_gov_update_date || null,
        metadata: {
          district_name_english: raw.district_name_english || raw.districtNameEnglish || null,
          state_name_english: raw.state_name_english || raw.stateNameEnglish || null,
          source_tier: tier,
        },
      };
    }

    case 'villages': {
      // Villages API specifically uses camelCase on data.gov.in
      const code = String(raw.villageCode ?? raw.village_code ?? '').trim();
      const name = String(raw.villageNameEnglish ?? raw.village_name_english ?? '').trim();
      const subdistrictCode = String(raw.subdistrictCode ?? raw.subdistrict_code ?? '').trim();
      const districtCode = String(raw.districtCode ?? raw.district_code ?? '').trim();
      const stateCode = String(raw.stateCode ?? raw.state_code ?? '').trim();
      if (!code || !name) return null;

      return {
        unit_type: 'village',
        code,
        name,
        local_name: raw.villageNameLocal || raw.village_name_local || null,
        parent_code: subdistrictCode || null,
        state_code: stateCode || null,
        district_code: districtCode || null,
        sub_district_code: subdistrictCode || null,
        census_code: raw.villageCensus2011Code ? String(raw.villageCensus2011Code).trim() : null,
        source_resource_id: resourceId,
        last_updated: raw.data_gov_update_date || raw.last_updated || null,
        metadata: {
          subdistrict_name_english: raw.subdistrictNameEnglish || raw.subdistrict_name_english || null,
          district_name_english: raw.districtNameEnglish || raw.district_name_english || null,
          state_name_english: raw.stateNameEnglish || raw.state_name_english || null,
          source_tier: tier,
        },
      };
    }

    default:
      return null;
  }
}

/**
 * Checks whether an existing unit matches the incoming normalized LGD data (idempotency check).
 */
export function isRecordIdentical(existing: AdministrativeUnit, incoming: NormalizedLgdRecord, parentId?: string | null): boolean {
  if (existing.name !== incoming.name) return false;
  if ((existing.local_name || null) !== (incoming.local_name || null)) return false;
  if ((existing.census_code || null) !== (incoming.census_code || null)) return false;
  if ((existing.state_code || null) !== (incoming.state_code || null)) return false;
  if ((existing.district_code || null) !== (incoming.district_code || null)) return false;
  if ((existing.sub_district_code || null) !== (incoming.sub_district_code || null)) return false;
  if (parentId !== undefined && (existing.parent_id || null) !== (parentId || null)) return false;
  return true;
}

export interface IngestionOptions {
  tier?: LgdAdministrativeTier; // If omitted, ingests all tiers in dependency order
  startOffset?: number; // Supports resuming interrupted ingestion
  maxRecordsPerTier?: number; // Safety limit (e.g., 50 for quick sync/test, omitted for full sync)
  batchSize?: number; // Pagination batch size (default: 100, max 1000)
  retryLimit?: number;
  timeoutMs?: number;
  actor?: string; // Authenticated officer ID/name
  filters?: Record<string, string>;
  recordsOverride?: any[]; // Used for deterministic test mocking
  interruptAfterBatches?: number; // Used for controlled interrupted sync testing
}

/**
 * Executes paginated ingestion for a single LGD tier with hierarchy validation and idempotent upsert.
 */
export async function ingestLgdTier(
  tier: LgdAdministrativeTier,
  options: IngestionOptions = {}
): Promise<LgdSyncTierSummary> {
  const startTime = Date.now();
  const config = getLgdServerConfig();
  const resourceId = config.resources[tier];
  const unitType = TIER_TO_UNIT_TYPE[tier];
  const batchSize = Math.min(1000, Math.max(1, options.batchSize || config.batchSize || 100));
  const maxRecords = options.maxRecordsPerTier;

  const summary: LgdSyncTierSummary = {
    tier,
    resource_id: resourceId,
    total_available: 0,
    records_received: 0,
    records_inserted: 0,
    records_updated: 0,
    records_unchanged: 0,
    records_rejected: 0,
    orphan_records: 0,
    duration_ms: 0,
    status: 'completed',
    validation_errors: [],
  };

  let rawRecords: any[] = [];

  if (options.recordsOverride && Array.isArray(options.recordsOverride)) {
    rawRecords = options.recordsOverride;
    summary.total_available = rawRecords.length;
  } else {
    // Paginated fetch from authoritative data.gov.in API
    let offset = Math.max(0, options.startOffset ?? 0);
    let keepFetching = true;
    let batchesProcessed = 0;

    while (keepFetching) {
      const currentLimit = maxRecords ? Math.min(batchSize, maxRecords - rawRecords.length) : batchSize;
      if (currentLimit <= 0) break;

      try {
        const response = await executeLgdQuery(tier, {
          offset,
          limit: currentLimit,
          filters: options.filters,
          retryLimit: options.retryLimit,
          timeoutMs: options.timeoutMs,
        });

        summary.total_available = response.total;
        const pageRecords = response.records || [];

        if (pageRecords.length === 0) {
          keepFetching = false;
          break;
        }

        for (const rec of pageRecords) {
          rawRecords.push(rec);
        }

        offset += pageRecords.length;
        batchesProcessed++;

        if (options.interruptAfterBatches && batchesProcessed >= options.interruptAfterBatches) {
          summary.status = 'partial';
          keepFetching = false;
          break;
        }

        // Stop if we received fewer records than requested or reached max records limit or total
        if (pageRecords.length < currentLimit || offset >= response.total || (maxRecords && rawRecords.length >= maxRecords)) {
          keepFetching = false;
        }
      } catch (fetchErr: any) {
        summary.status = rawRecords.length > 0 ? 'partial' : 'failed';
        summary.validation_errors.push({
          code: 'API_FETCH_ERROR',
          message: `LGD API fetch error at offset ${offset}: ${fetchErr.message}`,
        });
        keepFetching = false;
      }
    }
  }

  summary.records_received = rawRecords.length;

  // Process and upsert records sequentially to maintain hierarchy integrity
  for (let i = 0; i < rawRecords.length; i++) {
    const raw = rawRecords[i];
    const normalized = normalizeLgdSourceRecord(tier, raw, resourceId);

    if (!normalized) {
      summary.records_rejected++;
      summary.validation_errors.push({
        code: 'SCHEMA_NORMALIZATION_FAILED',
        message: `Failed to normalize LGD record at index ${i}`,
        data: raw,
      });
      continue;
    }

    // 1. Hierarchy integrity verification: resolve parent if expected
    let parentUnitId: string | null = null;

    if (normalized.parent_code) {
      const parentUnitType: AdminUnitType =
        tier === 'districts' ? 'state' : tier === 'subDistricts' ? 'district' : 'sub_district';

      const parentUnit = await getAdministrativeUnitByCode(normalized.parent_code, parentUnitType);

      if (!parentUnit) {
        summary.orphan_records++;
        summary.records_rejected++;
        summary.validation_errors.push({
          code: 'MISSING_PARENT_HIERARCHY',
          message: `Parent unit (${parentUnitType} code "${normalized.parent_code}") not found for ${unitType} "${normalized.name}" (code: ${normalized.code})`,
          data: normalized,
        });
        continue; // Strictly reject orphan records
      }

      parentUnitId = parentUnit.id;
    }

    // 2. Check existing record for idempotent change detection
    const existing = await getAdministrativeUnitByCode(normalized.code, unitType);

    if (existing) {
      if (isRecordIdentical(existing, normalized, parentUnitId)) {
        summary.records_unchanged++;
        continue;
      }

      // Record changed -> perform update
      await registerAdministrativeUnit({
        parent_id: parentUnitId,
        unit_type: normalized.unit_type,
        code: normalized.code,
        name: normalized.name,
        local_name: normalized.local_name,
        state_code: normalized.state_code,
        district_code: normalized.district_code,
        sub_district_code: normalized.sub_district_code,
        census_code: normalized.census_code,
        is_active: true,
        source_id: 'lgd_india',
        source_resource_id: normalized.source_resource_id,
        last_synced_at: new Date().toISOString(),
        metadata: normalized.metadata,
      });

      summary.records_updated++;
    } else {
      // New record -> perform insert
      await registerAdministrativeUnit({
        parent_id: parentUnitId,
        unit_type: normalized.unit_type,
        code: normalized.code,
        name: normalized.name,
        local_name: normalized.local_name,
        state_code: normalized.state_code,
        district_code: normalized.district_code,
        sub_district_code: normalized.sub_district_code,
        census_code: normalized.census_code,
        is_active: true,
        source_id: 'lgd_india',
        source_resource_id: normalized.source_resource_id,
        last_synced_at: new Date().toISOString(),
        metadata: normalized.metadata,
      });

      summary.records_inserted++;
    }
  }

  summary.duration_ms = Date.now() - startTime;
  return summary;
}

/**
 * Runs full authoritative LGD synchronization across all tiers in strict dependency order:
 * 1. States -> 2. Districts -> 3. Sub-Districts -> 4. Villages
 * Enforces single-execution mutex lock and logs audit trail.
 */
export async function executeAuthoritativeLgdSync(options: IngestionOptions = {}): Promise<LgdSyncSummary> {
  if (isSyncLocked) {
    throw new Error(
      `LGD synchronization is already in progress (started by ${currentLockOwner || 'system'} at ${lockAcquiredAt}). Concurrent sync execution is blocked.`
    );
  }

  isSyncLocked = true;
  currentLockOwner = options.actor || 'System Officer';
  lockAcquiredAt = new Date().toISOString();

  const syncId = `lgd-sync-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  await logCaseEvent({
    case_id: null,
    event_type: 'LGD_SYNC_STARTED',
    title: 'LGD Ingestion Synchronization Started',
    description: `Authoritative LGD sync started by ${currentLockOwner}. Sync ID: ${syncId}`,
    actor_name: currentLockOwner,
    metadata: { sync_id: syncId, options },
  });

  const tiersToSync: LgdAdministrativeTier[] = options.tier
    ? [options.tier]
    : ['states', 'districts', 'subDistricts', 'villages'];

  const summary: LgdSyncSummary = {
    sync_id: syncId,
    started_at: startedAt,
    completed_at: '',
    duration_ms: 0,
    status: 'completed',
    total_received: 0,
    total_inserted: 0,
    total_updated: 0,
    total_unchanged: 0,
    total_rejected: 0,
    total_orphans: 0,
    tiers: {},
    validation_errors: [],
  };

  try {
    for (const tier of tiersToSync) {
      const tierSummary = await ingestLgdTier(tier, options);
      summary.tiers[tier] = tierSummary;
      summary.total_received += tierSummary.records_received;
      summary.total_inserted += tierSummary.records_inserted;
      summary.total_updated += tierSummary.records_updated;
      summary.total_unchanged += tierSummary.records_unchanged;
      summary.total_rejected += tierSummary.records_rejected;
      summary.total_orphans += tierSummary.orphan_records;

      if (tierSummary.validation_errors.length > 0) {
        summary.validation_errors.push(...tierSummary.validation_errors);
      }

      if (tierSummary.status === 'failed') {
        summary.status = 'failed';
      } else if (tierSummary.status === 'partial' && summary.status !== 'failed') {
        summary.status = 'partial';
      }
    }

    summary.completed_at = new Date().toISOString();
    summary.duration_ms = Date.now() - startTime;

    // Record sync in history
    SYNC_HISTORY.unshift(summary);
    if (SYNC_HISTORY.length > 20) SYNC_HISTORY.pop();

    // Update data_sources table for lgd_india
    if (isSupabaseConfigured) {
      try {
        const supabase = getSupabase();
        await supabase
          .from('data_sources')
          .update({
            status: summary.status === 'failed' ? 'error' : 'operational',
            updated_at: summary.completed_at,
            metadata: {
              last_sync: summary,
              last_synced_at: summary.completed_at,
            },
          })
          .eq('id', 'lgd_india');
      } catch {}
    }

    await logCaseEvent({
      case_id: null,
      event_type: 'LGD_SYNC_COMPLETED',
      title: 'LGD Ingestion Synchronization Completed',
      description: `Authoritative LGD sync completed with status ${summary.status}. Total inserted: ${summary.total_inserted}, updated: ${summary.total_updated}, unchanged: ${summary.total_unchanged}.`,
      actor_name: currentLockOwner,
      metadata: {
        sync_id: syncId,
        status: summary.status,
        total_inserted: summary.total_inserted,
        total_updated: summary.total_updated,
        total_unchanged: summary.total_unchanged,
        total_rejected: summary.total_rejected,
      },
    });

    return summary;
  } catch (err: any) {
    summary.status = 'failed';
    summary.completed_at = new Date().toISOString();
    summary.duration_ms = Date.now() - startTime;
    summary.validation_errors.push({
      code: 'SYNC_EXECUTION_EXCEPTION',
      message: err.message,
    });

    await logCaseEvent({
      case_id: null,
      event_type: 'LGD_SYNC_FAILED',
      title: 'LGD Ingestion Synchronization Failed',
      description: `Authoritative LGD sync failed: ${err.message}`,
      actor_name: currentLockOwner,
      metadata: { sync_id: syncId, error: err.message },
    });

    throw err;
  } finally {
    isSyncLocked = false;
    currentLockOwner = null;
    lockAcquiredAt = null;
  }
}

/**
 * Retrieves the operational sync status and record statistics for LGD administrative hierarchy.
 */
export async function getLgdSyncStatus(): Promise<LgdSyncStatus> {
  const totalCount = await getTotalUnitsCount();
  const stateCount = await getUnitsCountByTier('state');
  const districtCount = await getUnitsCountByTier('district');
  const subDistrictCount = await getUnitsCountByTier('sub_district');
  const villageCount =
    (await getUnitsCountByTier('village')) + (await getUnitsCountByTier('locality'));

  const lastSuccessful = SYNC_HISTORY.find((s) => s.status === 'completed');
  const lastAttempted = SYNC_HISTORY[0];

  let operationalStatus: LgdSyncStatus['operational_status'] = 'never_synced';

  if (isSyncLocked) {
    operationalStatus = 'syncing';
  } else if (lastSuccessful || totalCount > 0) {
    operationalStatus = 'operational';
  } else {
    operationalStatus = 'never_synced';
  }

  return {
    operational_status: operationalStatus,
    last_successful_sync: lastSuccessful?.completed_at,
    last_attempted_sync: lastAttempted?.started_at,
    is_sync_in_progress: isSyncLocked,
    current_lock_owner: currentLockOwner || undefined,
    tier_counts: {
      states: stateCount,
      districts: districtCount,
      sub_districts: subDistrictCount,
      villages: villageCount,
      total: totalCount,
    },
    sync_history: SYNC_HISTORY.slice(0, 10),
  };
}

/**
 * Force releases lock and resets sync state (strictly for test harness isolation).
 */
export function resetLgdSyncLockForTests() {
  isSyncLocked = false;
  currentLockOwner = null;
  lockAcquiredAt = null;
  SYNC_HISTORY.length = 0;
}
