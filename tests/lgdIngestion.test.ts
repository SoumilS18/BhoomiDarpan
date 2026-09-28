import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import {
  normalizeLgdSourceRecord,
  isRecordIdentical,
  ingestLgdTier,
  executeAuthoritativeLgdSync,
  getLgdSyncStatus,
  resetLgdSyncLockForTests,
} from '../server/services/lgdIngestionService';
import {
  clearInMemoryUnits,
  seedInMemoryUnits,
  getStates,
  getDistricts,
  getSubDistricts,
  getVillages,
  getAdministrativeUnitByCode,
  searchAdministrativeUnits,
  resolveAdministrativeEnrichment,
} from '../server/services/administrativeGeographyService';
import {
  getAuthorizedScopeFilter,
  applyScopeFilter,
  applyScopeAndQueryParams,
} from '../server/services/portfolioAnalyzer';
import { AdministrativeUnit, CaseEnrichedForPortfolio, UserProfile } from '../shared/types';
import express from 'express';
import { administrationRouter } from '../server/routes/administration.routes';
import '../server/index';

// Canonical test mock data reflecting official OGD India schemas
const MOCK_LGD_DATA = {
  states: [
    {
      state_code: 12,
      state_name_english: 'Arunachal Pradesh',
      state_name_local: 'ARUNACHAL PRADESH',
      state_census2011_code: '12',
      state_or_ut: 'S',
      last_updated: '2024-10-07',
    },
    {
      state_code: 32,
      state_name_english: 'Kerala',
      state_name_local: 'KERALA',
      state_census2011_code: '32',
      state_or_ut: 'S',
      last_updated: '2024-10-07',
    },
  ],
  districts: [
    {
      state_code: 32,
      state_name_english: 'Kerala',
      district_code: 554,
      district_name_english: 'Alappuzha',
      district_name_local: 'ആലപ്പുഴ',
      district_census2011_code: '598',
    },
    {
      state_code: 32,
      state_name_english: 'Kerala',
      district_code: 555,
      district_name_english: 'Ernakulam',
      district_name_local: 'എറണാകുളം',
      district_census2011_code: '595',
    },
  ],
  subDistricts: [
    {
      state_code: 32,
      state_name_english: 'Kerala',
      district_code: 555,
      district_name_english: 'Ernakulam',
      subdistrict_code: 5214,
      subdistrict_name_english: 'Kanayannur',
      subdistrict_name_local: 'കണയന്നൂർ',
      subdistrict_census2011_code: '05214',
    },
  ],
  villages: [
    {
      villageCode: 627980,
      villageNameEnglish: 'Edappally North',
      villageNameLocal: 'ഇടപ്പള്ളി വടക്ക്',
      villageCensus2011Code: '627980',
      subdistrictCode: 5214,
      subdistrictNameEnglish: 'Kanayannur',
      districtCode: 555,
      districtNameEnglish: 'Ernakulam',
      stateCode: 32,
      stateNameEnglish: 'Kerala',
      data_gov_update_date: '2026-01-20',
    },
    {
      villageCode: 627981,
      villageNameEnglish: 'Kakkanad',
      villageNameLocal: 'കാക്കനാട്',
      villageCensus2011Code: '627981',
      subdistrictCode: 5214,
      subdistrictNameEnglish: 'Kanayannur',
      districtCode: 555,
      districtNameEnglish: 'Ernakulam',
      stateCode: 32,
      stateNameEnglish: 'Kerala',
      data_gov_update_date: '2026-01-20',
    },
  ],
};

