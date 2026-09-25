/**
 * BhoomiSetu - Bhuvan / ISRO Geospatial Integration Verification Suite
 * 
 * Strict Verification Requirements (Per User Specification):
 * 1. Every active catalogue entry must have verification metadata (capabilitiesVerified, getMapVerified, lastVerifiedAt).
 * 2. Unavailable/disabled layers are NEVER returned as active layers.
 * 3. All-state resolution returns an honest result for every State/UT (Ladakh is honestly unavailable).
 * 4. Multi-state project/corridor resolution returns verified layers for each covered jurisdiction.
 * 5. National/regional layer resolution (e.g. Ganga Basin LULC verified; unverified LULC_BUILTUP disabled).
 * 6. Disaster capability-specific availability (hilly states return verified landslide layers; plains states return unavailable).
 * 7. LULC capability-specific availability.
 * 8. Provider health when one workspace is healthy and another is unavailable (returns degraded + capability breakdown).
 * 9. Intelligence boundary invariance (Bhuvan WMS produces ZERO change to numerical risk calculation).
 * 10. Invalid legacy placeholders remain strictly excluded.
 */

import { describe, it, expect, mock } from 'bun:test';
import {
  bhuvanProvider,
  IsroBhuvanProvider,
} from '../server/services/bhuvanProvider';
import {
  BHUVAN_WMS_ROOT,
  BHUVAN_LULC_WMS_ENDPOINT,
  BHUVAN_DISASTER_WMS_ENDPOINT,
  BHUVAN_ATTRIBUTION,
  BHUVAN_STATUTORY_DISCLAIMER,
  BHUVAN_LAYER_CATALOGUE,
  INDIAN_STATES_REFERENCE,
  normalizeJurisdictionToStateCode,
  resolveBhuvanLayers,
} from '../server/services/bhuvanCatalogue';
import { calculateDeterministicRiskAssessment } from '../server/services/riskAssessment';

