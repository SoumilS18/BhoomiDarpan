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
import { isTestEnvironment } from '../config/runtimeEnv';
import { logCaseEvent } from './auditLogger';
import {
  registerAdministrativeUnit,
  getAdministrativeUnitByCode,
  getTotalUnitsCount,
  getUnitsCountByTier,
  inMemoryUnitsStore,
} from './administrativeGeographyService';
import {
  getActiveGeographySource,
  type GeographySourceDescriptor,
} from '../config/geographySourceRegistry';
import { ingestReferenceTier } from './referenceGeographyProvider';
import type { NormalizedLgdRecord } from './geographyProviderContract';

/**
 * Re-exported for existing callers: the record shape is shared with every
 * geography provider, so it now lives beside the provider contract.
 */
export type { NormalizedLgdRecord };

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

// Global synchronization lock
let isSyncLocked = false;
let currentLockOwner: string | null = null;
let lockAcquiredAt: string | null = null;

// In-memory sync history log for auditability & telemetry
const SYNC_HISTORY: LgdSyncSummary[] = [];

/**
 * Offset each tier stopped at when a run ended `partial`. A subsequent sync
 * resumes from here instead of re-reading pages that were already ingested.
 * Cleared per tier once that tier reconciles against the authoritative total.
 */
const RESUME_OFFSETS: Partial<Record<LgdAdministrativeTier, number>> = {};