describe('LGD Authoritative Administrative Geography Ingestion & Integration Suite', () => {
  beforeEach(() => {
    clearInMemoryUnits();
    resetLgdSyncLockForTests();
  });

  afterEach(() => {
    clearInMemoryUnits();
    resetLgdSyncLockForTests();
  });

  // ==========================================================================
  // 1. SCHEMA NORMALIZATION ENGINE
  // ==========================================================================
  describe('1. Schema Normalization Engine', () => {
    it('normalizes State records from snake_case OGD schema accurately', () => {
      const normalized = normalizeLgdSourceRecord('states', MOCK_LGD_DATA.states[0], 'res-state-1');
      expect(normalized).not.toBeNull();
      expect(normalized?.unit_type).toBe('state');
      expect(normalized?.code).toBe('12');
      expect(normalized?.name).toBe('Arunachal Pradesh');
      expect(normalized?.census_code).toBe('12');
      expect(normalized?.parent_code).toBeNull();
    });

    it('normalizes District records with parent State code linkage', () => {
      const normalized = normalizeLgdSourceRecord('districts', MOCK_LGD_DATA.districts[0], 'res-dist-1');
      expect(normalized).not.toBeNull();
      expect(normalized?.unit_type).toBe('district');
      expect(normalized?.code).toBe('554');
      expect(normalized?.name).toBe('Alappuzha');
      expect(normalized?.parent_code).toBe('32');
      expect(normalized?.state_code).toBe('32');
      expect(normalized?.district_code).toBe('554');
    });

    it('normalizes Sub-District records with parent District and State codes', () => {
      const normalized = normalizeLgdSourceRecord('subDistricts', MOCK_LGD_DATA.subDistricts[0], 'res-sub-1');
      expect(normalized).not.toBeNull();
      expect(normalized?.unit_type).toBe('sub_district');
      expect(normalized?.code).toBe('5214');
      expect(normalized?.name).toBe('Kanayannur');
      expect(normalized?.parent_code).toBe('555');
      expect(normalized?.district_code).toBe('555');
      expect(normalized?.state_code).toBe('32');
    });

    it('normalizes Village records from camelCase OGD schema with complete parent hierarchy', () => {
      const normalized = normalizeLgdSourceRecord('villages', MOCK_LGD_DATA.villages[0], 'res-vil-1');
      expect(normalized).not.toBeNull();
      expect(normalized?.unit_type).toBe('village');
      expect(normalized?.code).toBe('627980');
      expect(normalized?.name).toBe('Edappally North');
      expect(normalized?.parent_code).toBe('5214');
      expect(normalized?.sub_district_code).toBe('5214');
      expect(normalized?.district_code).toBe('555');
      expect(normalized?.state_code).toBe('32');
    });

    it('rejects corrupt records missing official LGD codes or names', () => {
      const invalid = normalizeLgdSourceRecord('states', { state_name_english: '' }, 'res-1');
      expect(invalid).toBeNull();
    });
  });

  // ==========================================================================
  // 2. HIERARCHY INTEGRITY & DEPENDENCY ORDER
  // ==========================================================================
  describe('2. Hierarchy Integrity & Sequential Dependency', () => {
    it('strictly rejects orphan child records when required parent unit does not exist', async () => {
      // Attempt to ingest district before state exists
      const distSummary = await ingestLgdTier('districts', {
        recordsOverride: MOCK_LGD_DATA.districts,
      });

      expect(distSummary.records_received).toBe(2);
      expect(distSummary.records_inserted).toBe(0);
      expect(distSummary.orphan_records).toBe(2);
      expect(distSummary.records_rejected).toBe(2);
      expect(distSummary.validation_errors.length).toBeGreaterThanOrEqual(2);
      expect(distSummary.validation_errors[0].code).toBe('MISSING_PARENT_HIERARCHY');
    });

    it('successfully ingests complete hierarchy when processed in statutory dependency order', async () => {
      // 1. States
      const stateSummary = await ingestLgdTier('states', {
        recordsOverride: MOCK_LGD_DATA.states,
      });
      expect(stateSummary.records_inserted).toBe(2);
      expect(stateSummary.orphan_records).toBe(0);

      // 2. Districts
      const distSummary = await ingestLgdTier('districts', {
        recordsOverride: MOCK_LGD_DATA.districts,
      });
      expect(distSummary.records_inserted).toBe(2);
      expect(distSummary.orphan_records).toBe(0);

      // 3. Sub-Districts
      const subSummary = await ingestLgdTier('subDistricts', {
        recordsOverride: MOCK_LGD_DATA.subDistricts,
      });
      expect(subSummary.records_inserted).toBe(1);
      expect(subSummary.orphan_records).toBe(0);

      // 4. Villages
      const vilSummary = await ingestLgdTier('villages', {
        recordsOverride: MOCK_LGD_DATA.villages,
      });
      expect(vilSummary.records_inserted).toBe(2);
      expect(vilSummary.orphan_records).toBe(0);

      // Verify DB / Memory State
      const states = await getStates();
      expect(states.length).toBe(2);

      const districts = await getDistricts('32');
      expect(districts.length).toBe(2);
      expect(districts.map((d) => d.name)).toContain('Ernakulam');

      const subDistricts = await getSubDistricts('555');
      expect(subDistricts.length).toBe(1);
      expect(subDistricts[0].name).toBe('Kanayannur');

      const villageResult = await getVillages('5214');
      expect(villageResult.villages.length).toBe(2);
      expect(villageResult.total).toBe(2);
    });
  });

  // ==========================================================================
  // 3. IDEMPOTENT UPSERT & CHANGE DETECTION
  // ==========================================================================
  describe('3. Idempotent Upsert & Change Detection', () => {
    it('handles repeated sync runs idempotently with zero duplicate rows and reports unchanged count', async () => {
      // Run 1: Ingest states
      const run1 = await ingestLgdTier('states', { recordsOverride: MOCK_LGD_DATA.states });
      expect(run1.records_inserted).toBe(2);
      expect(run1.records_unchanged).toBe(0);

      // Run 2: Re-run with identical records
      const run2 = await ingestLgdTier('states', { recordsOverride: MOCK_LGD_DATA.states });
      expect(run2.records_inserted).toBe(0);
      expect(run2.records_updated).toBe(0);
      expect(run2.records_unchanged).toBe(2);

      const allStates = await getStates();
      expect(allStates.length).toBe(2); // Never duplicated
    });

    it('accurately detects and updates modified records while preserving historical entity stability', async () => {
      // Initial ingestion
      await ingestLgdTier('states', { recordsOverride: MOCK_LGD_DATA.states });

      // Modified data with updated local name
      const modifiedStates = [
        {
          ...MOCK_LGD_DATA.states[0],
          state_name_local: 'ARUNACHAL PRADESH (UPDATED)',
        },
      ];

      const updateRun = await ingestLgdTier('states', { recordsOverride: modifiedStates });
      expect(updateRun.records_updated).toBe(1);
      expect(updateRun.records_inserted).toBe(0);

      const updated = await getAdministrativeUnitByCode('12', 'state');
      expect(updated?.local_name).toBe('ARUNACHAL PRADESH (UPDATED)');
    });
  });

  // ==========================================================================
  // 4. SYNCHRONIZATION MUTEX & TELEMETRY
  // ==========================================================================
  describe('4. Synchronization Mutex & Status Telemetry', () => {
    it('retrieves comprehensive LGD sync telemetry status', async () => {
      const statusBefore = await getLgdSyncStatus();
      expect(statusBefore.is_sync_in_progress).toBe(false);
      expect(statusBefore.operational_status).toBe('never_synced');

      // Execute sync
      await ingestLgdTier('states', { recordsOverride: MOCK_LGD_DATA.states });

      const statusAfter = await getLgdSyncStatus();
      expect(statusAfter.tier_counts.states).toBe(2);
      expect(statusAfter.operational_status).toBe('operational');
    });
  });

  // ==========================================================================
  // 5. SERVER-SIDE SEARCH, PAGINATION & ENRICHMENT
  // ==========================================================================
  describe('5. Search, Server Pagination & Administrative Enrichment', () => {
    beforeEach(async () => {
      // Seed full test hierarchy
      await ingestLgdTier('states', { recordsOverride: MOCK_LGD_DATA.states });
      await ingestLgdTier('districts', { recordsOverride: MOCK_LGD_DATA.districts });
      await ingestLgdTier('subDistricts', { recordsOverride: MOCK_LGD_DATA.subDistricts });
      await ingestLgdTier('villages', { recordsOverride: MOCK_LGD_DATA.villages });
    });

    it('paginates villages server-side without downloading full dataset into client', async () => {
      const page1 = await getVillages('5214', { page: 1, limit: 1 });
      expect(page1.villages.length).toBe(1);
      expect(page1.total).toBe(2);
      expect(page1.totalPages).toBe(2);

      const page2 = await getVillages('5214', { page: 2, limit: 1 });
      expect(page2.villages.length).toBe(1);
      expect(page2.villages[0].code).not.toBe(page1.villages[0].code);
    });

    it('searches administrative units by name or official LGD code across tiers', async () => {
      const resultsByName = await searchAdministrativeUnits('Kakkanad');
      expect(resultsByName.length).toBe(1);
      expect(resultsByName[0].code).toBe('627981');

      const resultsByCode = await searchAdministrativeUnits('555');
      expect(resultsByCode.length).toBeGreaterThanOrEqual(1);
      expect(resultsByCode.some((u) => u.name === 'Ernakulam')).toBe(true);
    });

    it('resolves authoritative administrative enrichment deterministically from official codes', async () => {
      const enrichment = await resolveAdministrativeEnrichment({
        stateLgdCode: '32',
        districtLgdCode: '555',
        subdistrictLgdCode: '5214',
        villageLgdCode: '627980',
      });

      expect(enrichment.status).toBe('operational');
      expect(enrichment.state?.name).toBe('Kerala');
      expect(enrichment.district?.name).toBe('Ernakulam');
      expect(enrichment.sub_district?.name).toBe('Kanayannur');
      expect(enrichment.village?.name).toBe('Edappally North');
    });

    it('truthfully returns administrative_enrichment_unavailable when unmapped codes are supplied', async () => {
      const unavailable = await resolveAdministrativeEnrichment({
        stateLgdCode: '999999',
      });
      expect(unavailable.status).toBe('administrative_enrichment_unavailable');
      expect(unavailable.state).toBeNull();
    });
  });

  // ==========================================================================
  // 6. RBAC & JURISDICTIONAL SCOPE ENFORCEMENT
  // ==========================================================================
  describe('6. RBAC & LGD Jurisdictional Scoping', () => {
    const testCases: CaseEnrichedForPortfolio[] = [
      {
        id: 'c-ernakulam-1',
        case_number: 'BS-KL-ERN-001',
        project_id: 'p-1',
        workflow_id: 'w-1',
        title: 'Metro Extension Parcel A',
        state: 'Kerala',
        district: 'Ernakulam',
        village: 'Kakkanad',
        state_lgd_code: '32',
        district_lgd_code: '555',
        subdistrict_lgd_code: '5214',
        village_lgd_code: '627981',
        total_area_hectares: 5.2,
        estimated_compensation: 1000000,
        status: 'active',
        priority: 'high',
        start_date: '2026-01-01',
        expected_completion_date: '2026-12-31',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'c-alappuzha-1',
        case_number: 'BS-KL-ALP-001',
        project_id: 'p-2',
        workflow_id: 'w-1',
        title: 'Coastal Bypass Phase II',
        state: 'Kerala',
        district: 'Alappuzha',
        village: 'Ambalapuzha',
        state_lgd_code: '32',
        district_lgd_code: '554',
        total_area_hectares: 8.4,
        estimated_compensation: 2000000,
        status: 'active',
        priority: 'medium',
        start_date: '2026-01-01',
        expected_completion_date: '2026-12-31',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    it('restricts Revenue Inspector by jurisdiction_district_lgd_code strictly server-side', () => {
      const inspectorErnakulam: UserProfile = {
        id: 'usr-ri-1',
        email: 'ri.ernakulam@gov.in',
        full_name: 'Revenue Inspector Ernakulam',
        role: 'revenue_inspector',
        department: 'Revenue Dept',
        jurisdiction_district_lgd_code: '555',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const scope = getAuthorizedScopeFilter(inspectorErnakulam as any);
      expect(scope.isRestricted).toBe(true);
      expect(scope.allowedDistrictLgdCodes).toContain('555');

      const scopedCases = applyScopeFilter(testCases, scope);
      expect(scopedCases.length).toBe(1);
      expect(scopedCases[0].id).toBe('c-ernakulam-1');
    });

    it('allows Admin unrestricted national portfolio visibility across all LGD jurisdictions', () => {
      const adminUser: UserProfile = {
        id: 'usr-admin-1',
        email: 'admin@bhoomidarpan.gov.in',
        full_name: 'National Administrator',
        role: 'admin',
        department: 'Ministry of Land Resources',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const scope = getAuthorizedScopeFilter(adminUser as any);
      expect(scope.isRestricted).toBe(false);

      const scopedCases = applyScopeFilter(testCases, scope);
      expect(scopedCases.length).toBe(2);
    });

    it('filters cases by official LGD codes via applyScopeAndQueryParams', () => {
      const scope = getAuthorizedScopeFilter({ role: 'admin', full_name: 'Admin' } as any);

      const filteredByDistrictLgd = applyScopeAndQueryParams(testCases, scope, {
        district_lgd_code: '554',
      });
      expect(filteredByDistrictLgd.length).toBe(1);
      expect(filteredByDistrictLgd[0].district).toBe('Alappuzha');

      const filteredByVillageLgd = applyScopeAndQueryParams(testCases, scope, {
        village_lgd_code: '627981',
      });
      expect(filteredByVillageLgd.length).toBe(1);
      expect(filteredByVillageLgd[0].village).toBe('Kakkanad');
    });
  });

  // ==========================================================================
  // 7. LIVE HTTP API BOUNDARY
  // ==========================================================================
  describe('7. HTTP Administration API Endpoints', () => {
    let server: any;
    let testPort: number;

    beforeAll(async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/api/administration', administrationRouter);

      await new Promise<void>((resolve) => {
        server = testApp.listen(0, () => {
          testPort = (server.address() as any).port;
          resolve();
        });
      });
    });

    afterAll(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    beforeEach(async () => {
      clearInMemoryUnits();
      await ingestLgdTier('states', { recordsOverride: MOCK_LGD_DATA.states });
      await ingestLgdTier('districts', { recordsOverride: MOCK_LGD_DATA.districts });
      await ingestLgdTier('subDistricts', { recordsOverride: MOCK_LGD_DATA.subDistricts });
      await ingestLgdTier('villages', { recordsOverride: MOCK_LGD_DATA.villages });
    });

    it('GET /api/administration/states returns all registered states', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/administration/states`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.states)).toBe(true);
      expect(body.count).toBeGreaterThanOrEqual(2);
    });

    it('GET /api/administration/states/:stateCode/districts returns districts under state', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/administration/states/32/districts`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.state_code).toBe('32');
      expect(body.districts.length).toBe(2);
    });

    it('GET /api/administration/subdistricts/:code/villages returns paginated villages', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/administration/subdistricts/5214/villages?page=1&limit=1`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.villages.length).toBe(1);
      expect(body.total).toBe(2);
      expect(body.totalPages).toBe(2);
    });

    it('POST /api/administration/sync rejects unauthenticated requests with HTTP 401', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/administration/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: 'states' }),
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/administration/sync rejects non-supervisory role (viewer) with HTTP 403', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/administration/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-test-token-viewer',
          'x-eval-role': 'viewer',
        },
        body: JSON.stringify({ tier: 'states' }),
      });
      expect(res.status).toBe(403);
    });
  });
});
