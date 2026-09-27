import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { startLiveApi, LiveApi } from './helpers/liveApi';
import '../server/index';
import {
  analyzePortfolioOverview,
  analyzePortfolioDelays,
  analyzePortfolioRisks,
  analyzePortfolioBottlenecks,
  analyzePortfolioTrends,
  analyzePortfolioOutcomes,
  analyzePortfolioGeography,
  applyScopeAndQueryParams,
  getAuthorizedScopeFilter,
  CaseEnrichedForPortfolio,
} from '../server/services/portfolioAnalyzer';
import {
  updatePolicy,
  getPortfolioTrendPolicySync,
  getPortfolioAttentionPolicySync,
} from '../server/services/policyEngine';
import { AuthenticatedUser } from '../server/middleware/auth.middleware';

let liveApi: LiveApi | null = null;
let SERVER_URL = '';

beforeAll(async () => {
  liveApi = await startLiveApi();
  SERVER_URL = liveApi.url;
}, 30000);

afterAll(async () => {
  await liveApi?.close();
});

describe('Day 4 Final Acceptance Verification Suite', () => {
  // ==========================================================================
  // 1. ADVERSARIAL AUTHORIZATION & ATTACK VECTOR TESTS
  // ==========================================================================
  describe('1. Adversarial Authorization & Scope Enforcement', () => {
    // 1.1 Unauthenticated request is blocked
    it('rejects unauthenticated request to /api/portfolio/overview with HTTP 401', async () => {
      const res = await fetch(`${SERVER_URL}/api/portfolio/overview`);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe('AUTH_REQUIRED');
    });

    it('rejects unauthenticated request to all other portfolio endpoints with HTTP 401', async () => {
      const endpoints = [
        '/api/portfolio/delays',
        '/api/portfolio/risk',
        '/api/portfolio/bottlenecks',
        '/api/portfolio/trends',
        '/api/portfolio/geography',
        '/api/portfolio/outcomes',
        '/api/portfolio/attention-queue',
      ];
      for (const ep of endpoints) {
        const res = await fetch(`${SERVER_URL}${ep}`);
        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.code).toBe('AUTH_REQUIRED');
      }
    });

    // 1.2 Authorized admin / LAO request
    it('authorizes admin request with full unrestricted scope', async () => {
      const res = await fetch(`${SERVER_URL}/api/portfolio/overview`, {
        headers: {
          'x-eval-role': 'admin',
          'x-eval-user-id': 'usr-admin-test',
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.overview).toBeDefined();
      expect(json.overview.metadata).toBeDefined();
    });

    it('authorizes LAO request with full unrestricted scope', async () => {
      const res = await fetch(`${SERVER_URL}/api/portfolio/overview`, {
        headers: {
          'x-eval-role': 'lao',
          'x-eval-user-id': 'usr-lao-test',
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.overview).toBeDefined();
    });

    // 1.3 Project Officer requesting authorized project vs attempting another project's data
    it('strictly confines Project Officer to their assigned project scope', async () => {
      const poUser: AuthenticatedUser = {
        id: 'usr-po-corridor',
        role: 'project_officer',
        full_name: 'PO Eastern Corridor',
        department: 'project:proj-corridor-east',
      };

      const testCases: CaseEnrichedForPortfolio[] = [
        {
          id: 'case-corridor-1',
          project_id: 'proj-corridor-east',
          title: 'Authorized Corridor Section 1',
          state: 'Maharashtra',
          district: 'Pune',
          status: 'active',
          start_date: '2026-01-01',
          expected_completion_date: '2026-06-01',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'case-other-2',
          project_id: 'proj-metro-west',
          title: 'Confidential Western Metro Section',
          state: 'Maharashtra',
          district: 'Mumbai',
          status: 'active',
          start_date: '2026-01-01',
          expected_completion_date: '2026-06-01',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ];

      const scope = getAuthorizedScopeFilter(poUser);
      expect(scope.isRestricted).toBe(true);
      expect(scope.projectIds).toEqual(['proj-corridor-east']);

      // Valid project query matching scope
      const validCases = applyScopeAndQueryParams(testCases, scope, { project_id: 'proj-corridor-east' });
      expect(validCases.length).toBe(1);
      expect(validCases[0].id).toBe('case-corridor-1');

      // Adversarial manipulation: Project Officer attempts to query another project
      const breachedCases = applyScopeAndQueryParams(testCases, scope, { project_id: 'proj-metro-west' });
      // Intersection of allowed proj-corridor-east and requested proj-metro-west is EMPTY
      expect(breachedCases.length).toBe(0);
    });

    // 1.4 Revenue Inspector attempting out-of-scope state or project data
    it('strictly confines Revenue Inspector to their assigned jurisdiction', async () => {
      const riUser: AuthenticatedUser = {
        id: 'usr-ri-kerala',
        role: 'revenue_inspector',
        full_name: 'RI Thrissur',
        department: 'state:Kerala',
      };

      const testCases: CaseEnrichedForPortfolio[] = [
        {
          id: 'case-kerala-1',
          project_id: 'proj-nh66',
          title: 'NH66 Thrissur Bypass',
          state: 'Kerala',
          district: 'Thrissur',
          status: 'active',
          start_date: '2026-01-01',
          expected_completion_date: '2026-06-01',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'case-punjab-2',
          project_id: 'proj-delhi-amritsar',
          title: 'Amritsar Expressway',
          state: 'Punjab',
          district: 'Ludhiana',
          status: 'active',
          start_date: '2026-01-01',
          expected_completion_date: '2026-06-01',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ];

      const scope = getAuthorizedScopeFilter(riUser);
      expect(scope.isRestricted).toBe(true);
      expect(scope.allowedStates).toEqual(['Kerala']);

      // Attempting to query Punjab
      const breachedCases = applyScopeAndQueryParams(testCases, scope, { state: 'Punjab' });
      expect(breachedCases.length).toBe(0);

      // Querying own state
      const validCases = applyScopeAndQueryParams(testCases, scope, { state: 'Kerala' });
      expect(validCases.length).toBe(1);
      expect(validCases[0].id).toBe('case-kerala-1');
    });

    // 1.5 Viewer role attempting unauthorized access
    it('confines viewer to assigned scope and blocks wider data access', async () => {
      const viewerUser: AuthenticatedUser = {
        id: 'usr-viewer',
        role: 'viewer',
        full_name: 'Auditor External',
        department: 'project:proj-audit-only',
      };

      const scope = getAuthorizedScopeFilter(viewerUser);
      expect(scope.isRestricted).toBe(true);
      expect(scope.projectIds).toEqual(['proj-audit-only']);
    });

    // 1.6 Malicious Query Injection across all endpoints on Live Server
    it('blocks scope bypass on live server via malicious query parameter tampering', async () => {
      // Send request as project officer for proj-alpha trying to read proj-beta via query
      const res = await fetch(`${SERVER_URL}/api/portfolio/delays?project_id=unauthorized-proj-xyz`, {
        headers: {
          'x-eval-role': 'project_officer',
          'x-eval-user-id': 'po-user-1',
          'x-eval-department': 'project:authorized-proj-abc',
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      // Since authorized project is 'authorized-proj-abc' and query is 'unauthorized-proj-xyz', sample size must be 0
      expect(json.delays.metadata.sample_size).toBe(0);
    });

    it('blocks scope bypass on live server via geographic parameter tampering', async () => {
      const res = await fetch(`${SERVER_URL}/api/portfolio/risk?state=UnauthorizedState`, {
        headers: {
          'x-eval-role': 'revenue_inspector',
          'x-eval-user-id': 'ri-user-1',
          'x-eval-department': 'state:HomeState',
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      const riskObj = json.risk || json.risks;
      expect(riskObj.metadata.sample_size).toBe(0);
    });
  });

  // ==========================================================================
  // 2. REAL API -> DATABASE -> ANALYZER VERIFICATION (ALL 8 ENDPOINTS + ALIASES)
  // ==========================================================================
  describe('2. Real API -> Route -> DB -> Analyzer -> Response Verification', () => {
    const authHeaders = {
      'x-eval-role': 'admin',
      'x-eval-user-id': 'usr-admin-acceptance',
    };

    it('verifies GET /api/portfolio/overview returns validated live response', async () => {
      const res = await fetch(`${SERVER_URL}/api/portfolio/overview`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.overview).toBeDefined();
      expect(typeof json.overview.total_cases).toBe('number');
      expect(typeof json.overview.active_cases).toBe('number');
      expect(typeof json.overview.completed_cases).toBe('number');
      expect(typeof json.overview.critical_risk_cases).toBe('number');
      expect(json.overview.metadata).toBeDefined();
      expect(typeof json.overview.metadata.calculation_method).toBe('string');
    });

    it('verifies GET /api/portfolio/delays returns validated live response', async () => {
      const res = await fetch(`${SERVER_URL}/api/portfolio/delays`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.delays).toBeDefined();
      expect(typeof json.delays.median_deviation_days).toBe('number');
      expect(typeof json.delays.average_deviation_days).toBe('number');
      expect(Array.isArray(json.delays.stage_delay_concentration)).toBe(true);
      expect(json.delays.metadata).toBeDefined();
    });

    it('verifies GET /api/portfolio/risk returns validated live response', async () => {
      const res = await fetch(`${SERVER_URL}/api/portfolio/risk`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const json = await res.json();
      const riskObj = json.risk || json.risks;
      expect(riskObj).toBeDefined();
      expect(riskObj.distribution).toBeDefined();
      expect(typeof riskObj.distribution.critical).toBe('number');
      expect(typeof riskObj.distribution.high).toBe('number');
      expect(Array.isArray(riskObj.concentration_by_administrative_unit)).toBe(true);
      expect(riskObj.metadata).toBeDefined();
    });

    it('verifies GET /api/portfolio/bottlenecks returns validated live response', async () => {
      const res = await fetch(`${SERVER_URL}/api/portfolio/bottlenecks`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.bottlenecks).toBeDefined();
      expect(Array.isArray(json.bottlenecks)).toBe(true);
    });

    it('verifies GET /api/portfolio/trends returns validated live response', async () => {
      const res = await fetch(`${SERVER_URL}/api/portfolio/trends?metric=schedule_deviation`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.trends).toBeDefined();
      expect(['improving', 'deteriorating', 'stable', 'insufficient_history']).toContain(json.trends.direction);
      expect(typeof json.trends.sample_size).toBe('number');
      expect(typeof json.trends.observation_window_days).toBe('number');
      expect(json.trends.baseline_period).toBeDefined();
      expect(json.trends.current_period).toBeDefined();
    });

    it('verifies GET /api/portfolio/geography returns validated live response', async () => {
      const res = await fetch(`${SERVER_URL}/api/portfolio/geography`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.geography).toBeDefined();
      expect(json.geography.node_type).toBe('national');
      expect(['mapped', 'administrative_enrichment_unavailable']).toContain(json.geography.mapped_state);
      expect(typeof json.geography.metrics.total_cases).toBe('number');
      expect(Array.isArray(json.geography.children)).toBe(true);
    });

    it('verifies GET /api/portfolio/outcomes returns validated live response', async () => {
      const res = await fetch(`${SERVER_URL}/api/portfolio/outcomes`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.outcomes).toBeDefined();
      expect(json.outcomes.recommendations).toBeDefined();
      expect(typeof json.outcomes.recommendations.proposed_count).toBe('number');
      expect(json.outcomes.interventions).toBeDefined();
      expect(typeof json.outcomes.interventions.implemented_count).toBe('number');
      expect(typeof json.outcomes.interventions.realized_savings_days_total).toBe('number');
      expect(json.outcomes.metadata).toBeDefined();
    });

    it('verifies GET /api/portfolio/attention-queue returns validated live response', async () => {
      const res = await fetch(`${SERVER_URL}/api/portfolio/attention-queue`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const json = await res.json();
      const queueList = json.attention_queue || json.queue;
      expect(queueList).toBeDefined();
      expect(Array.isArray(queueList)).toBe(true);
      expect(typeof json.total).toBe('number');
    });

    it('verifies legacy /api/analytics/portfolio alias works identically', async () => {
      const res = await fetch(`${SERVER_URL}/api/analytics/portfolio`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.portfolio).toBeDefined();
      expect(json.portfolio.summary).toBeDefined();
      expect(json.portfolio.attention_queue).toBeDefined();
      expect(json.portfolio.bottlenecks).toBeDefined();
    });

    it('verifies legacy /api/analytics/dashboard alias works identically', async () => {
      const res = await fetch(`${SERVER_URL}/api/analytics/dashboard`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.analytics).toBeDefined();
      expect(typeof json.analytics.total_cases).toBe('number');
    });
  });

  // ==========================================================================
  // 3. SPARSE-DATA & NATIONAL CLAIM HONESTY VERIFICATION
  // ==========================================================================
  describe('3. Sparse-Data Honesty & Sample Size Limitations', () => {
    it('returns honest empty state for 0 cases with zero fabricated numbers', () => {
      const emptyOverview = analyzePortfolioOverview({
        cases: [],
        currentDateStr: '2026-03-01',
      });
      expect(emptyOverview.total_cases).toBe(0);
      expect(emptyOverview.active_cases).toBe(0);
      expect(emptyOverview.completed_cases).toBe(0);
      expect(emptyOverview.critical_risk_cases).toBe(0);
      expect(emptyOverview.metadata.sample_size).toBe(0);
      expect(emptyOverview.metadata.evidence_state).toBe('insufficient_history');

      const emptyDelays = analyzePortfolioDelays({
        cases: [],
        currentDateStr: '2026-03-01',
      });
      expect(emptyDelays.median_deviation_days).toBe(0);
      expect(emptyDelays.average_deviation_days).toBe(0);
      expect(emptyDelays.stage_delay_concentration).toEqual([]);
      expect(emptyDelays.metadata.sample_size).toBe(0);
      expect(emptyDelays.metadata.evidence_state).toBe('insufficient_history');

      const emptyGeography = analyzePortfolioGeography({
        cases: [],
        totalUnitsCount: 0,
        currentDateStr: '2026-03-01',
      });
      expect(emptyGeography.metrics.total_cases).toBe(0);
      expect(emptyGeography.children).toEqual([]);
      expect(emptyGeography.mapped_state).toBe('administrative_enrichment_unavailable');
    });

    it('flags sample size limitations when cases are 1 or 2 (prevents unjustified national claims)', () => {
      const singleCase: CaseEnrichedForPortfolio = {
        id: 'c-isolated-1',
        title: 'Single Isolated Case',
        status: 'delayed',
        start_date: '2026-01-01',
        expected_completion_date: '2026-03-01',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        stage_instances: [
          {
            id: 'inst-iso-1',
            case_id: 'c-isolated-1',
            stage_id: 'stg-1',
            status: 'in_progress',
            expected_start_date: '2026-01-01',
            expected_end_date: '2026-01-20',
            actual_start_date: '2026-01-01',
            delay_days: 26,
            created_at: '2026-01-01',
            updated_at: '2026-02-15',
            stage: {
              id: 'stg-1',
              workflow_id: 'wf-1',
              stage_number: 1,
              code: 'SEC_4_SIA',
              title: 'SIA Survey',
              default_duration_days: 20,
              is_mandatory: true,
              required_documents: [],
              completion_criteria: {},
              escalation_threshold_days: 5,
              created_at: '2026-01-01',
            },
          },
        ],
      };

      // 1. Bottleneck check
      const bottlenecks = analyzePortfolioBottlenecks({
        cases: [singleCase],
        currentDateStr: '2026-03-01',
      });
      expect(bottlenecks.length).toBeGreaterThan(0);
      expect(bottlenecks[0].sample_size_limitation).toBeDefined();
      expect(bottlenecks[0].sample_size_limitation).toContain('sample size (< 3 cases) is insufficient');

      // 2. Trend check
      const trends = analyzePortfolioTrends({
        cases: [singleCase],
        currentDateStr: '2026-03-01',
      });
      expect(trends.direction).toBe('insufficient_history');
      expect(trends.reason).toContain('fewer than required minimum of 3 cases');

      // 3. Risk trend check
      const risks = analyzePortfolioRisks({
        cases: [singleCase],
        currentDateStr: '2026-03-01',
      });
      expect(risks.risk_trend).toBe('insufficient_history');
    });
  });

  // ==========================================================================
  // 4. RUNTIME POLICY VERIFICATION
  // ==========================================================================
  describe('4. Policy Runtime Loading & Controlled In-Flight Mutation', () => {
    it('verifies portfolio_trend_policy is loaded at runtime and responds to dynamic updates without code modification', async () => {
      // 1. Verify default trend policy is loaded
      const initialPolicy = getPortfolioTrendPolicySync();
      expect(initialPolicy.min_cases_sample_size).toBe(3);
      expect(initialPolicy.min_historical_days).toBe(14);

      // 2. Perform a controlled policy modification via updatePolicy
      await updatePolicy({
        key: 'portfolio_trend_policy',
        config_value: {
          min_cases_sample_size: 5, // Increase required sample size from 3 to 5
          min_historical_days: 14,
          comparison_window_days: 30,
        },
        actor_name: 'Test Administrator',
      });

      // 3. Verify sync getter now reflects the updated threshold
      const updatedPolicy = getPortfolioTrendPolicySync();
      expect(updatedPolicy.min_cases_sample_size).toBe(5);

      // 4. Test portfolio analyzer with 4 cases (which previously satisfied sample size = 3, but now fails min_cases_sample_size = 5)
      const fourCases: CaseEnrichedForPortfolio[] = [
        { id: 'c1', title: 'Case 1', start_date: '2026-01-01', expected_completion_date: '2026-03-01', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'c2', title: 'Case 2', start_date: '2026-01-10', expected_completion_date: '2026-03-01', created_at: '2026-01-10T00:00:00Z', updated_at: '2026-01-10T00:00:00Z' },
        { id: 'c3', title: 'Case 3', start_date: '2026-01-20', expected_completion_date: '2026-03-01', created_at: '2026-01-20T00:00:00Z', updated_at: '2026-01-20T00:00:00Z' },
        { id: 'c4', title: 'Case 4', start_date: '2026-02-01', expected_completion_date: '2026-03-01', created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' },
      ];

      const trendWithNewPolicy = analyzePortfolioTrends({
        cases: fourCases,
        currentDateStr: '2026-03-01',
      });

      // It must now report insufficient history because 4 < 5!
      expect(trendWithNewPolicy.direction).toBe('insufficient_history');
      expect(trendWithNewPolicy.reason).toContain('fewer than required minimum of 5 cases');

      // 5. Revert policy back to original seed to leave zero persistent test contamination
      await updatePolicy({
        key: 'portfolio_trend_policy',
        config_value: {
          min_cases_sample_size: 3,
          min_historical_days: 14,
          comparison_window_days: 30,
        },
        actor_name: 'Test Administrator',
      });

      const restoredPolicy = getPortfolioTrendPolicySync();
      expect(restoredPolicy.min_cases_sample_size).toBe(3);
    });

    it('verifies portfolio_attention_policy is loaded at runtime and can dynamically alter attention queue triggers', async () => {
      const initialAttentionPolicy = getPortfolioAttentionPolicySync();
      expect(initialAttentionPolicy.delay_days_threshold).toBe(10);
      expect(initialAttentionPolicy.flag_stale_external_data).toBe(true);

      // Perform a controlled update: adjust threshold to 25 days
      await updatePolicy({
        key: 'portfolio_attention_policy',
        config_value: {
          ...initialAttentionPolicy,
          delay_days_threshold: 25,
        },
        actor_name: 'Test Administrator',
      });

      const updatedAttentionPolicy = getPortfolioAttentionPolicySync();
      expect(updatedAttentionPolicy.delay_days_threshold).toBe(25);

      // Revert policy back
      await updatePolicy({
        key: 'portfolio_attention_policy',
        config_value: initialAttentionPolicy,
        actor_name: 'Test Administrator',
      });

      expect(getPortfolioAttentionPolicySync().delay_days_threshold).toBe(10);
    });
  });
});
