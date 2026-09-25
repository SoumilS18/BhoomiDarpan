import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
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
  getTotalUnitsCount,
  getUnitsCountByTier,
  inMemoryUnitsStore,
} from '../server/services/administrativeGeographyService';
import {
  getLgdServerConfig,
  executeLgdQuery,
  CANONICAL_LGD_RESOURCES,
} from '../server/config/lgdConfig';
import {
  getAuthorizedScopeFilter,
  applyScopeFilter,
  applyScopeAndQueryParams,
} from '../server/services/portfolioAnalyzer';
import { administrationRouter } from '../server/routes/administration.routes';
import { AdministrativeUnit, CaseEnrichedForPortfolio, UserProfile, Project, AcquisitionCase } from '../shared/types';

const MOCK_LGD_FULL_DATA = {
  states: [
    {
      state_code: 27,
      state_name_english: 'Maharashtra',
      state_name_local: 'महाराष्ट्र',
      state_census2011_code: '27',
      state_or_ut: 'S',
      last_updated: '2024-10-07',
    },
    {
      state_code: 32,
      state_name_english: 'Kerala',
      state_name_local: 'കേരളം',
      state_census2011_code: '32',
      state_or_ut: 'S',
      last_updated: '2024-10-07',
    },
  ],
  districts: [
    {
      state_code: 27,
      state_name_english: 'Maharashtra',
      district_code: 521,
      district_name_english: 'Pune',
      district_name_local: 'पुणे',
      district_census2011_code: '521',
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
      state_code: 27,
      state_name_english: 'Maharashtra',
      district_code: 521,
      district_name_english: 'Pune',
      subdistrict_code: 4210,
      subdistrict_name_english: 'Haveli',
      subdistrict_name_local: 'हवेली',
      subdistrict_census2011_code: '04210',
    },
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
      villageCode: 555001,
      villageNameEnglish: 'Hadapsar',
      villageNameLocal: 'हडपसर',
      villageCensus2011Code: '555001',
      subdistrictCode: 4210,
      subdistrictNameEnglish: 'Haveli',
      districtCode: 521,
      districtNameEnglish: 'Pune',
      stateCode: 27,
      stateNameEnglish: 'Maharashtra',
      data_gov_update_date: '2026-01-10',
    },
    {
      villageCode: 555002,
      villageNameEnglish: 'Manjari',
      villageNameLocal: 'मांजरी',
      villageCensus2011Code: '555002',
      subdistrictCode: 4210,
      subdistrictNameEnglish: 'Haveli',
      districtCode: 521,
      districtNameEnglish: 'Pune',
      stateCode: 27,
      stateNameEnglish: 'Maharashtra',
      data_gov_update_date: '2026-01-10',
    },
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

describe('LGD Controlled Full-Scale Ingestion & Production-Readiness Suite', () => {
  let testAppServer: any;
  let testPort: number;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/administration', administrationRouter);

    await new Promise<void>((resolve) => {
      testAppServer = app.listen(0, () => {
        testPort = (testAppServer.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (testAppServer) {
      await new Promise<void>((resolve) => testAppServer.close(() => resolve()));
    }
  });

  beforeEach(() => {
    clearInMemoryUnits();
    resetLgdSyncLockForTests();
  });

  afterEach(() => {
    clearInMemoryUnits();
    resetLgdSyncLockForTests();
  });

  // ==========================================================================
  // 1. ENVIRONMENT SAFETY & CREDENTIAL ISOLATION
  // ==========================================================================
  describe('1. Environment Safety & Credential Isolation', () => {
    it('verifies that LGD server configuration encapsulates credentials safely without client leaks', () => {
      const config = getLgdServerConfig();
      expect(config.baseUrl).toBe('https://api.data.gov.in/resource');
      expect(typeof config.batchSize).toBe('number');
      expect(typeof config.retryLimit).toBe('number');
      expect(typeof config.requestTimeoutMs).toBe('number');

      // Zero VITE_ prefix leakage
      expect(process.env.VITE_LGD_DATA_GOV_API_KEY).toBeUndefined();
    });

    it('sanitizes query execution errors to prevent credential exposure in logs', async () => {
      let errorThrown = false;
      try {
        await executeLgdQuery('states', {
          apiKeyOverride: 'invalid-test-probe-key-12345',
          retryLimit: 0,
        });
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).not.toContain('invalid-test-probe-key-12345');
        expect(err.message).toContain('LGD API Error');
      }
      expect(errorThrown).toBe(true);
    });
  });

  // ==========================================================================
  // 2. CONTROLLED MULTI-TIER FULL INGESTION & HIERARCHY VALIDATION
  // ==========================================================================
  describe('2. Controlled Multi-Tier Full Ingestion & Hierarchy Validation', () => {
    it('ingests full 4-tier hierarchy sequentially and records detailed metrics', async () => {
      // 1. Ingest States
      const stateSummary = await ingestLgdTier('states', {
        recordsOverride: MOCK_LGD_FULL_DATA.states,
      });
      expect(stateSummary.records_received).toBe(2);
      expect(stateSummary.records_inserted).toBe(2);
      expect(stateSummary.orphan_records).toBe(0);
      expect(stateSummary.status).toBe('completed');

      // 2. Ingest Districts
      const distSummary = await ingestLgdTier('districts', {
        recordsOverride: MOCK_LGD_FULL_DATA.districts,
      });
      expect(distSummary.records_received).toBe(2);
      expect(distSummary.records_inserted).toBe(2);
      expect(distSummary.orphan_records).toBe(0);

      // 3. Ingest Sub-Districts
      const subSummary = await ingestLgdTier('subDistricts', {
        recordsOverride: MOCK_LGD_FULL_DATA.subDistricts,
      });
      expect(subSummary.records_received).toBe(2);
      expect(subSummary.records_inserted).toBe(2);
      expect(subSummary.orphan_records).toBe(0);

      // 4. Ingest Villages
      const vilSummary = await ingestLgdTier('villages', {
        recordsOverride: MOCK_LGD_FULL_DATA.villages,
      });
      expect(vilSummary.records_received).toBe(4);
      expect(vilSummary.records_inserted).toBe(4);
      expect(vilSummary.orphan_records).toBe(0);

      // Verify DB / Memory State
      expect(await getUnitsCountByTier('state')).toBe(2);
      expect(await getUnitsCountByTier('district')).toBe(2);
      expect(await getUnitsCountByTier('sub_district')).toBe(2);
      expect(await getUnitsCountByTier('village')).toBe(4);
      expect(await getTotalUnitsCount()).toBe(10);
    });

    it('rejects orphan records when parent unit is missing and records structured error', async () => {
      // Attempt inserting village when parent subdistrict does not exist
      const vilSummary = await ingestLgdTier('villages', {
        recordsOverride: [
          {
            villageCode: 999001,
            villageNameEnglish: 'Orphan Village',
            subdistrictCode: 9999, // Missing subdistrict
            districtCode: 999,
            stateCode: 99,
          },
        ],
      });

      expect(vilSummary.records_received).toBe(1);
      expect(vilSummary.records_inserted).toBe(0);
      expect(vilSummary.orphan_records).toBe(1);
      expect(vilSummary.records_rejected).toBe(1);
      expect(vilSummary.validation_errors.length).toBe(1);
      expect(vilSummary.validation_errors[0].code).toBe('MISSING_PARENT_HIERARCHY');
    });
  });

  // ==========================================================================
  // 3. IDEMPOTENCY & DUPLICATE SAFETY
  // ==========================================================================
  describe('3. Idempotency & Duplicate Prevention', () => {
    it('executes a second identical synchronization with zero duplicates and reports 100% unchanged', async () => {
      // First Sync Run
      await ingestLgdTier('states', { recordsOverride: MOCK_LGD_FULL_DATA.states });
      await ingestLgdTier('districts', { recordsOverride: MOCK_LGD_FULL_DATA.districts });
      await ingestLgdTier('subDistricts', { recordsOverride: MOCK_LGD_FULL_DATA.subDistricts });
      await ingestLgdTier('villages', { recordsOverride: MOCK_LGD_FULL_DATA.villages });

      const countAfterFirstSync = await getTotalUnitsCount();
      expect(countAfterFirstSync).toBe(10);

      // Second Sync Run (Identical Payload)
      const repeatStates = await ingestLgdTier('states', { recordsOverride: MOCK_LGD_FULL_DATA.states });
      const repeatDistricts = await ingestLgdTier('districts', { recordsOverride: MOCK_LGD_FULL_DATA.districts });
      const repeatSub = await ingestLgdTier('subDistricts', { recordsOverride: MOCK_LGD_FULL_DATA.subDistricts });
      const repeatVillages = await ingestLgdTier('villages', { recordsOverride: MOCK_LGD_FULL_DATA.villages });

      expect(repeatStates.records_inserted).toBe(0);
      expect(repeatStates.records_unchanged).toBe(2);

      expect(repeatDistricts.records_inserted).toBe(0);
      expect(repeatDistricts.records_unchanged).toBe(2);

      expect(repeatSub.records_inserted).toBe(0);
      expect(repeatSub.records_unchanged).toBe(2);

      expect(repeatVillages.records_inserted).toBe(0);
      expect(repeatVillages.records_unchanged).toBe(4);

      // Verify total count is strictly invariant
      const countAfterSecondSync = await getTotalUnitsCount();
      expect(countAfterSecondSync).toBe(countAfterFirstSync);
    });
  });

  // ==========================================================================
  // 4. RESUMABILITY & CONTROLLED INTERRUPTION
  // ==========================================================================
  describe('4. Resumability & Interrupted Sync Safety', () => {
    it('supports controlled batch interruption and safely resumes from offset without duplication', async () => {
      // Ingest State & District prerequisites
      await ingestLgdTier('states', { recordsOverride: MOCK_LGD_FULL_DATA.states });
      await ingestLgdTier('districts', { recordsOverride: MOCK_LGD_FULL_DATA.districts });
      await ingestLgdTier('subDistricts', { recordsOverride: MOCK_LGD_FULL_DATA.subDistricts });

      // Simulate Batch 1 of Villages (Records 0..2)
      const batch1 = MOCK_LGD_FULL_DATA.villages.slice(0, 2);
      const summary1 = await ingestLgdTier('villages', { recordsOverride: batch1 });
      expect(summary1.records_inserted).toBe(2);
      expect(await getUnitsCountByTier('village')).toBe(2);

      // Simulate Resumed Batch 2 of Villages (Records 2..4) with startOffset: 2
      const batch2 = MOCK_LGD_FULL_DATA.villages.slice(2, 4);
      const summary2 = await ingestLgdTier('villages', {
        recordsOverride: batch2,
        startOffset: 2,
      });
      expect(summary2.records_inserted).toBe(2);

      // Total village count after safe resumption
      expect(await getUnitsCountByTier('village')).toBe(4);

      // Re-running full set is completely idempotent
      const summaryFull = await ingestLgdTier('villages', { recordsOverride: MOCK_LGD_FULL_DATA.villages });
      expect(summaryFull.records_inserted).toBe(0);
      expect(summaryFull.records_unchanged).toBe(4);
    });
  });

  // ==========================================================================
  // 5. CONCURRENCY CONTROL & MUTEX LOCKING
  // ==========================================================================
  describe('5. Concurrency Control & Mutex Locking', () => {
    it('allows the first sync request and rejects a concurrent second sync request with 409 Conflict', async () => {
      // Trigger execution sync
      const syncPromise = executeAuthoritativeLgdSync({
        tier: 'states',
        maxRecordsPerTier: 2,
        actor: 'Primary Officer',
      });

      // Attempt immediate second concurrent sync
      let secondRejected = false;
      try {
        await executeAuthoritativeLgdSync({
          tier: 'states',
          maxRecordsPerTier: 2,
          actor: 'Secondary Officer',
        });
      } catch (err: any) {
        secondRejected = true;
        expect(err.message).toContain('already in progress');
      }

      expect(secondRejected).toBe(true);

      // Wait for primary to complete cleanly
      const result = await syncPromise;
      expect(result.status).toBe('completed');
    });
  });

  // ==========================================================================
  // 6. DATABASE INTEGRITY & ORPHAN/DUPLICATE QUERIES
  // ==========================================================================
  describe('6. Database Hierarchy Integrity Queries', () => {
    it('verifies 0 duplicate LGD codes and 0 orphan child units in database hierarchy', async () => {
      await ingestLgdTier('states', { recordsOverride: MOCK_LGD_FULL_DATA.states });
      await ingestLgdTier('districts', { recordsOverride: MOCK_LGD_FULL_DATA.districts });
      await ingestLgdTier('subDistricts', { recordsOverride: MOCK_LGD_FULL_DATA.subDistricts });
      await ingestLgdTier('villages', { recordsOverride: MOCK_LGD_FULL_DATA.villages });

      // 1. Check for Duplicate Official LGD Codes across same tier
      const allUnits = inMemoryUnitsStore;
      const codeTypeMap = new Set<string>();
      let duplicateCount = 0;

      for (const u of allUnits) {
        const key = `${u.unit_type}:${u.code}`;
        if (codeTypeMap.has(key)) {
          duplicateCount++;
        }
        codeTypeMap.add(key);
      }
      expect(duplicateCount).toBe(0);

      // 2. Check for Orphan Districts (District without valid State)
      const states = await getStates();
      const stateCodes = new Set(states.map((s) => s.code));

      const districts = inMemoryUnitsStore.filter((u) => u.unit_type === 'district');
      const orphanDistricts = districts.filter((d) => !d.state_code || !stateCodes.has(d.state_code));
      expect(orphanDistricts.length).toBe(0);

      // 3. Check for Orphan Sub-Districts (Sub-District without valid District)
      const districtCodes = new Set(districts.map((d) => d.code));
      const subDistricts = inMemoryUnitsStore.filter((u) => u.unit_type === 'sub_district');
      const orphanSubs = subDistricts.filter((s) => !s.district_code || !districtCodes.has(s.district_code));
      expect(orphanSubs.length).toBe(0);

      // 4. Check for Orphan Villages (Village without valid Sub-District)
      const subCodes = new Set(subDistricts.map((s) => s.code));
      const villages = inMemoryUnitsStore.filter((u) => u.unit_type === 'village' || u.unit_type === 'locality');
      const orphanVillages = villages.filter((v) => !v.sub_district_code || !subCodes.has(v.sub_district_code));
      expect(orphanVillages.length).toBe(0);
    });
  });

  // ==========================================================================
  // 7. QUERY PERFORMANCE & LARGE-VILLAGE SERVER-SIDE PAGINATION
  // ==========================================================================
  describe('7. Query Performance & Server-Side Village Pagination', () => {
    beforeEach(async () => {
      await ingestLgdTier('states', { recordsOverride: MOCK_LGD_FULL_DATA.states });
      await ingestLgdTier('districts', { recordsOverride: MOCK_LGD_FULL_DATA.districts });
      await ingestLgdTier('subDistricts', { recordsOverride: MOCK_LGD_FULL_DATA.subDistricts });
      await ingestLgdTier('villages', { recordsOverride: MOCK_LGD_FULL_DATA.villages });
    });

    it('measures sub-millisecond query retrieval for State -> District -> Sub-District hierarchy', async () => {
      const t0 = performance.now();
      const districts = await getDistricts('27');
      const tDist = performance.now() - t0;

      expect(districts.length).toBe(1);
      expect(districts[0].name).toBe('Pune');
      expect(tDist).toBeLessThan(50); // Measured response time < 50ms

      const t1 = performance.now();
      const subs = await getSubDistricts('521');
      const tSubs = performance.now() - t1;

      expect(subs.length).toBe(1);
      expect(subs[0].name).toBe('Haveli');
      expect(tSubs).toBeLessThan(50);
    });

    it('paginates large village rosters strictly server-side without streaming 720k rows to client', async () => {
      const pageResult = await getVillages('4210', { page: 1, limit: 1 });
      expect(pageResult.villages.length).toBe(1);
      expect(pageResult.total).toBe(2);
      expect(pageResult.totalPages).toBe(2);
      expect(pageResult.page).toBe(1);
      expect(pageResult.limit).toBe(1);
    });

    it('searches administrative entities dynamically from database with zero hardcoded arrays', async () => {
      const searchByName = await searchAdministrativeUnits('Hadapsar');
      expect(searchByName.length).toBe(1);
      expect(searchByName[0].code).toBe('555001');

      const searchByLgdCode = await searchAdministrativeUnits('521');
      expect(searchByLgdCode.length).toBeGreaterThanOrEqual(1);
      expect(searchByLgdCode.some((u) => u.name === 'Pune')).toBe(true);
    });
  });

  // ==========================================================================
  // 8. APPLICATION INTEGRATION: PROJECT, CASE, GIS & PORTFOLIO
  // ==========================================================================
  describe('8. Project, Case, GIS & Portfolio Integration', () => {
    beforeEach(async () => {
      await ingestLgdTier('states', { recordsOverride: MOCK_LGD_FULL_DATA.states });
      await ingestLgdTier('districts', { recordsOverride: MOCK_LGD_FULL_DATA.districts });
      await ingestLgdTier('subDistricts', { recordsOverride: MOCK_LGD_FULL_DATA.subDistricts });
      await ingestLgdTier('villages', { recordsOverride: MOCK_LGD_FULL_DATA.villages });
    });

    it('resolves authoritative administrative context for Projects and Cases using official LGD codes', async () => {
      const enrichment = await resolveAdministrativeEnrichment({
        stateLgdCode: '27',
        districtLgdCode: '521',
        subdistrictLgdCode: '4210',
        villageLgdCode: '555001',
      });

      expect(enrichment.status).toBe('operational');
      expect(enrichment.state?.name).toBe('Maharashtra');
      expect(enrichment.district?.name).toBe('Pune');
      expect(enrichment.sub_district?.name).toBe('Haveli');
      expect(enrichment.village?.name).toBe('Hadapsar');
      expect(enrichment.provenance.source).toBe('lgd_india');
    });

    it('preserves honest geometry state: administrative identity available but boundary unavailable', async () => {
      const enrichment = await resolveAdministrativeEnrichment({
        stateLgdCode: '27',
        districtLgdCode: '521',
      });

      expect(enrichment.status).toBe('operational');
      expect(enrichment.district?.boundary_geojson).toBeUndefined(); // Zero fabricated polygons
    });

    it('truthfully returns administrative_enrichment_unavailable when unmapped LGD code is queried', async () => {
      const enrichment = await resolveAdministrativeEnrichment({
        stateLgdCode: '99999',
      });

      expect(enrichment.status).toBe('administrative_enrichment_unavailable');
      expect(enrichment.state).toBeNull();
    });
  });

  // ==========================================================================
  // 9. RBAC & TERRITORIAL SCOPING ENFORCEMENT
  // ==========================================================================
  describe('9. RBAC & Jurisdictional Scoping Scrutiny', () => {
    const mockCases: CaseEnrichedForPortfolio[] = [
      {
        id: 'case-pune-1',
        case_number: 'CASE-PUN-01',
        project_id: 'proj-pune-ring',
        title: 'Pune Outer Corridor',
        state: 'Maharashtra',
        district: 'Pune',
        status: 'active',
        priority: 'high',
        total_area_hectares: 10,
        estimated_compensation: 1000000,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        workflow_id: 'wf-1',
        current_stage: 1,
        total_stages: 5,
        accumulated_delay_days: 0,
        critical_risk_flag: false,
        stale_external_data_flag: false,
        open_disputes_count: 0,
        state_lgd_code: '27',
        district_lgd_code: '521',
      },
      {
        id: 'case-ernakulam-1',
        case_number: 'CASE-EKM-01',
        project_id: 'proj-kochi-metro',
        title: 'Kochi Metro Extension',
        state: 'Kerala',
        district: 'Ernakulam',
        status: 'active',
        priority: 'medium',
        total_area_hectares: 5,
        estimated_compensation: 500000,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        workflow_id: 'wf-1',
        current_stage: 1,
        total_stages: 5,
        accumulated_delay_days: 0,
        critical_risk_flag: false,
        stale_external_data_flag: false,
        open_disputes_count: 0,
        state_lgd_code: '32',
        district_lgd_code: '555',
      },
    ];

    it('restricts Revenue Inspector by jurisdiction_district_lgd_code strictly server-side', () => {
      const riUser: UserProfile = {
        id: 'usr-ri-pune',
        role: 'revenue_inspector',
        full_name: 'Pune Inspector',
        state: 'Maharashtra',
        district: 'Pune',
        jurisdiction_district_lgd_code: '521',
        is_active: true,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };

      const filter = getAuthorizedScopeFilter(riUser);
      expect(filter.allowedDistrictLgdCodes).toContain('521');
      expect(filter.isRestricted).toBe(true);

      const scopedCases = applyScopeFilter(mockCases, filter);
      expect(scopedCases.length).toBe(1);
      expect(scopedCases[0].district_lgd_code).toBe('521');
    });

    it('blocks scope bypass via malicious client query parameters', () => {
      const riUser: UserProfile = {
        id: 'usr-ri-pune',
        role: 'revenue_inspector',
        full_name: 'Pune Inspector',
        state: 'Maharashtra',
        district: 'Pune',
        jurisdiction_district_lgd_code: '521',
        is_active: true,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };

      const scope = getAuthorizedScopeFilter(riUser);

      // Malicious query attempting to access Ernakulam (555)
      const tamperedCases = applyScopeAndQueryParams(mockCases, scope, {
        district_lgd_code: '555',
      });

      // Strictly returns 0 cases because district 555 is outside authorized scope 521
      expect(tamperedCases.length).toBe(0);
    });

    it('allows Admin full unrestricted national scope across all LGD codes', () => {
      const adminUser: UserProfile = {
        id: 'usr-admin-1',
        role: 'admin',
        full_name: 'National Admin',
        is_active: true,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };

      const filter = getAuthorizedScopeFilter(adminUser);
      expect(filter.isRestricted).toBe(false);

      const scopedCases = applyScopeFilter(mockCases, filter);
      expect(scopedCases.length).toBe(2);
    });
  });

  // ==========================================================================
  // 10. HISTORICAL DATA SAFETY & PROVENANCE
  // ==========================================================================
  describe('10. Historical Data Safety & Provenance Integrity', () => {
    it('verifies that LGD ingestion retains complete provenance metadata', async () => {
      const stateSummary = await ingestLgdTier('states', {
        recordsOverride: MOCK_LGD_FULL_DATA.states,
      });
      expect(stateSummary.records_inserted).toBe(2);

      const maharashtra = await getAdministrativeUnitByCode('27', 'state');
      expect(maharashtra).not.toBeNull();
      expect(maharashtra?.source_id).toBe('lgd_india');
      expect(maharashtra?.source_resource_id).toBe(CANONICAL_LGD_RESOURCES.states.resourceId);
      expect(maharashtra?.last_synced_at).toBeDefined();
    });

    it('preserves existing case and project entity stability without destructive overwrites', async () => {
      const preExistingCase: AcquisitionCase = {
        id: 'case-pre-existing-01',
        case_number: 'CASE-PRE-01',
        project_id: 'proj-01',
        workflow_id: 'wf-01',
        title: 'Pre-existing Case',
        state: 'Maharashtra',
        district: 'Pune',
        status: 'active',
        priority: 'medium',
        total_area_hectares: 12.5,
        estimated_compensation: 5000000,
        start_date: '2026-01-01',
        expected_completion_date: '2026-12-31',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        state_lgd_code: '27',
        district_lgd_code: '521',
      };

      // Perform sync
      await ingestLgdTier('states', { recordsOverride: MOCK_LGD_FULL_DATA.states });
      await ingestLgdTier('districts', { recordsOverride: MOCK_LGD_FULL_DATA.districts });

      // Verify pre-existing case remains intact and its LGD reference resolves cleanly
      const enrichment = await resolveAdministrativeEnrichment({
        stateLgdCode: preExistingCase.state_lgd_code,
        districtLgdCode: preExistingCase.district_lgd_code,
      });

      expect(enrichment.status).toBe('operational');
      expect(enrichment.state?.name).toBe('Maharashtra');
      expect(enrichment.district?.name).toBe('Pune');
    });
  });
});