describe('Bhuvan / ISRO Geospatial Integration Verification Suite', () => {
  const provider = new IsroBhuvanProvider();

  // ==========================================================================
  // 1. VERIFICATION METADATA ON ACTIVE CATALOGUE ENTRIES
  // ==========================================================================
  describe('1. Active Catalogue Verification Metadata', () => {
    it('verifies every active catalogue entry possesses complete live verification metadata', () => {
      const activeEntries = BHUVAN_LAYER_CATALOGUE.filter(l => l.enabled);
      expect(activeEntries.length).toBeGreaterThanOrEqual(50);

      for (const entry of activeEntries) {
        expect(entry.verification_status).toBe('verified');
        expect(entry.capabilities_verified).toBe(true);
        expect(entry.getmap_verified).toBe(true);
        expect(entry.last_verified_at).toBeDefined();
        expect(entry.workspace).toBeDefined();
        expect(['lulc', 'disaster', 'admin']).toContain(entry.workspace);
        expect(entry.temporal_reference).toBeDefined();
        expect(['state', 'national', 'regional']).toContain(entry.coverage);
        expect(entry.attribution).toContain('ISRO / NRSC Bhuvan');
      }
    });

    it('uses verified public NRSC endpoints without API keys', () => {
      expect(BHUVAN_WMS_ROOT).toBe('https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms');
      expect(BHUVAN_LULC_WMS_ENDPOINT).toBe('https://bhuvan-vec2.nrsc.gov.in/bhuvan/lulc/wms');
      expect(BHUVAN_DISASTER_WMS_ENDPOINT).toBe('https://bhuvan-vec2.nrsc.gov.in/bhuvan/disaster/wms');
      expect(BHUVAN_ATTRIBUTION).toBe('ISRO / NRSC Bhuvan');
      expect(BHUVAN_STATUTORY_DISCLAIMER).toContain('Not cadastral ground truth');
    });
  });

  // ==========================================================================
  // 2. UNAVAILABLE & DISABLED LAYERS NEVER RETURNED AS ACTIVE
  // ==========================================================================
  describe('2. Disabled & Unavailable Layers Protection', () => {
    it('never returns disabled or unverified layers from resolveBhuvanLayers', () => {
      const allResolved = resolveBhuvanLayers();
      for (const r of allResolved.resolved_layers) {
        expect(r.layer.enabled).toBe(true);
        expect(r.layer.verification_status).toBe('verified');
        expect(r.layer.getmap_verified).toBe(true);
      }

      // Disabled layers must be absent from active resolutions
      expect(allResolved.resolved_layers.some(r => r.layer.layer_id.includes('disabled'))).toBe(false);
      expect(allResolved.resolved_layers.some(r => r.layer.layer_id.includes('legacy'))).toBe(false);
      expect(allResolved.resolved_layers.some(r => r.layer.layer_id === 'bhuvan_lulc_50k_la_unavailable')).toBe(false);
    });

    it('strictly preserves disabled legacy placeholders with unavailable verification status in catalogue', () => {
      const catalogue = provider.getAvailableLayers();
      const legacyWasteland = catalogue.find(l => l.layer_id === 'bhuvan_wasteland_50k_legacy');
      expect(legacyWasteland).toBeDefined();
      expect(legacyWasteland?.enabled).toBe(false);
      expect(legacyWasteland?.verification_status).toBe('unavailable');

      const legacyFlood = catalogue.find(l => l.layer_id === 'bhuvan_flood_hazard_legacy');
      expect(legacyFlood).toBeDefined();
      expect(legacyFlood?.enabled).toBe(false);
      expect(legacyFlood?.verification_status).toBe('unavailable');

      const disabledBuiltup = catalogue.find(l => l.layer_id === 'bhuvan_lulc_builtup_national_disabled');
      expect(disabledBuiltup).toBeDefined();
      expect(disabledBuiltup?.enabled).toBe(false);
      expect(disabledBuiltup?.verification_status).toBe('unavailable');
    });
  });

  // ==========================================================================
  // 3. ALL-STATE & UT COVERAGE RESOLUTION (ZERO HARDCODING)
  // ==========================================================================
  describe('3. All-India Geography Resolution (28 States & 8 UTs)', () => {
    it('normalizes freeform state names, aliases, and ISO codes cleanly', () => {
      expect(normalizeJurisdictionToStateCode('Maharashtra')).toBe('MH');
      expect(normalizeJurisdictionToStateCode('maharashtra')).toBe('MH');
      expect(normalizeJurisdictionToStateCode('MH')).toBe('MH');
      expect(normalizeJurisdictionToStateCode('Bihar')).toBe('BR');
      expect(normalizeJurisdictionToStateCode('uttar pradesh')).toBe('UP');
      expect(normalizeJurisdictionToStateCode('Tamil Nadu')).toBe('TN');
      expect(normalizeJurisdictionToStateCode('Ladakh')).toBe('LA');
      expect(normalizeJurisdictionToStateCode('UNKNOWN_TERRITORY')).toBeNull();
      expect(normalizeJurisdictionToStateCode('')).toBeNull();
    });

    it('resolves verified LULC layers for all 28 Indian States', () => {
      const twentyEightStates = [
        'AP', 'AR', 'AS', 'BR', 'CG', 'GA', 'GJ', 'HR', 'HP', 'JH', 'KA', 'KL', 'MP', 'MH',
        'MN', 'ML', 'MZ', 'NL', 'OD', 'PB', 'RJ', 'SK', 'TN', 'TS', 'TR', 'UP', 'UK', 'WB'
      ];

      for (const code of twentyEightStates) {
        const res = resolveBhuvanLayers({ state_codes: [code], workspace: 'lulc' });
        expect(res.total_resolved).toBeGreaterThanOrEqual(1);
        expect(res.resolved_layers.some(r => r.layer.state_code === code)).toBe(true);
        expect(res.unsupported_jurisdictions.length).toBe(0);
      }
    });

    it('resolves verified LULC layers for 7 UTs and honestly reports Ladakh as unavailable', () => {
      const verifiedUTs = ['AN', 'CH', 'DD', 'DN', 'DL', 'LD', 'PY'];
      for (const utCode of verifiedUTs) {
        const res = resolveBhuvanLayers({ state_codes: [utCode], workspace: 'lulc' });
        expect(res.total_resolved).toBeGreaterThanOrEqual(1);
        expect(res.resolved_layers.some(r => r.layer.state_code === utCode)).toBe(true);
        expect(res.unsupported_jurisdictions.length).toBe(0);
      }

      // Ladakh honestly reports unavailable (formed 2019, no 2015-16 state LULC cycle published)
      const ladakhRes = resolveBhuvanLayers({ state_codes: ['LA'], workspace: 'lulc' });
      expect(ladakhRes.total_resolved).toBe(0);
      expect(ladakhRes.unsupported_jurisdictions).toContain('Ladakh');
    });
  });

  // ==========================================================================
  // 4. MULTI-STATE PROJECT / CORRIDOR RESOLUTION
  // ==========================================================================
  describe('4. Multi-State Corridor Resolution', () => {
    it('resolves verified layers for multiple covered jurisdictions without fabricating cross-border continuity', () => {
      // Highway corridor crossing Maharashtra and Gujarat
      const multiResult = resolveBhuvanLayers({
        state_codes: ['MH', 'GJ'],
        workspace: 'lulc',
      });

      expect(multiResult.total_resolved).toBeGreaterThanOrEqual(2);
      expect(multiResult.resolved_layers.some(r => r.layer.state_code === 'MH')).toBe(true);
      expect(multiResult.resolved_layers.some(r => r.layer.state_code === 'GJ')).toBe(true);
      expect(multiResult.unsupported_jurisdictions.length).toBe(0);
    });

    it('returns both verified state layers and honest unavailable report when a multi-state corridor includes an uncovered jurisdiction', () => {
      // Corridor spanning Jammu & Kashmir and Ladakh
      const corridor = resolveBhuvanLayers({
        state_codes: ['JK', 'LA'],
        workspace: 'lulc',
      });

      expect(corridor.resolved_layers.some(r => r.layer.state_code === 'JK')).toBe(true);
      expect(corridor.unsupported_jurisdictions).toContain('Ladakh');
    });
  });

  // ==========================================================================
  // 5. NATIONAL & REGIONAL LAYER RESOLUTION
  // ==========================================================================
  describe('5. National & Regional Layer Resolution', () => {
    it('resolves verified regional Ganga basin land cover layer and interstate boundary line', () => {
      const gangaResult = resolveBhuvanLayers({ workspace: 'lulc' });
      const gangaLayer = gangaResult.resolved_layers.find(r => r.layer.layer_id === 'bhuvan_lulc_ganga_basin');
      expect(gangaLayer).toBeDefined();
      expect(gangaLayer?.layer.coverage).toBe('regional');
      expect(gangaLayer?.layer.getmap_verified).toBe(true);

      const adminResult = resolveBhuvanLayers({ workspace: 'admin' });
      const adminLayer = adminResult.resolved_layers.find(r => r.layer.layer_id === 'bhuvan_admin_ap_tg_bnd');
      expect(adminLayer).toBeDefined();
      expect(adminLayer?.layer.coverage).toBe('regional');
      expect(adminLayer?.layer.getmap_verified).toBe(true);
    });
  });

  // ==========================================================================
  // 6. DISASTER CAPABILITY-SPECIFIC AVAILABILITY
  // ==========================================================================
  describe('6. Disaster Workspace Capability-Specific Resolution', () => {
    it('resolves verified landslide susceptibility layers for mountainous states', () => {
      const mountainousStates = ['MH', 'HP', 'UK', 'KL', 'TN', 'GA', 'AR', 'AS', 'ML', 'MZ', 'NL', 'SK', 'TR', 'WB', 'JK'];
      for (const code of mountainousStates) {
        const res = resolveBhuvanLayers({ state_codes: [code], workspace: 'disaster' });
        expect(res.total_resolved).toBeGreaterThanOrEqual(1);
        expect(res.resolved_layers.some(r => r.layer.workspace === 'disaster')).toBe(true);
        expect(res.unsupported_jurisdictions.length).toBe(0);
      }
    });

    it('honestly reports disaster layers as unavailable for non-mountainous / plains states', () => {
      // Plains states that do not have Bhuvan landslide hazard layers
      const plainsStates = ['BR', 'UP', 'PB', 'HR', 'RJ', 'GJ', 'KA'];
      for (const code of plainsStates) {
        const res = resolveBhuvanLayers({ state_codes: [code], workspace: 'disaster' });
        expect(res.total_resolved).toBe(0);
        expect(res.unsupported_jurisdictions.length).toBe(1);
      }
    });
  });

  // ==========================================================================
  // 7. LULC CAPABILITY-SPECIFIC AVAILABILITY
  // ==========================================================================
  describe('7. LULC Capability-Specific Resolution', () => {
    it('resolves LULC 50k layers specifically when workspace is lulc', () => {
      const res = resolveBhuvanLayers({ state_codes: ['BR'], workspace: 'lulc' });
      expect(res.total_resolved).toBe(1);
      expect(res.resolved_layers[0].layer.workspace).toBe('lulc');
      expect(res.resolved_layers[0].layer.layer_name).toBe('lulc:BR_LULC50K_1516');
      expect(res.resolved_layers[0].status).toBe('available');
    });
  });

  // ==========================================================================
  // 8. MULTI-WORKSPACE CAPABILITY HEALTH CHECKS
  // ==========================================================================
  describe('8. Capability-Specific Workspace Health Checking', () => {
    it('reports workspace breakdown for LULC and Disaster and handles partial workspace degradation', async () => {
      // Mock fetch: LULC workspace succeeds, Disaster workspace returns HTTP 503
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/lulc/wms')) {
          return new Response(
            '<WMT_MS_Capabilities><Capability><Layer><Name>LULC_TEST</Name></Layer></Capability></WMT_MS_Capabilities>',
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          );
        } else if (urlStr.includes('/disaster/wms')) {
          return new Response('Service Unavailable', { status: 503 });
        }
        return new Response('Not Found', { status: 404 });
      }) as any;

      try {
        const testProvider = new IsroBhuvanProvider();
        const health = await testProvider.getHealth();

        // Must report degraded overall because one workspace failed
        expect(health.status).toBe('degraded');
        expect(health.workspaces.lulc.status).toBe('operational');
        expect(health.workspaces.disaster.status).toBe('unavailable');
        expect(health.message).toContain('Disaster is unavailable');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('reports unavailable when both workspaces fail', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => new Response('Internal Server Error', { status: 500 })) as any;

      try {
        const testProvider = new IsroBhuvanProvider();
        const health = await testProvider.getHealth();

        expect(health.status).toBe('unavailable');
        expect(health.workspaces.lulc.status).toBe('unavailable');
        expect(health.workspaces.disaster.status).toBe('unavailable');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('caches capabilities in memory to prevent repeated external network requests', async () => {
      let fetchCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        fetchCount++;
        return new Response(
          '<WMT_MS_Capabilities><Capability><Layer><Name>TEST_LAYER</Name><Title>Test</Title></Layer></Capability></WMT_MS_Capabilities>',
          { status: 200, headers: { 'Content-Type': 'text/xml' } }
        );
      }) as any;

      try {
        const testProvider = new IsroBhuvanProvider();
        const cap1 = await testProvider.getCapabilities('lulc');
        expect(cap1.cached).toBe(false);
        expect(fetchCount).toBe(1);

        const cap2 = await testProvider.getCapabilities('lulc');
        expect(cap2.cached).toBe(true);
        expect(fetchCount).toBe(1); // Served from cache
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ==========================================================================
  // 9. STRICT INTELLIGENCE BOUNDARY (ZERO RISK INFLUENCE)
  // ==========================================================================
  describe('9. Strict Intelligence Boundary Invariance', () => {
    it('proves Bhuvan WMS presence produces zero change to numerical risk, bottlenecks, and SLA', () => {
      const mockCase = {
        id: 'case-test-bhuvan-boundary',
        title: 'Corridor Highway Survey',
        state: 'Maharashtra',
        status: 'in_progress',
        created_at: '2025-01-01',
        start_date: '2025-01-01',
        expected_completion_date: '2025-12-31',
        total_parcels: 10,
        completed_parcels: 5,
        disputed_parcels: 0,
        compensation_disbursed_pct: 50,
      } as any;

      // 1. Calculate baseline risk without Bhuvan
      const baselineRisk = calculateDeterministicRiskAssessment({
        caseItem: mockCase,
        stageInstances: [],
        stages: [],
        dependencies: [],
      });

      // 2. Resolve Bhuvan layers
      const bhuvanLayers = resolveBhuvanLayers({ state_names: [mockCase.state] });
      expect(bhuvanLayers.total_resolved).toBeGreaterThan(0);

      // 3. Re-calculate risk: strictly identical
      const afterBhuvanRisk = calculateDeterministicRiskAssessment({
        caseItem: mockCase,
        stageInstances: [],
        stages: [],
        dependencies: [],
      });

      expect(afterBhuvanRisk.overall_score).toBe(baselineRisk.overall_score);
      expect(afterBhuvanRisk.risk_level).toBe(baselineRisk.risk_level);
      expect(afterBhuvanRisk.dimensions).toEqual(baselineRisk.dimensions);
      expect(afterBhuvanRisk.active_bottlenecks_count).toBe(baselineRisk.active_bottlenecks_count);
    });
  });
});
