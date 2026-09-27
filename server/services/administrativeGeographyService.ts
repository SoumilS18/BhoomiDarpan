import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { isTestEnvironment } from '../config/runtimeEnv';
import {
  getActiveGeographySource,
  getGeographySource,
  resolveActiveGeographySourceId,
} from '../config/geographySourceRegistry';
import { AdministrativeUnit, AdminUnitType } from '../../shared/types';
import {
  isVillageDatabasePopulated,
  getVillageCount,
  queryVillagesBySubDistrict,
  searchVillagesEngine,
  getVillageByCodeEngine,
} from './villageStorageEngine';

// In-memory unit store for imported units in local/offline test mode and cache
export const inMemoryUnitsStore: AdministrativeUnit[] = [];

/**
 * Clears the in-memory store (used for test isolation).
 */
export function clearInMemoryUnits() {
  inMemoryUnitsStore.length = 0;
}

/**
 * Seeds administrative units in-memory (used for tests).
 */
export function seedInMemoryUnits(units: AdministrativeUnit[]) {
  for (const u of units) {
    const idx = inMemoryUnitsStore.findIndex(
      (existing) => existing.unit_type === u.unit_type && existing.code === u.code
    );
    if (idx >= 0) {
      inMemoryUnitsStore[idx] = { ...inMemoryUnitsStore[idx], ...u };
    } else {
      inMemoryUnitsStore.push(u);
    }
  }
}

// ============================================================================
// Authoritative-source provenance
// ----------------------------------------------------------------------------
// READ PATHS DO NOT SUBSTITUTE REFERENCE DATA ANY MORE
//
// Reads must never answer from a bundled reference subset while the
// authoritative hierarchy is absent from the database — that would present an
// incomplete national hierarchy as production data (e.g. Uttar Pradesh showing
// 9 of its districts with nothing saying so).
//
// The authoritative LGD source is data.gov.in, fed through
// `POST /api/administration/sync` into `administrative_units`. Until a valid
// `LGD_DATA_GOV_API_KEY` (or an official dataset import) populates that table,
// reads report `status: 'requires_credentials' | 'unavailable'` through
// `getGeographyProvenance()`. Rows written by the temporary reference mirror
// are reported as `status: 'temporary_reference'` (or `'mixed'`) with
// `authoritative: false`, so they can never be presented as official LGD. The
// UI renders that honestly instead of showing a partial subset as production
// data.
// ============================================================================

export type GeographyProvenanceStatus =
  /** Every stored row came from the official LGD source: reads are authoritative. */
  | 'authoritative'
  /** Rows exist, but all of them come from the temporary LGD-derived mirror. */
  | 'temporary_reference'
  /** Rows exist, but from a mix of authoritative, temporary, or unregistered sources. */
  | 'mixed'
  /** Provider is configured but the hierarchy has never been ingested. */
  | 'requires_credentials'
  /** Provider is not configured at all. */
  | 'unavailable';

export interface GeographyProvenance {
  status: GeographyProvenanceStatus;
  /** Display name of the source the stored rows actually came from. */
  source: string;
  /** True only when `status === 'authoritative'`. */
  authoritative: boolean;
  /** Rows actually present in `administrative_units` (never a reference count). */
  units_in_database: number;
  counts: { states: number; districts: number; sub_districts: number; villages: number };
  /**
   * Per-source row totals observed in `administrative_units`. The `status`
   * above is derived from these, so a client can verify the claim instead of
   * trusting a bare string.
   */
  source_rows: { lgd_india: number; lgd_reference_mirror: number; other: number };
  /**
   * Which registered source produced the stored rows. `mixed` covers both
   * multi-source databases and rows whose `source_id` is outside the registry.
   */
  active_source: 'lgd_india' | 'lgd_reference_mirror' | 'mixed' | 'none';
  /** What must happen before this can become `authoritative`. */
  requires: string | null;
  message: string;
}

const LGD_SOURCE_LABEL = 'Local Government Directory (LGD), Ministry of Panchayati Raj';

const REFERENCE_MIRROR_SOURCE_LABEL =
  getGeographySource('lgd_reference_mirror')?.label ??
  'LGD-derived reference mirror (temporary, non-authoritative)';

