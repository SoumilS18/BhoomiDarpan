import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  getLgdServerConfig,
  executeLgdQuery,
  CANONICAL_LGD_RESOURCES,
  LgdAdministrativeTier,
} from '../server/config/lgdConfig';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};

// Mock payloads reflecting the EXACT statutory schemas discovered from data.gov.in
const MOCK_SCHEMAS = {
  states: {
    status: 'ok',
    version: '1.0',
    total: 36,
    count: 2,
    limit: 2,
    offset: 0,
    records: [
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
  },
  districts: {
    status: 'ok',
    version: '1.0',
    total: 785,
    count: 2,
    limit: 2,
    offset: 0,
    records: [
      {
        state_code: 32,
        state_name_english: 'Kerala',
        state_name_local: 'KERALA',
        state_census2011_code: '32',
        district_code: 554,
        district_name_english: 'Alappuzha',
        district_name_local: 'ആലപ്പുഴ',
        district_census2011_code: '598',
      },
      {
        state_code: 32,
        state_name_english: 'Kerala',
        state_name_local: 'KERALA',
        state_census2011_code: '32',
        district_code: 555,
        district_name_english: 'Ernakulam',
        district_name_local: 'എറണാകുളം',
        district_census2011_code: '595',
      },
    ],
  },
  subDistricts: {
    status: 'ok',
    version: '1.0',
    total: 7151,
    count: 2,
    limit: 2,
    offset: 0,
    records: [
      {
        state_code: 8,
        state_name_english: 'Rajasthan',
        state_name_local: 'RAJASTHAN',
        state_census2011_code: '08',
        district_code: 783,
        district_name_english: 'Jaipur (Gramin)',
        district_name_local: 'जयपुर (ग्रामीण)',
        district_census2011_code: 'NA',
        subdistrict_code: 7140,
        subdistrict_name_english: 'Aandhi',
        subdistrict_name_local: 'आंधी',
        subdistrict_census2011_code: '00000',
        last_updated: '2024-10-07',
      },
    ],
  },
  villages: {
    status: 'ok',
    version: '1.0',
    total: 720758,
    count: 2,
    limit: 2,
    offset: 0,
    records: [
      {
        villageCode: 405275,
        villageNameEnglish: 'Bhurukundi',
        villageNameLocal: '',
        villageCensus2011Code: '405275',
        subdistrictCode: 3011,
        subdistrictNameEnglish: 'Angul',
        subdistrictNameLocal: 'ଅନୁଗୋଳ',
        subdistrictCensus2011Code: '03011',
        districtCode: 344,
        districtNameEnglish: 'Angul',
        districtNameLocal: 'ଅନୁଗୋଳ',
        districtCensus2011Code: '384',
        stateCode: 21,
        stateNameEnglish: 'Odisha',
        stateNameLocal: 'ଓଡ଼ିଶା',
        stateCensus2011Code: '21',
        data_gov_update_date: '20-01-2026',
      },
    ],
  },
};

describe('Deterministic LGD Configuration & Integration Boundary Suite', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // 1. Environment Variable Safety & Secret Isolation (Offline)
  describe('1. Secret Isolation & Environment Security (Offline Deterministic)', () => {
    it('ensures LGD API key is strictly server-side and never prefixed with VITE_', () => {
      const viteExposed = Object.keys(envConfig).some(
        (key) => key.startsWith('VITE_') && key.toUpperCase().includes('LGD')
      );
      expect(viteExposed).toBe(false);
    });

    it('confirms the secret is not exposed in public git tracked files', () => {
      expect(fs.existsSync(envPath)).toBe(true);
      const gitignore = fs.readFileSync(path.resolve(process.cwd(), '.gitignore'), 'utf8');
      expect(gitignore).toContain('.env');
    });

    it('validates server configuration correctly parses server-side environment', () => {
      const config = getLgdServerConfig();
      expect(config.baseUrl).toBe('https://api.data.gov.in/resource');
      expect(config.resources.states).toBe('a71e60f0-a21d-43de-a6c5-fa5d21600cdb');
      expect(config.resources.districts).toBe('37231365-78ba-44d5-ac22-3deec40b9197');
      expect(config.resources.subDistricts).toBe('6be51a29-876a-403a-a6da-42fde795e751');
      expect(config.resources.villages).toBe('c967fe8f-69c4-42df-8afc-8a2c98057437');
    });
  });

  // 2. Canonical Resource Identifiers & Schema Definitions
  describe('2. Canonical Resource Identifiers & Schema Definitions', () => {
    it('defines canonical metadata for all four administrative tiers', () => {
      const tiers: LgdAdministrativeTier[] = ['states', 'districts', 'subDistricts', 'villages'];
      for (const tier of tiers) {
        const meta = CANONICAL_LGD_RESOURCES[tier];
        expect(meta).toBeDefined();
        expect(meta.tier).toBe(tier);
        expect(meta.resourceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(meta.totalRecordsEstimate).toBeGreaterThan(0);
      }
    });

    it('correctly models naming convention difference (snake_case for higher tiers, camelCase for villages)', () => {
      expect(CANONICAL_LGD_RESOURCES.states.fieldCase).toBe('snake_case');
      expect(CANONICAL_LGD_RESOURCES.districts.fieldCase).toBe('snake_case');
      expect(CANONICAL_LGD_RESOURCES.subDistricts.fieldCase).toBe('snake_case');
      expect(CANONICAL_LGD_RESOURCES.villages.fieldCase).toBe('camelCase');
    });

    it('maps hierarchical parent-child relationships across tiers', () => {
      expect(CANONICAL_LGD_RESOURCES.districts.parentCodeField).toBe('state_code');
      expect(CANONICAL_LGD_RESOURCES.subDistricts.parentCodeField).toBe('district_code');
      expect(CANONICAL_LGD_RESOURCES.villages.parentCodeField).toBe('subdistrictCode');
    });
  });

  // 3. Hardened HTTP Boundary & Safe Query Construction
  describe('3. Hardened HTTP Boundary & Safe Query Construction', () => {
    it('safely constructs URL with query parameters without leaking API key in diagnostics', async () => {
      let capturedUrl = '';
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        capturedUrl = url;
        return Promise.resolve(new Response(JSON.stringify(MOCK_SCHEMAS.states), { status: 200 }));
      });

      const response = await executeLgdQuery('states', {
        offset: 10,
        limit: 25,
        filters: { state_code: '32' },
        apiKeyOverride: 'test_in_memory_key_12345',
      });

      expect(response.status).toBe('ok');
      expect(response.diagnostics.tier).toBe('states');
      expect(response.diagnostics.resourceId).toBe(CANONICAL_LGD_RESOURCES.states.resourceId);
      expect(response.limit).toBe(25);
      expect(response.offset).toBe(10);

      // Verify the query parameters constructed
      const parsed = new URL(capturedUrl);
      expect(parsed.pathname).toBe(`/resource/${CANONICAL_LGD_RESOURCES.states.resourceId}`);
      expect(parsed.searchParams.get('format')).toBe('json');
      expect(parsed.searchParams.get('offset')).toBe('10');
      expect(parsed.searchParams.get('limit')).toBe('25');
      expect(parsed.searchParams.get('filters[state_code]')).toBe('32');
      expect(parsed.searchParams.get('api-key')).toBe('test_in_memory_key_12345');
    });

    it('enforces maximum pagination bounds (clamps limit to 1000)', async () => {
      let capturedUrl = '';
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        capturedUrl = url;
        return Promise.resolve(new Response(JSON.stringify(MOCK_SCHEMAS.districts), { status: 200 }));
      });

      await executeLgdQuery('districts', {
        limit: 5000,
        apiKeyOverride: 'test_key',
      });

      const parsed = new URL(capturedUrl);
      expect(parsed.searchParams.get('limit')).toBe('1000');
    });

    it('enforces minimum pagination bounds (clamps offset >= 0 and limit >= 1)', async () => {
      let capturedUrl = '';
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        capturedUrl = url;
        return Promise.resolve(new Response(JSON.stringify(MOCK_SCHEMAS.districts), { status: 200 }));
      });

      await executeLgdQuery('districts', {
        offset: -5,
        limit: -10,
        apiKeyOverride: 'test_key',
      });

      const parsed = new URL(capturedUrl);
      expect(parsed.searchParams.get('offset')).toBe('0');
      expect(parsed.searchParams.get('limit')).toBe('1');
    });

    it('throws sanitized error on missing API key without exposing sensitive internals', async () => {
      const originalKey = process.env.LGD_DATA_GOV_API_KEY;
      try {
        delete process.env.LGD_DATA_GOV_API_KEY;
        await expect(executeLgdQuery('states')).rejects.toThrow(
          'LGD_DATA_GOV_API_KEY is not configured on the server'
        );
      } finally {
        if (originalKey) process.env.LGD_DATA_GOV_API_KEY = originalKey;
      }
    });
  });

  // 4. Deterministic Schema & Payload Validation (Mocked Gateway)
  describe('4. Deterministic Schema & Payload Validation', () => {
    it('validates States schema payload fields', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(MOCK_SCHEMAS.states), { status: 200 })
      );

      const res = await executeLgdQuery('states', { apiKeyOverride: 'mock_key' });
      expect(res.records.length).toBe(2);
      const record = res.records[0];
      expect(record).toHaveProperty('state_code');
      expect(record).toHaveProperty('state_name_english');
      expect(record).toHaveProperty('state_name_local');
      expect(record).toHaveProperty('state_census2011_code');
      expect(record).toHaveProperty('state_or_ut');
      expect(record).toHaveProperty('last_updated');
    });

    it('validates Districts schema payload fields', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(MOCK_SCHEMAS.districts), { status: 200 })
      );

      const res = await executeLgdQuery('districts', { apiKeyOverride: 'mock_key' });
      expect(res.records.length).toBe(2);
      const record = res.records[0];
      expect(record).toHaveProperty('state_code');
      expect(record).toHaveProperty('district_code');
      expect(record).toHaveProperty('district_name_english');
      expect(record).toHaveProperty('district_name_local');
      expect(record).toHaveProperty('district_census2011_code');
    });

    it('validates Villages schema payload fields (camelCase)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(MOCK_SCHEMAS.villages), { status: 200 })
      );

      const res = await executeLgdQuery('villages', { apiKeyOverride: 'mock_key' });
      expect(res.records.length).toBe(1);
      const record = res.records[0];
      expect(record).toHaveProperty('villageCode');
      expect(record).toHaveProperty('villageNameEnglish');
      expect(record).toHaveProperty('subdistrictCode');
      expect(record).toHaveProperty('districtCode');
      expect(record).toHaveProperty('stateCode');
      expect(record).toHaveProperty('data_gov_update_date');
    });
  });

  // 5. Deterministic Error Handling & 403 Rejection
  describe('5. Deterministic Gateway Error Handling (Mocked)', () => {
    it('properly intercepts and sanitizes HTTP 403 Forbidden without leaking credentials', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Key not authorised' }), {
          status: 403,
          statusText: 'Forbidden',
        })
      );

      await expect(
        executeLgdQuery('states', { apiKeyOverride: 'bad_key' })
      ).rejects.toThrow('LGD API Error [HTTP 403] [tier: states]: Key not authorised');
    });

    it('properly sanitizes gateway network disconnect without leaking internal stack', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.data.gov.in'));

      await expect(
        executeLgdQuery('states', { apiKeyOverride: 'mock_key' })
      ).rejects.toThrow('LGD Gateway Connection Failed');
    });
  });
});
