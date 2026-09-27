import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { startLiveApi, type LiveApi } from './helpers/liveApi';
import {
  clearInMemoryUnits,
  seedInMemoryUnits,
  getSubDistricts,
} from '../server/services/administrativeGeographyService';
import { geocodingService } from '../server/services/geocodingService';
import { AdministrativeUnit } from '../shared/types';

let api: LiveApi;

const SEED_STATE: AdministrativeUnit = {
  id: '00000000-0000-0000-0000-000000000001',
  unit_type: 'state',
  code: 'UP',
  name: 'Uttar Pradesh',
  is_active: true,
  source_id: 'lgd_reference_mirror',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const SEED_STATE_2: AdministrativeUnit = {
  id: '00000000-0000-0000-0000-000000000002',
  unit_type: 'state',
  code: 'MH',
  name: 'Maharashtra',
  is_active: true,
  source_id: 'lgd_reference_mirror',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const SEED_DISTRICT: AdministrativeUnit = {
  id: '00000000-0000-0000-0000-000000000010',
  parent_id: SEED_STATE.id,
  unit_type: 'district',
  code: 'GBN',
  name: 'Gautam Buddha Nagar',
  state_code: 'UP',
  is_active: true,
  source_id: 'lgd_reference_mirror',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const SEED_SUBDISTRICT: AdministrativeUnit = {
  id: '00000000-0000-0000-0000-000000000100',
  parent_id: SEED_DISTRICT.id,
  unit_type: 'sub_district',
  code: '5981',
  name: 'Noida',
  state_code: 'UP',
  district_code: 'GBN',
  is_active: true,
  source_id: 'lgd_reference_mirror',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

beforeAll(async () => {
  clearInMemoryUnits();
  api = await startLiveApi();
});

afterAll(async () => {
  clearInMemoryUnits();
  await api?.close();
});

describe('1. Missing Sub-District / Tehsil Creation & Validation', () => {
  beforeEach(() => {
    clearInMemoryUnits();
    seedInMemoryUnits([SEED_STATE, SEED_STATE_2, SEED_DISTRICT, SEED_SUBDISTRICT]);
  });

  it('allows authorized admin to create a missing Sub-District with name and LGD code', async () => {
    const res = await fetch(`${api.url}/api/geography/subdistricts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-eval-role': 'admin',
        'x-eval-user-name': 'Officer Sharma',
      },
      body: JSON.stringify({
        name: 'Jewar',
        code: '5982',
        state_code: 'UP',
        district_code: 'GBN',
        local_name: 'जेवर',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.subdistrict).toBeDefined();
    expect(body.subdistrict.name).toBe('Jewar');
    expect(body.subdistrict.code).toBe('5982');
    expect(body.subdistrict.state_code).toBe('UP');
    expect(body.subdistrict.district_code).toBe('GBN');
    expect(body.subdistrict.local_name).toBe('जेवर');
    expect(body.subdistrict.unit_type).toBe('sub_district');
  });

  it('persists created Sub-District with non-authoritative reference provenance', async () => {
    const res = await fetch(`${api.url}/api/geography/subdistricts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-eval-role': 'lao',
      },
      body: JSON.stringify({
        name: 'Dadri',
        code: '5983',
        state_code: 'UP',
        district_code: 'GBN',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    const unit = body.subdistrict;
    expect(unit.source_id).toBe('lgd_reference_mirror');
    expect(unit.metadata?.provenance?.source).toBe('manual_entry');
    expect(unit.metadata?.provenance?.authoritative).toBe(false);
  });

  it('rejects duplicate Sub-District code with HTTP 409', async () => {
    const res = await fetch(`${api.url}/api/geography/subdistricts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-eval-role': 'admin',
      },
      body: JSON.stringify({
        name: 'Duplicate Noida',
        code: '5981',
        state_code: 'UP',
        district_code: 'GBN',
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('already exists');
  });

  it('rejects Sub-District creation with non-existent parent State', async () => {
    const res = await fetch(`${api.url}/api/geography/subdistricts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-eval-role': 'admin',
      },
      body: JSON.stringify({
        name: 'Ghost Tehsil',
        code: 'GHOST-01',
        state_code: 'NON_EXISTENT_STATE',
        district_code: 'GBN',
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Parent State with code "NON_EXISTENT_STATE" does not exist');
  });

  it('rejects Sub-District creation with non-existent parent District', async () => {
    const res = await fetch(`${api.url}/api/geography/subdistricts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-eval-role': 'admin',
      },
      body: JSON.stringify({
        name: 'Ghost Tehsil',
        code: 'GHOST-02',
        state_code: 'UP',
        district_code: 'NON_EXISTENT_DISTRICT',
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Parent District with code "NON_EXISTENT_DISTRICT" does not exist');
  });

  it('rejects Sub-District creation when District belongs to a different State', async () => {
    const res = await fetch(`${api.url}/api/geography/subdistricts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-eval-role': 'admin',
      },
      body: JSON.stringify({
        name: 'Cross State Tehsil',
        code: 'CROSS-01',
        state_code: 'MH',
        district_code: 'GBN',
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('belongs to state "UP", not "MH"');
  });

  it('rejects unauthorized/anonymous Sub-District creation', async () => {
    const res = await fetch(`${api.url}/api/geography/subdistricts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Anon Tehsil',
        code: 'ANON-01',
        state_code: 'UP',
        district_code: 'GBN',
      }),
    });

    expect(res.status).toBe(401);
  });

  it('rejects viewer role from creating a Sub-District', async () => {
    const res = await fetch(`${api.url}/api/geography/subdistricts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-eval-role': 'viewer',
      },
      body: JSON.stringify({
        name: 'Viewer Tehsil',
        code: 'VIEW-01',
        state_code: 'UP',
        district_code: 'GBN',
      }),
    });

    expect(res.status).toBe(403);
  });

  it('newly created Sub-District appears in subsequent geography queries without restart', async () => {
    await fetch(`${api.url}/api/geography/subdistricts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-eval-role': 'admin',
      },
      body: JSON.stringify({
        name: 'Dankaur',
        code: '5984',
        state_code: 'UP',
        district_code: 'GBN',
      }),
    });

    const getRes = await fetch(`${api.url}/api/geography/subdistricts?district=GBN`);
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    const names = body.subdistricts.map((sd: any) => sd.name);
    expect(names).toContain('Dankaur');
  });
});

describe('2. Infrastructure Project Creation & Dynamic Loading', () => {
  it('rejects project creation from anonymous request', async () => {
    const res = await fetch(`${api.url}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: 'TEST-EXP-01',
        name: 'Test Expressway Project',
        project_type: 'highway',
        sponsoring_agency: 'NHAI',
        state: 'Uttar Pradesh',
      }),
    });

    expect(res.status).toBe(401);
  });

  it('rejects project creation from viewer role', async () => {
    const res = await fetch(`${api.url}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-eval-role': 'viewer',
      },
      body: JSON.stringify({
        code: 'TEST-EXP-01',
        name: 'Test Expressway Project',
        project_type: 'highway',
        sponsoring_agency: 'NHAI',
        state: 'Uttar Pradesh',
      }),
    });

    expect(res.status).toBe(403);
  });

  it('rejects project creation with invalid payload (missing required fields)', async () => {
    const res = await fetch(`${api.url}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-eval-role': 'admin',
      },
      body: JSON.stringify({
        code: 'A',
        name: '',
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Validation failed');
  });
});

describe('3. Location-Aware Spatial Resolution & Bounding Box Logic', () => {
  it('resolves spatial coordinates and bounding box dynamically without hardcoding', async () => {
    const results = await geocodingService.forwardGeocode('Gautam Buddha Nagar, Uttar Pradesh, India', { limit: 1 });
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      const first = results[0];
      expect(typeof first.latitude).toBe('number');
      expect(typeof first.longitude).toBe('number');
      expect(first.latitude).toBeGreaterThan(0);
      expect(first.longitude).toBeGreaterThan(0);
      if (first.boundingbox) {
        expect(first.boundingbox.length).toBe(4);
        const [south, north, west, east] = first.boundingbox;
        expect(north).toBeGreaterThanOrEqual(south);
        expect(east).toBeGreaterThanOrEqual(west);
      }
    }
  });

  it('handles empty query honestly without inventing coordinates', async () => {
    const results = await geocodingService.forwardGeocode('   ');
    expect(results).toEqual([]);
  });

  it('does not crash or invent fake coordinates for impossible locations', async () => {
    const results = await geocodingService.forwardGeocode('XYZ_NON_EXISTENT_LOCATION_777888999');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});

describe('4. Selection Cascade & Administrative Hierarchy', () => {
  beforeEach(() => {
    clearInMemoryUnits();
    seedInMemoryUnits([SEED_STATE, SEED_DISTRICT, SEED_SUBDISTRICT]);
  });

  it('retrieves districts filtered by state code', async () => {
    const res = await fetch(`${api.url}/api/geography/districts?state=UP`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.districts.length).toBe(1);
    expect(body.districts[0].code).toBe('GBN');
  });

  it('returns empty list for state with no districts', async () => {
    const res = await fetch(`${api.url}/api/geography/districts?state=MH`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.districts.length).toBe(0);
  });

  it('retrieves sub-districts filtered by district code', async () => {
    const res = await fetch(`${api.url}/api/geography/subdistricts?district=GBN`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subdistricts.length).toBe(1);
    expect(body.subdistricts[0].name).toBe('Noida');
  });
});