function providerConfigured(): boolean {
  return Boolean(process.env.LGD_DATA_GOV_API_KEY && !isPlaceholderKey(process.env.LGD_DATA_GOV_API_KEY));
}

function isPlaceholderKey(value: string): boolean {
  const v = value.trim();
  return v.length < 20 || /your-|placeholder|example/i.test(v);
}

type SourceRowCounts = {
  lgd_india: number;
  lgd_reference_mirror: number;
  other: number;
};

const emptySourceRowCounts = (): SourceRowCounts => ({
  lgd_india: 0,
  lgd_reference_mirror: 0,
  other: 0,
});

/** Buckets one row's `source_id` into the per-source totals. */
function bucketSourceId(counts: SourceRowCounts, sourceId: string | null | undefined): void {
  if (sourceId === 'lgd_india') counts.lgd_india += 1;
  else if (sourceId === 'lgd_reference_mirror') counts.lgd_reference_mirror += 1;
  else counts.other += 1;
}

/**
 * Reports where the stored geography actually came from. Status is derived
 * from per-source row counts observed in `administrative_units` (plus the
 * in-memory store), never assumed: rows from the temporary reference mirror
 * yield `temporary_reference`, mixed or unregistered rows yield `mixed`, a
 * fully official hierarchy yields `authoritative`, and an empty database
 * yields `requires_credentials` (provider configured) or `unavailable`
 * (provider absent). The database is not polled inside the test harness so
 * unit runs never claim whatever a developer's real dev database contains.
 */
let cachedProvenance: { data: GeographyProvenance; expiresAt: number } | null = null;

export function invalidateGeographyProvenanceCache(): void {
  cachedProvenance = null;
}