/** Read-only view of the current resume offsets (for status reporting). */
export function getLgdResumeOffsets(): Partial<Record<LgdAdministrativeTier, number>> {
  return { ...RESUME_OFFSETS };
}

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
  /**
   * Deterministic CSV fixture for the temporary reference provider. Set only
   * by tests — HTTP requests cannot supply it, so ingestion can never be
   * redirected onto caller-supplied geography.
   */
  referenceCsvLines?: string[];
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

  // The active source decides how this tier is read (Phase C). The official
  // path pages through data.gov.in; the temporary reference path streams a
  // dated archive. Everything downstream — hierarchy validation, idempotent
  // upsert, reconciliation, audit — is shared.
  const activeSource: GeographySourceDescriptor = getActiveGeographySource();
  if (activeSource.id === 'lgd_reference_mirror' && !options.recordsOverride) {
    const { summary: refSummary } = await ingestReferenceTier(tier, {
      batchSize: options.batchSize,
      maxRecordsPerTier: options.maxRecordsPerTier,
      referenceCsvLines: options.referenceCsvLines,
      actor: options.actor,
    });
    return refSummary;
  }

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

  // Per-tier resume offsets. A run interrupted mid-tier can restart on the
  // exact page it stopped at instead of re-reading everything from offset 0.
  let receivedTotal = 0;

  /**
   * Validation errors are capped: a single bad page in the 720k-row village
   * tier must not grow an unbounded in-memory list. Every rejection is still
   * counted on the summary; only the detail list is bounded.
   */
  const MAX_REPORTED_ERRORS = 500;
  let suppressedErrors = 0;
  const pushError = (entry: { code: string; message: string; data?: any }) => {
    if (summary.validation_errors.length < MAX_REPORTED_ERRORS) {
      summary.validation_errors.push(entry);
    } else {
      suppressedErrors++;
    }
  };

  /**
   * Streams one page of raw records straight into storage the moment it
   * arrives: normalise -> resolve parent -> idempotent upsert. Nothing is
   * written to disk and the whole tier is never buffered in memory at once.
   */
  const ingestPage = async (page: any[], indexOffset: number): Promise<void> => {
    for (let i = 0; i < page.length; i++) {
      const raw = page[i];
      const index = indexOffset + i;
      const normalized = normalizeLgdSourceRecord(tier, raw, resourceId);

      if (!normalized) {
        summary.records_rejected++;
        pushError({
          code: 'SCHEMA_NORMALIZATION_FAILED',
          message: `Failed to normalize LGD record at index ${index}`,
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
          pushError({
            code: 'MISSING_PARENT_HIERARCHY',
            message: `Parent unit (${parentUnitType} code "${normalized.parent_code}") not found for ${unitType} "${normalized.name}" (code: ${normalized.code})`,
            data: normalized,
          });
          continue; // Strictly reject orphan records
        }

        parentUnitId = parentUnit.id;
      }

      // 2. Check existing record for idempotent change detection / de-duplication
      const existing = await getAdministrativeUnitByCode(normalized.code, unitType);

      const payload = {
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
        source_id: activeSource.id,
        source_resource_id: normalized.source_resource_id,
        last_synced_at: new Date().toISOString(),
        metadata: normalized.metadata,
      };

      if (existing) {
        // A row currently attributed to a different registered source (e.g. a
        // temporary reference row being replaced by the official LGD sync) must
        // be re-stamped even when its content is identical, so provenance always
        // reflects where the data actually came from.
        const sourceChanged = (existing.source_id ?? null) !== activeSource.id;
        if (!sourceChanged && isRecordIdentical(existing, normalized, parentUnitId)) {
          summary.records_unchanged++;
          continue;
        }
        await registerAdministrativeUnit(payload);
        summary.records_updated++;
      } else {
        await registerAdministrativeUnit(payload);
        summary.records_inserted++;
      }
    }
  };

  if (options.recordsOverride && Array.isArray(options.recordsOverride)) {
    const rawRecords = options.recordsOverride;
    summary.total_available = rawRecords.length;
    summary.records_received = rawRecords.length;
    summary.complete = true;
    await ingestPage(rawRecords, 0);
  } else {
    // Paginated fetch from the authoritative data.gov.in API, streamed page by page
    let offset = Math.max(0, options.startOffset ?? RESUME_OFFSETS[tier] ?? 0);
    let keepFetching = true;
    let batchesProcessed = 0;

    while (keepFetching) {
      const currentLimit = maxRecords ? Math.min(batchSize, maxRecords - receivedTotal) : batchSize;
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

        const pageIndex = offset;
        summary.records_received += pageRecords.length;
        receivedTotal += pageRecords.length;

        // Persist this page before requesting the next one, so an interrupted
        // run has already committed everything below `offset + pageRecords.length`.
        await ingestPage(pageRecords, pageIndex);

        offset += pageRecords.length;
        batchesProcessed++;

        if (options.interruptAfterBatches && batchesProcessed >= options.interruptAfterBatches) {
          summary.status = 'partial';
          keepFetching = false;
          break;
        }

        // Stop if we received fewer records than requested or reached max records limit or total
        if (
          pageRecords.length < currentLimit ||
          offset >= response.total ||
          (maxRecords && receivedTotal >= maxRecords)
        ) {
          keepFetching = false;
        }
      } catch (fetchErr: any) {
        summary.status = receivedTotal > 0 ? 'partial' : 'failed';
        pushError({
          code: 'API_FETCH_ERROR',
          message: `LGD API fetch error at offset ${offset}: ${fetchErr.message}`,
        });
        keepFetching = false;
      }
    }

    // Resume bookkeeping: a completed tier has nothing left to resume from.
    summary.next_offset = offset;
    summary.complete =
      summary.status === 'completed' &&
      (summary.total_available === 0 || offset >= summary.total_available);

    if (summary.complete) {
      delete RESUME_OFFSETS[tier];
    } else {
      RESUME_OFFSETS[tier] = offset;
    }
  }

  if (suppressedErrors > 0) {
    pushError({
      code: 'VALIDATION_ERRORS_TRUNCATED',
      message: `${suppressedErrors} further validation error(s) were counted but not listed (cap of ${MAX_REPORTED_ERRORS} reported entries).`,
    });
  }

  // Reconcile what landed in storage against the authoritative source total.
  try {
    const rowsInDatabase = await getUnitsCountByTier(unitType);
    summary.count_verification = {
      source_total: summary.total_available,
      rows_in_database: rowsInDatabase,
      matched: summary.total_available > 0 && rowsInDatabase === summary.total_available,
      checked_at: new Date().toISOString(),
    };
  } catch {
    // A failed reconciliation must never be reported as a passing one.
    summary.count_verification = {
      source_total: summary.total_available,
      rows_in_database: -1,
      matched: false,
      checked_at: new Date().toISOString(),
    };
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

  // Which source this run is reading is recorded on the summary itself: a run
  // against the temporary reference mirror must stay distinguishable from an
  // authoritative LGD synchronisation after the fact (Phases C and G).
  const activeSource = getActiveGeographySource();
  const sourceNoun =
    activeSource.authority === 'authoritative' ? 'Authoritative LGD' : 'Temporary reference geography';

  await logCaseEvent({
    case_id: null,
    event_type: 'LGD_SYNC_STARTED',
    title: `${sourceNoun} synchronisation started`,
    description: `${sourceNoun} sync started by ${currentLockOwner} from source "${activeSource.label}". Sync ID: ${syncId}`,
    actor_name: currentLockOwner,
    metadata: { sync_id: syncId, source_id: activeSource.id, source_authority: activeSource.authority, options },
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
    source_id: activeSource.id,
    source_label: activeSource.label,
    source_authority: activeSource.authority,
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

    // Overall completeness reconciliation (Phase K). Every tier reports how it
    // obtained its total; the run is only complete when all of them did.
    const tierSummaries = Object.values(summary.tiers);
    const observed = tierSummaries.reduce((sum, t) => sum + (t.completeness?.source_rows_observed ?? 0), 0);
    const missing = tierSummaries.reduce((sum, t) => sum + (t.completeness?.rows_missing_from_database ?? 0), 0);
    const fromOtherSources = tierSummaries.reduce(
      (sum, t) => sum + (t.completeness?.rows_from_other_sources ?? 0),
      0
    );
    const orphans = tierSummaries.reduce((sum, t) => sum + (t.completeness?.orphan_rows_rejected ?? 0), 0);
    const completeTiers = tierSummaries.filter((t) => t.completeness?.complete).length;
    const integrity: 'verified' | 'failed' | 'not_checked' =
      tierSummaries.length === 0
        ? 'not_checked'
        : tierSummaries.every((t) => t.completeness?.parent_integrity === 'verified')
          ? 'verified'
          : tierSummaries.some((t) => t.completeness?.parent_integrity === 'failed')
            ? 'failed'
            : 'not_checked';

    summary.reconciliation = {
      complete: summary.status === 'completed' && completeTiers === tierSummaries.length,
      tiers_checked: tierSummaries.length,
      tiers_complete: completeTiers,
      source_rows_observed: observed,
      rows_missing_from_database: missing,
      rows_from_other_sources: fromOtherSources,
      orphan_rows_rejected: orphans,
      parent_integrity: integrity,
      source_total_kind: tierSummaries.every((t) => t.completeness?.source_total_kind === 'observed_rows')
        ? 'observed_rows'
        : tierSummaries.some((t) => t.completeness?.source_total_kind === 'advertised_by_source')
          ? 'advertised_by_source'
          : 'not_provided',
      note:
        'Totals come from what was actually read out of the active source. Where a source does ' +
        'not publish a machine-readable row count, that is stated rather than replaced with a ' +
        'published or reference expectation.',
      checked_at: summary.completed_at,
    };

    // Record sync in history
    SYNC_HISTORY.unshift(summary);
    if (SYNC_HISTORY.length > 20) SYNC_HISTORY.pop();

    // Update data_sources table for lgd_india.
    //
    // Three rules, each of which was violated before:
    //   1. Never write from the test harness (same service-role credentials
    //      as the server — a mocked sync previously recorded "operational").
    //   2. "operational" must be evidence, not optimism: it requires rows that
    //      were actually inserted/updated/verified in the database. Receiving
    //      records is not the same as persisting them (orphans are rejected).
    //   3. Merge metadata instead of replacing it, so provenance written by the
    //      migration (license, canonical_provider, server_side_only) survives.
    if (isSupabaseConfigured && !isTestEnvironment()) {
      try {
        const supabase = getSupabase();

        const rowsPersisted =
          summary.total_inserted + summary.total_updated + summary.total_unchanged > 0;

        const { data: currentRow } = await supabase
          .from('data_sources')
          .select('metadata')
          .eq('id', 'lgd_india')
          .maybeSingle();
        const previousMetadata =
          (currentRow?.metadata as Record<string, any> | null) ?? {};

        const patch: Record<string, any> = {
          status:
            summary.status === 'failed'
              ? 'error'
              : rowsPersisted
                ? 'operational'
                : 'not_configured',
          updated_at: summary.completed_at,
          metadata: {
            ...previousMetadata,
            last_sync: summary,
            last_synced_at: summary.completed_at,
          },
        };
        if (rowsPersisted && summary.status !== 'failed') {
          patch.last_successful_sync = summary.completed_at;
        }

        await supabase.from('data_sources').update(patch).eq('id', 'lgd_india');
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
    resume_offsets: { ...RESUME_OFFSETS },
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
  for (const key of Object.keys(RESUME_OFFSETS) as LgdAdministrativeTier[]) {
    delete RESUME_OFFSETS[key];
  }
}
