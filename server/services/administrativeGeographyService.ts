import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { AdministrativeUnit, AdminUnitType } from '../../shared/types';

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

/**
 * Retrieves all registered States in the administrative hierarchy.
 */
export async function getStates(): Promise<AdministrativeUnit[]> {
  if (inMemoryUnitsStore.some((u) => u.unit_type === 'state')) {
    return inMemoryUnitsStore
      .filter((u) => u.unit_type === 'state')
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  if (isSupabaseConfigured) {
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

  if (isSupabaseConfigured) {
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

  if (isSupabaseConfigured) {
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

  if (isSupabaseConfigured) {
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

  if (isSupabaseConfigured) {
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
 * Checks authoritative LGD data source operational status from registry.
 */
export async function getLGDDataSourceStatus(): Promise<'operational' | 'administrative_enrichment_unavailable'> {
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test' || Boolean(process.env.VITEST);
  if (!isTestEnv && isSupabaseConfigured) {
    try {
      const client = getSupabase();
      const { data } = await client
        .from('data_sources')
        .select('status')
        .eq('id', 'lgd_india')
        .single();

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
    source: 'lgd_india';
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

  return {
    status: hasAnyResolution ? 'operational' : 'administrative_enrichment_unavailable',
    state,
    district,
    sub_district: subDistrict,
    village,
    provenance: {
      source: 'lgd_india',
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