export async function getGeographyProvenance(): Promise<GeographyProvenance> {
  if (cachedProvenance && cachedProvenance.expiresAt > Date.now() && !isTestEnvironment()) {
    return cachedProvenance.data;
  }

  const counts = { states: 0, districts: 0, sub_districts: 0, villages: 0 };
  const sourceRows = emptySourceRowCounts();

  // Database side: exact head-counts straight from `administrative_units`,
  // with per-source totals filtered on the row-level `source_id` column, so
  // every claim below is derived from what is actually stored.
  if (isSupabaseConfigured && !isTestEnvironment()) {
    try {
      const client = getSupabase();
      const countQuery = () =>
        client.from('administrative_units').select('*', { count: 'exact', head: true });
      const [states, districts, subDistricts, fromLgd] =
        await Promise.all([
          countQuery().eq('unit_type', 'state'),
          countQuery().eq('unit_type', 'district'),
          countQuery().eq('unit_type', 'sub_district'),
          countQuery().eq('source_id', 'lgd_india'),
        ]);

      counts.states = states.count ?? 0;
      counts.districts = districts.count ?? 0;
      counts.sub_districts = subDistricts.count ?? 0;
      sourceRows.lgd_india = fromLgd.count ?? 0;

      if (isVillageDatabasePopulated()) {
        counts.villages = getVillageCount();
        const nonVillageMirror = Math.max(0, counts.states + counts.districts + counts.sub_districts - sourceRows.lgd_india);
        sourceRows.lgd_reference_mirror = counts.villages + nonVillageMirror;
      } else {
        // For villages and mirror totals on large dataset, count by 36 state partitions (fast parallel)
        const { data: stateList } = await client
          .from('administrative_units')
          .select('code')
          .eq('unit_type', 'state');

        if (stateList && stateList.length > 0) {
          let totalVillages = 0;
          let mirrorVillages = 0;
          const results = await Promise.all(
            stateList.map(async (s: any) => {
              const [vRes, mRes] = await Promise.all([
                client
                  .from('administrative_units')
                  .select('id', { count: 'exact', head: true })
                  .in('unit_type', ['village', 'locality'])
                  .eq('state_code', s.code),
                client
                  .from('administrative_units')
                  .select('id', { count: 'exact', head: true })
                  .eq('source_id', 'lgd_reference_mirror')
                  .in('unit_type', ['village', 'locality'])
                  .eq('state_code', s.code),
              ]);
              return { v: vRes.count || 0, m: mRes.count || 0 };
            })
          );
          for (const r of results) {
            totalVillages += r.v;
            mirrorVillages += r.m;
          }
          counts.villages = totalVillages;
          const nonVillageMirror = Math.max(0, counts.states + counts.districts + counts.sub_districts - sourceRows.lgd_india);
          sourceRows.lgd_reference_mirror = mirrorVillages + nonVillageMirror;
        }
      }
      sourceRows.other = 0;
    } catch {
      // A failed read must not fabricate counts — the zeros below keep the
      // honest empty state instead of inventing a hierarchy.
    }
  }

  // In-memory rows (offline test harness / local import cache) are bucketed
  // by each unit's own `source_id` — never assumed to belong to any source.
  for (const unit of inMemoryUnitsStore) {
    if (unit.unit_type === 'state') counts.states += 1;
    else if (unit.unit_type === 'district') counts.districts += 1;
    else if (unit.unit_type === 'sub_district') counts.sub_districts += 1;
    else if (unit.unit_type === 'village' || unit.unit_type === 'locality') counts.villages += 1;

    bucketSourceId(sourceRows, unit.source_id);
  }

  const units = counts.states + counts.districts + counts.sub_districts + counts.villages;

  // Which registered source produced the stored rows (derived, never assumed).
  const activeSource: GeographyProvenance['active_source'] =
    units === 0
      ? 'none'
      : sourceRows.lgd_india === units
        ? 'lgd_india'
        : sourceRows.lgd_reference_mirror === units
          ? 'lgd_reference_mirror'
          : 'mixed';

  const base = {
    source: LGD_SOURCE_LABEL,
    units_in_database: units,
    counts,
    source_rows: sourceRows,
    active_source: activeSource,
  };

  const returnWithCache = (res: GeographyProvenance): GeographyProvenance => {
    if (!isTestEnvironment()) {
      cachedProvenance = { data: res, expiresAt: Date.now() + 60_000 };
    }
    return res;
  };

  if (units > 0) {
    if (activeSource === 'lgd_india') {
      return returnWithCache({
        ...base,
        status: 'authoritative',
        authoritative: true,
        requires: null,
        message: `${units} authoritative LGD administrative units loaded from the database.`,
      });
    }

    // Anything short of a fully official hierarchy needs the same next step.
    const pathToAuthoritative = providerConfigured()
      ? 'Run the authoritative LGD sync (POST /api/administration/sync) to replace the rows below'
      : 'LGD_DATA_GOV_API_KEY plus an authoritative LGD sync';

    if (activeSource === 'lgd_reference_mirror') {
      return returnWithCache({
        ...base,
        source: REFERENCE_MIRROR_SOURCE_LABEL,
        status: 'temporary_reference',
        authoritative: false,
        requires: pathToAuthoritative,
        message:
          `${units} administrative units loaded from the temporary LGD-derived reference mirror. ` +
          'This is NOT authoritative LGD — treat it as provisional reference geography until an ' +
          'official LGD sync replaces these rows.',
      });
    }

    const mixedParts: string[] = [];
    if (sourceRows.lgd_india > 0) mixedParts.push(LGD_SOURCE_LABEL);
    if (sourceRows.lgd_reference_mirror > 0) mixedParts.push(REFERENCE_MIRROR_SOURCE_LABEL);
    if (sourceRows.other > 0) mixedParts.push(`${sourceRows.other} unregistered source rows`);

    return returnWithCache({
      ...base,
      source: `Mixed sources: ${mixedParts.join(' + ')}`,
      status: 'mixed',
      authoritative: false,
      requires: pathToAuthoritative,
      message:
        `Mixed-source geography: ${units} administrative units — ` +
        `${sourceRows.lgd_india} from authoritative LGD, ` +
        `${sourceRows.lgd_reference_mirror} from the temporary reference mirror` +
        (sourceRows.other > 0 ? `, ${sourceRows.other} from unregistered sources` : '') +
        '. The hierarchy is NOT fully authoritative.',
    });
  }

  if (!isSupabaseConfigured) {
    return returnWithCache({
      ...base,
      status: 'unavailable',
      authoritative: false,
      requires: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY',
      message:
        'Administrative geography is unavailable: no database is configured, so no LGD hierarchy can be read.',
    });
  }

  if (!providerConfigured()) {
    return returnWithCache({
      ...base,
      status: 'requires_credentials',
      authoritative: false,
      requires: 'LGD_DATA_GOV_API_KEY',
      message:
        'Authoritative LGD source unavailable — requires credentials. Set LGD_DATA_GOV_API_KEY and run ' +
        'POST /api/administration/sync to load the national hierarchy into the database.',
    });
  }

  return returnWithCache({
    ...base,
    status: 'requires_credentials',
    authoritative: false,
    requires: 'LGD_DATA_GOV_API_KEY or an official LGD dataset import',
    message:
      'Authoritative LGD source unavailable — the hierarchy has not been ingested yet. No partial or ' +
      'reference geography is substituted in its place.',
  });
}

/**
 * Retrieves all registered States in the administrative hierarchy.
 */
export async function getStates(): Promise<AdministrativeUnit[]> {
  if (inMemoryUnitsStore.some((u) => u.unit_type === 'state')) {
    return inMemoryUnitsStore
      .filter((u) => u.unit_type === 'state')
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  if (isSupabaseConfigured && !isTestEnvironment()) {
    try {
      const client = getSupabase();
      const { data, error } = await client
        .from('administrative_units')
        .select('*')
        .eq('unit_type', 'state')
        .order('name', { ascending: true });

      if (!error && data && data.length > 0) {
        return data as AdministrativeUnit[];
      }
    } catch {}
  }

  return inMemoryUnitsStore
    .filter((u) => u.unit_type === 'state')
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Retrieves all Districts under a specified State code.
 */
export async function getDistricts(stateCode: string): Promise<AdministrativeUnit[]> {
  const normalizedStateCode = String(stateCode).trim();

  if (inMemoryUnitsStore.some((u) => u.unit_type === 'district' && u.state_code === normalizedStateCode)) {
    return inMemoryUnitsStore
      .filter((u) => u.unit_type === 'district' && u.state_code === normalizedStateCode)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  if (isSupabaseConfigured && !isTestEnvironment()) {
    try {
      const client = getSupabase();
      const { data, error } = await client
        .from('administrative_units')
        .select('*')
        .eq('unit_type', 'district')
        .eq('state_code', normalizedStateCode)
        .order('name', { ascending: true });

      if (!error && data && data.length > 0) {
        return data as AdministrativeUnit[];
      }
    } catch {}
  }

  return inMemoryUnitsStore
    .filter((u) => u.unit_type === 'district' && u.state_code === normalizedStateCode)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Retrieves Sub-Districts / Tehsils under a specified District code.
 */
export async function getSubDistricts(districtCode: string): Promise<AdministrativeUnit[]> {
  const normalizedDistrictCode = String(districtCode).trim();

  if (inMemoryUnitsStore.some((u) => u.unit_type === 'sub_district' && u.district_code === normalizedDistrictCode)) {
    return inMemoryUnitsStore
      .filter((u) => u.unit_type === 'sub_district' && u.district_code === normalizedDistrictCode)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  if (isSupabaseConfigured && !isTestEnvironment()) {
    try {
      const client = getSupabase();
      const { data, error } = await client
        .from('administrative_units')
        .select('*')
        .eq('unit_type', 'sub_district')
        .eq('district_code', normalizedDistrictCode)
        .order('name', { ascending: true });

      if (!error && data && data.length > 0) {
        return data as AdministrativeUnit[];
      }
    } catch {}
  }

  return inMemoryUnitsStore
    .filter((u) => u.unit_type === 'sub_district' && u.district_code === normalizedDistrictCode)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Retrieves Localities / Villages under a specified Sub-District code.
 */
export async function getLocalities(subDistrictCode: string): Promise<AdministrativeUnit[]> {
  const normalizedSubDistrictCode = String(subDistrictCode).trim();
  const res = await getVillages(normalizedSubDistrictCode, { limit: 500 });
  return res.villages;
}

export interface VillagePaginationOptions {
  page?: number;
  limit?: number;
  search?: string;
}

export interface PaginatedVillagesResult {
  villages: AdministrativeUnit[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Retrieves Villages under a specified Sub-District code with server-side pagination & search.
 */
export async function getVillages(
  subDistrictCode: string,
  options: VillagePaginationOptions = {}
): Promise<PaginatedVillagesResult> {
  const normalizedSubDistrictCode = String(subDistrictCode).trim();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(500, Math.max(1, options.limit || 50));
  const offset = (page - 1) * limit;
  const search = options.search?.trim();

  if (inMemoryUnitsStore.some((u) => (u.unit_type === 'village' || u.unit_type === 'locality') && u.sub_district_code === normalizedSubDistrictCode)) {
    let filtered = inMemoryUnitsStore.filter(
      (u) =>
        (u.unit_type === 'village' || u.unit_type === 'locality') &&
        u.sub_district_code === normalizedSubDistrictCode
    );

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (v) =>
          v.name.toLowerCase().includes(searchLower) ||
          v.code.toLowerCase().includes(searchLower) ||
          (v.local_name && v.local_name.toLowerCase().includes(searchLower))
      );
    }

    const total = filtered.length;
    const paginated = filtered
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(offset, offset + limit);

    return {
      villages: paginated,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  if (isVillageDatabasePopulated() && !isTestEnvironment()) {
    try {
      const engineRes = queryVillagesBySubDistrict(normalizedSubDistrictCode, search, limit, offset);
      if (engineRes.total > 0) {
        return engineRes;
      }
    } catch {}
  }

  if (isSupabaseConfigured && !isTestEnvironment()) {
    try {
      const client = getSupabase();
      let query = client
        .from('administrative_units')
        .select('*', { count: 'exact' })
        .in('unit_type', ['village', 'locality'])
        .eq('sub_district_code', normalizedSubDistrictCode);

      if (search) {
        query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,local_name.ilike.%${search}%`);
      }

      query = query
        .order('name', { ascending: true })
        .range(offset, offset + limit - 1);

      const { data, count, error } = await query;
      if (!error && data && data.length > 0) {
        const total = count ?? data.length;
        return {
          villages: data as AdministrativeUnit[],
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        };
      }
    } catch {}
  }

  let filtered = inMemoryUnitsStore.filter(
    (u) =>
      (u.unit_type === 'village' || u.unit_type === 'locality') &&
      u.sub_district_code === normalizedSubDistrictCode
  );

  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(
      (v) =>
        v.name.toLowerCase().includes(searchLower) ||
        v.code.toLowerCase().includes(searchLower) ||
        (v.local_name && v.local_name.toLowerCase().includes(searchLower))
    );
  }

  const total = filtered.length;
  const paginated = filtered
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(offset, offset + limit);

  return {
    villages: paginated,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Retrieves a single administrative unit by its official LGD code and optional unit type.
 */
export async function getAdministrativeUnitByCode(
  code: string,
  unitType?: AdminUnitType
): Promise<AdministrativeUnit | null> {
  const normalizedCode = String(code).trim();

  // Check in-memory store first
  const foundMem = inMemoryUnitsStore.find((u) => {
    if (u.code !== normalizedCode) return false;
    if (unitType) {
      if (unitType === 'village') {
        return u.unit_type === 'village' || u.unit_type === 'locality';
      }
      return u.unit_type === unitType;
    }
    return true;
  });

  if (foundMem) {
    return foundMem;
  }

  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test' || Boolean(process.env.VITEST);
  if (!isTestEnv && isSupabaseConfigured) {
    try {
      const client = getSupabase();
      let query = client
        .from('administrative_units')
        .select('*')
        .eq('code', normalizedCode);

      if (unitType) {
        if (unitType === 'village') {
          query = query.in('unit_type', ['village', 'locality']);
        } else {
          query = query.eq('unit_type', unitType);
        }
      }

      const { data, error } = await query.limit(1).maybeSingle();
      if (!error && data) {
        return data as AdministrativeUnit;
      }
    } catch {}
  }

  // Check SQLite village engine for village unit type or unspecified type (in live runtime)
  if (!isTestEnv && (!unitType || unitType === 'village')) {
    const village = getVillageByCodeEngine(normalizedCode);
    if (village) return village;
  }

  return null;
}

/**
 * Searches administrative units across names and LGD codes.
 */
export async function searchAdministrativeUnits(
  queryText: string,
  options: { unit_type?: AdminUnitType; limit?: number } = {}
): Promise<AdministrativeUnit[]> {
  const search = String(queryText).trim();
  if (!search) return [];

  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const searchLower = search.toLowerCase();

  if (inMemoryUnitsStore.length > 0) {
    const results = inMemoryUnitsStore.filter((u) => {
      if (options.unit_type) {
        if (options.unit_type === 'village') {
          if (u.unit_type !== 'village' && u.unit_type !== 'locality') return false;
        } else if (u.unit_type !== options.unit_type) {
          return false;
        }
      }
      return (
        u.name.toLowerCase().includes(searchLower) ||
        u.code.toLowerCase().includes(searchLower) ||
        (u.local_name && u.local_name.toLowerCase().includes(searchLower))
      );
    });

    if (results.length > 0) {
      return results.slice(0, limit);
    }
  }

  if (isSupabaseConfigured && !isTestEnvironment()) {
    try {
      const client = getSupabase();
      let query = client
        .from('administrative_units')
        .select('*')
        .or(`name.ilike.%${search}%,code.ilike.%${search}%,local_name.ilike.%${search}%`);

      if (options.unit_type) {
        if (options.unit_type === 'village') {
          query = query.in('unit_type', ['village', 'locality']);
        } else {
          query = query.eq('unit_type', options.unit_type);
        }
      }

      query = query.order('name', { ascending: true }).limit(limit);

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data as AdministrativeUnit[];
      }
    } catch {}
  }

  if ((!options.unit_type || options.unit_type === 'village') && isVillageDatabasePopulated() && !isTestEnvironment()) {
    try {
      const vResults = searchVillagesEngine(search, limit);
      if (vResults.length > 0) {
        return vResults;
      }
    } catch {}
  }

  return [];
}

/**
 * Returns total count of administrative units currently loaded.
 */
export async function getTotalUnitsCount(): Promise<number> {
  if (inMemoryUnitsStore.length > 0) {
    return inMemoryUnitsStore.length;
  }
  if (process.env.NODE_ENV === 'production' && isSupabaseConfigured) {
    try {
      const client = getSupabase();
      const { count, error } = await client
        .from('administrative_units')
        .select('*', { count: 'exact', head: true });
      if (!error && typeof count === 'number') {
        return count;
      }
    } catch {}
  }
  return inMemoryUnitsStore.length;
}

/**
 * Returns count of administrative units for a specific tier.
 */
export async function getUnitsCountByTier(unitType: AdminUnitType): Promise<number> {
  if (inMemoryUnitsStore.length > 0) {
    if (unitType === 'village') {
      return inMemoryUnitsStore.filter((u) => u.unit_type === 'village' || u.unit_type === 'locality').length;
    }
    return inMemoryUnitsStore.filter((u) => u.unit_type === unitType).length;
  }

  if (process.env.NODE_ENV === 'production' && isSupabaseConfigured) {
    try {
      const client = getSupabase();
      let query = client
        .from('administrative_units')
        .select('*', { count: 'exact', head: true });

      if (unitType === 'village') {
        query = query.in('unit_type', ['village', 'locality']);
      } else {
        query = query.eq('unit_type', unitType);
      }

      const { count, error } = await query;
      if (!error && typeof count === 'number') {
        return count;
      }
    } catch {}
  }

  if (unitType === 'village') {
    return inMemoryUnitsStore.filter((u) => u.unit_type === 'village' || u.unit_type === 'locality').length;
  }
  return inMemoryUnitsStore.filter((u) => u.unit_type === unitType).length;
}

/**
 * Checks active geography data source operational status from registry.
 */
export async function getLGDDataSourceStatus(): Promise<'operational' | 'administrative_enrichment_unavailable'> {
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test' || Boolean(process.env.VITEST);
  if (!isTestEnv && isSupabaseConfigured) {
    try {
      const client = getSupabase();
      const activeSourceId = resolveActiveGeographySourceId();
      const { data } = await client
        .from('data_sources')
        .select('status')
        .eq('id', activeSourceId)
        .maybeSingle();

      if (data && data.status === 'operational') {
        return 'operational';
      }
      if (data && data.status && data.status !== 'operational') {
        return 'administrative_enrichment_unavailable';
      }
    } catch {}
  }

  if (inMemoryUnitsStore.length > 0) {
    return 'operational';
  }

  return 'administrative_enrichment_unavailable';
}

export interface AdministrativeEnrichmentResult {
  status: 'operational' | 'administrative_enrichment_unavailable';
  state?: AdministrativeUnit | null;
  district?: AdministrativeUnit | null;
  sub_district?: AdministrativeUnit | null;
  village?: AdministrativeUnit | null;
  provenance: {
    /** Source id the resolved rows actually carry — falls back to the configured active source. */
    source: string;
    resolved_at: string;
    method: 'code_lookup' | 'unavailable';
  };
}

/**
 * Resolves authoritative administrative hierarchy for an entity (Project, Case, or Parcel)
 * using official LGD codes. Returns administrative_enrichment_unavailable if codes are not registered.
 */
export async function resolveAdministrativeEnrichment(options: {
  stateLgdCode?: string | null;
  districtLgdCode?: string | null;
  subdistrictLgdCode?: string | null;
  villageLgdCode?: string | null;
}): Promise<AdministrativeEnrichmentResult> {
  const resolvedAt = new Date().toISOString();

  const state = options.stateLgdCode
    ? await getAdministrativeUnitByCode(options.stateLgdCode, 'state')
    : null;
  const district = options.districtLgdCode
    ? await getAdministrativeUnitByCode(options.districtLgdCode, 'district')
    : null;
  const subDistrict = options.subdistrictLgdCode
    ? await getAdministrativeUnitByCode(options.subdistrictLgdCode, 'sub_district')
    : null;
  const village = options.villageLgdCode
    ? await getAdministrativeUnitByCode(options.villageLgdCode, 'village')
    : null;

  const hasAnyResolution = Boolean(state || district || subDistrict || village);

  // Provenance reports the source the resolved rows actually carry — never a
  // hardcoded source id. When nothing resolves, fall back to the configured
  // active source so callers still see where data would come from.
  const resolvedSourceId =
    state?.source_id ?? district?.source_id ?? subDistrict?.source_id ?? village?.source_id ?? null;

  return {
    status: hasAnyResolution ? 'operational' : 'administrative_enrichment_unavailable',
    state,
    district,
    sub_district: subDistrict,
    village,
    provenance: {
      source: resolvedSourceId ?? getActiveGeographySource().id,
      resolved_at: resolvedAt,
      method: hasAnyResolution ? 'code_lookup' : 'unavailable',
    },
  };
}

/**
 * Registers an administrative unit (used during import and sync pipeline processing).
 */
export async function registerAdministrativeUnit(
  unit: Omit<AdministrativeUnit, 'id' | 'created_at' | 'updated_at'>
): Promise<AdministrativeUnit> {
  const timestamp = new Date().toISOString();
  const newUnit: AdministrativeUnit = {
    ...unit,
    id: `admin-${unit.unit_type}-${unit.code}`,
    is_active: unit.is_active ?? true,
    created_at: timestamp,
    updated_at: timestamp,
  };

  // Keep in-memory store synchronized
  const existingIdx = inMemoryUnitsStore.findIndex(
    (u) => u.unit_type === unit.unit_type && u.code === unit.code
  );
  if (existingIdx >= 0) {
    inMemoryUnitsStore[existingIdx] = { ...inMemoryUnitsStore[existingIdx], ...newUnit };
  } else {
    inMemoryUnitsStore.push(newUnit);
  }

  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test' || Boolean(process.env.VITEST);
  if (!isTestEnv && isSupabaseConfigured) {
    try {
      const client = getSupabase();
      const { data, error } = await client
        .from('administrative_units')
        .upsert(
          {
            parent_id: newUnit.parent_id,
            unit_type: newUnit.unit_type,
            code: newUnit.code,
            name: newUnit.name,
            local_name: newUnit.local_name,
            state_code: newUnit.state_code,
            district_code: newUnit.district_code,
            sub_district_code: newUnit.sub_district_code,
            census_code: newUnit.census_code,
            is_active: newUnit.is_active,
            centroid: newUnit.centroid,
            boundary_geojson: newUnit.boundary_geojson,
            source_id: newUnit.source_id || 'lgd_india',
            source_resource_id: newUnit.source_resource_id,
            source_record_ref: newUnit.source_record_ref,
            last_synced_at: newUnit.last_synced_at || timestamp,
            metadata: newUnit.metadata || {},
          },
          { onConflict: 'unit_type,code' }
        )
        .select('*')
        .single();

      if (!error && data) {
        return data as AdministrativeUnit;
      }
    } catch {}
  }

  return newUnit;
}

export interface CreateSubDistrictInput {
  name: string;
  code: string;
  state_code: string;
  district_code: string;
  local_name?: string | null;
  created_by?: string;
}

/**
 * Creates a missing Sub-District / Tehsil under a specified State and District.
 * Validates hierarchy integrity, checks code uniqueness, and persists to administrative_units
 * with non-authoritative reference provenance.
 */
export async function createSubDistrict(input: CreateSubDistrictInput): Promise<AdministrativeUnit> {
  const name = input.name?.trim();
  const code = input.code?.trim();
  const stateCode = input.state_code?.trim();
  const districtCode = input.district_code?.trim();
  const localName = input.local_name?.trim() || null;

  if (!name) throw new Error('Sub-district name is required');
  if (!code) throw new Error('Sub-district code is required');
  if (!stateCode) throw new Error('State code is required');
  if (!districtCode) throw new Error('District code is required');

  // 1. Verify parent State exists
  const state = await getAdministrativeUnitByCode(stateCode, 'state');
  if (!state) {
    throw new Error(`Parent State with code "${stateCode}" does not exist in the administrative hierarchy`);
  }

  // 2. Verify parent District exists
  const district = await getAdministrativeUnitByCode(districtCode, 'district');
  if (!district) {
    throw new Error(`Parent District with code "${districtCode}" does not exist in the administrative hierarchy`);
  }

  // 3. Verify District belongs to selected State
  if (district.state_code && district.state_code !== stateCode) {
    throw new Error(`District "${district.name}" (${districtCode}) belongs to state "${district.state_code}", not "${stateCode}"`);
  }

  // 4. Verify Sub-District code uniqueness
  const existing = await getAdministrativeUnitByCode(code, 'sub_district');
  if (existing) {
    throw new Error(`A Sub-District / Tehsil with code "${code}" already exists ("${existing.name}")`);
  }

  const timestamp = new Date().toISOString();
  const newUnit: AdministrativeUnit = {
    id: crypto.randomUUID(),
    parent_id: district.id,
    unit_type: 'sub_district',
    code,
    name,
    local_name: localName,
    state_code: stateCode,
    district_code: districtCode,
    is_active: true,
    source_id: 'lgd_reference_mirror',
    metadata: {
      provenance: {
        source: 'manual_entry',
        created_by: input.created_by || 'Authorized Officer',
        created_at: timestamp,
        authoritative: false,
        note: 'Manually registered reference sub-district',
      },
    },
    created_at: timestamp,
    updated_at: timestamp,
  };

  if (isSupabaseConfigured && !isTestEnvironment()) {
    const client = getSupabase();
    const { data, error } = await client
      .from('administrative_units')
      .insert({
        id: newUnit.id,
        parent_id: district.id,
        unit_type: 'sub_district',
        code: newUnit.code,
        name: newUnit.name,
        local_name: newUnit.local_name,
        state_code: newUnit.state_code,
        district_code: newUnit.district_code,
        is_active: true,
        source_id: 'lgd_reference_mirror',
        metadata: newUnit.metadata,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to persist sub-district to database: ${error.message}`);
    }

    seedInMemoryUnits([data as AdministrativeUnit]);
    return data as AdministrativeUnit;
  }

  seedInMemoryUnits([newUnit]);
  return newUnit;
}
