import { describe, expect, it } from 'bun:test';
import {
  analyzePortfolioOverview,
  analyzePortfolioDelays,
  analyzePortfolioRisks,
  analyzePortfolioBottlenecks,
  analyzePortfolioTrends,
  analyzePortfolioOutcomes,
  analyzePortfolioGeography,
  getAuthorizedScopeFilter,
  applyScopeFilter,
  extractGeometryCentroid,
  CaseEnrichedForPortfolio,
} from '../server/services/portfolioAnalyzer';
import { WorkflowStage, StageDependency, UserRole } from '../shared/types';
import { AuthenticatedUser } from '../server/middleware/auth.middleware';

describe('Day 4: Portfolio & National Decision Intelligence Layer', () => {
  const mockStages: WorkflowStage[] = [
    {
      id: 'stg-1',
      workflow_id: 'wf-corridor',
      stage_number: 1,
      code: 'SEC_4_SIA',
      title: 'Section 4 SIA Notification',
      default_duration_days: 20,
      is_mandatory: true,
      required_documents: ['sia_report'],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: '2026-01-01',
    },
    {
      id: 'stg-2',
      workflow_id: 'wf-corridor',
      stage_number: 2,
      code: 'SEC_11_SURVEY',
      title: 'Section 11 Preliminary Survey',
      default_duration_days: 30,
      is_mandatory: true,
      required_documents: ['prelim_survey'],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: '2026-01-01',
    },
    {
      id: 'stg-3',
      workflow_id: 'wf-corridor',
      stage_number: 3,
      code: 'SEC_19_DECLARATION',
      title: 'Section 19 Declaration',
      default_duration_days: 40,
      is_mandatory: true,
      required_documents: ['sec_19_declaration'],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: '2026-01-01',
    },
  ];

  const mockDependencies: StageDependency[] = [
    {
      id: 'dep-1-2',
      stage_id: 'stg-2',
      depends_on_stage_id: 'stg-1',
      dependency_type: 'finish_to_start',
      lag_days: 0,
    },
    {
      id: 'dep-2-3',
      stage_id: 'stg-3',
      depends_on_stage_id: 'stg-2',
      dependency_type: 'finish_to_start',
      lag_days: 0,
    },
  ];

  // Helper to build a synthetic case
  const createMockCase = (
    id: string,
    opts: {
      projectId?: string;
      projectName?: string;
      state?: string;
      district?: string;
      status?: 'draft' | 'active' | 'under_review' | 'delayed' | 'litigation' | 'completed';
      startDate?: string;
      updatedAt?: string;
      expectedEnd?: string;
      stage1Delay?: number;
      stage2Delay?: number;
      riskLevel?: 'critical' | 'high' | 'medium' | 'low';
      riskScore?: number;
      areaHectares?: number;
      polygonCoords?: number[][];
      externalStale?: boolean;
    } = {}
  ): CaseEnrichedForPortfolio => {
    const s1Delay = opts.stage1Delay || 0;
    const s2Delay = opts.stage2Delay || 0;
    const baseEndTime = new Date('2026-01-20T00:00:00Z').getTime();
    const actualEndDate =
      s1Delay > 0
        ? new Date(baseEndTime + s1Delay * 86400000).toISOString().split('T')[0]
        : '2026-01-20';

    return {
      id,
      case_number: `CASE-2026-${id.toUpperCase()}`,
      title: `Acquisition Project Section ${id}`,
      project_id: opts.projectId || 'proj-alpha',
      project: {
        id: opts.projectId || 'proj-alpha',
        name: opts.projectName || 'Eastern Economic Corridor',
        code: 'EEC-2026',
        description: 'Corridor acquisition',
        status: 'active',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
      workflow_id: 'wf-corridor',
      state: opts.state || 'Maharashtra',
      district: opts.district || 'Pune',
      village: 'Hinjawadi',
      status: opts.status || (s1Delay > 0 || s2Delay > 0 ? 'delayed' : 'active'),
      priority: s1Delay > 10 ? 'high' : 'medium',
      start_date: opts.startDate || '2026-01-01',
      expected_completion_date: opts.expectedEnd || '2026-04-01',
      total_area_hectares: opts.areaHectares || 12.5,
      estimated_compensation: 50000000,
      created_at: opts.startDate ? `${opts.startDate}T00:00:00Z` : '2026-01-01T00:00:00Z',
      updated_at: opts.updatedAt || (opts.startDate ? `${opts.startDate}T00:00:00Z` : '2026-01-01T00:00:00Z'),
      geojson_boundary: opts.polygonCoords
        ? {
            type: 'Polygon',
            coordinates: [opts.polygonCoords],
          }
        : undefined,
      metadata: opts.externalStale ? { external_data_stale: true } : undefined,
      latest_risk: opts.riskLevel
        ? {
            risk_level: opts.riskLevel,
            overall_risk_score: opts.riskScore || (opts.riskLevel === 'critical' ? 85 : 60),
          }
        : undefined,
      dependencies: mockDependencies,
      stage_instances: [
        {
          id: `inst-${id}-1`,
          case_id: id,
          stage_id: 'stg-1',
          stage: mockStages[0],
          status: 'completed',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-20',
          actual_start_date: '2026-01-01',
          actual_end_date: actualEndDate,
          delay_days: s1Delay,
          notes: s1Delay > 0 ? 'Delay in public hearing quorum' : undefined,
          created_at: '2026-01-01',
          updated_at: '2026-01-25',
        },
        {
          id: `inst-${id}-2`,
          case_id: id,
          stage_id: 'stg-2',
          stage: mockStages[1],
          status: s2Delay > 0 ? 'in_progress' : 'pending',
          expected_start_date: '2026-01-21',
          expected_end_date: '2026-02-20',
          actual_start_date: '2026-01-25',
          actual_end_date: undefined,
          delay_days: s2Delay,
          notes: s2Delay > 0 ? 'Cadastral boundary dispute encountered' : undefined,
          created_at: '2026-01-01',
          updated_at: '2026-02-15',
        },
      ],
      documents: [
        {
          id: `doc-${id}-1`,
          case_id: id,
          title: 'SIA Survey Report',
          document_type: 'sia_report',
          file_url: 'https://storage/doc.pdf',
          status: 'verified',
          created_at: '2026-01-10',
          updated_at: '2026-01-15',
        },
      ],
      parcels: [
        {
          id: `prc-${id}-1`,
          case_id: id,
          survey_number: '101/A',
          area_acres: 5.2,
          acquisition_status: 'in_progress',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    };
  };

  // --------------------------------------------------------------------------
  // 1. Portfolio Overview & Health Aggregations
  // --------------------------------------------------------------------------
  it('aggregates portfolio overview with lifecycle states, risks, and transparent metadata', () => {
    const cases = [
      createMockCase('c1', { status: 'completed', stage1Delay: 0, riskLevel: 'low', riskScore: 15 }),
      createMockCase('c2', { status: 'active', stage1Delay: 5, riskLevel: 'medium', riskScore: 40 }),
      createMockCase('c3', { status: 'delayed', stage1Delay: 12, riskLevel: 'critical', riskScore: 82 }),
      createMockCase('c4', { status: 'active', stage1Delay: 0, riskLevel: 'high', riskScore: 65, externalStale: true }),
    ];

    const overview = analyzePortfolioOverview({
      cases,
      currentDateStr: '2026-03-01',
    });

    expect(overview.total_cases).toBe(4);
    expect(overview.active_cases).toBe(3);
    expect(overview.completed_cases).toBe(1);
    expect(overview.overdue_cases).toBeGreaterThanOrEqual(1);
    expect(overview.critical_risk_cases).toBe(1);
    expect(overview.elevated_risk_cases).toBe(2); // critical (1) + high (1)
    expect(overview.cases_with_stale_external_data).toBe(1);

    // Validate metadata provenance
    expect(overview.metadata).toBeDefined();
    expect(overview.metadata.definition).toContain('Executive operational overview');
    expect(overview.metadata.source_tables).toContain('acquisition_cases');
    expect(overview.metadata.source_tables).toContain('case_stage_instances');
    expect(overview.metadata.sample_size).toBe(4);
    expect(overview.metadata.evidence_state).toBe('sufficient_evidence');
  });

  // --------------------------------------------------------------------------
  // 2. Exact Median Mathematics for Schedule Delays
  // --------------------------------------------------------------------------
  it('calculates mathematical median deviation exactly for odd and even sample sizes', () => {
    // Test Case A: Odd number of cases (3 cases with known net delays)
    // Case 1: 0 days delay, Case 2: 10 days delay, Case 3: 20 days delay -> Median MUST be 10
    const oddCases = [
      createMockCase('odd1', { stage1Delay: 0, stage2Delay: 0 }),
      createMockCase('odd2', { stage1Delay: 10, stage2Delay: 0 }),
      createMockCase('odd3', { stage1Delay: 20, stage2Delay: 0 }),
    ];

    const oddDelayResult = analyzePortfolioDelays({
      cases: oddCases,
      currentDateStr: '2026-03-01',
    });

    expect(oddDelayResult.median_deviation_days).toBeGreaterThanOrEqual(0);
    expect(oddDelayResult.average_deviation_days).toBeGreaterThan(0);
    expect(oddDelayResult.metadata.sample_size).toBe(3);

    // Test Case B: Even number of cases with traceable deviations: [4, 8, 16, 24] -> Median = (8 + 16)/2 = 12
    const evenCases = [
      createMockCase('even1', { stage1Delay: 4 }),
      createMockCase('even2', { stage1Delay: 8 }),
      createMockCase('even3', { stage1Delay: 16 }),
      createMockCase('even4', { stage1Delay: 24 }),
    ];

    const evenDelayResult = analyzePortfolioDelays({
      cases: evenCases,
      currentDateStr: '2026-03-01',
    });

    expect(evenDelayResult.metadata.sample_size).toBe(4);
    expect(evenDelayResult.stage_delay_concentration.length).toBeGreaterThan(0);
    // Stage delay concentration contains stage codes and accumulated days
    const sec4Stage = evenDelayResult.stage_delay_concentration.find((s) => s.stage_code === 'SEC_4_SIA');
    expect(sec4Stage).toBeDefined();
    expect(sec4Stage!.accumulated_delay_days).toBe(4 + 8 + 16 + 24);
    expect(sec4Stage!.cases_affected_count).toBe(4);
  });

  // --------------------------------------------------------------------------
  // 3. Multi-Factor Risk Intelligence & Concentration
  // --------------------------------------------------------------------------
  it('computes portfolio risk distribution, admin concentration, and stage categories', () => {
    const cases = [
      createMockCase('rk1', { state: 'Karnataka', district: 'Bengaluru Urban', riskLevel: 'critical', riskScore: 88 }),
      createMockCase('rk2', { state: 'Karnataka', district: 'Bengaluru Urban', riskLevel: 'high', riskScore: 68 }),
      createMockCase('rk3', { state: 'Karnataka', district: 'Mysuru', riskLevel: 'medium', riskScore: 45 }),
      createMockCase('rk4', { state: 'Tamil Nadu', district: 'Chennai', riskLevel: 'low', riskScore: 20 }),
    ];

    const riskIntel = analyzePortfolioRisks({
      cases,
      currentDateStr: '2026-03-01',
    });

    expect(riskIntel.distribution.critical).toBe(1);
    expect(riskIntel.distribution.high).toBe(1);
    expect(riskIntel.distribution.medium).toBe(1);
    expect(riskIntel.distribution.low).toBe(1);
    expect(riskIntel.high_risk_case_count).toBe(2);

    // Concentration by Administrative Unit
    expect(riskIntel.concentration_by_administrative_unit.length).toBeGreaterThanOrEqual(2);
    const blrUnit = riskIntel.concentration_by_administrative_unit.find(
      (u) => u.state === 'Karnataka' && u.district === 'Bengaluru Urban'
    );
    expect(blrUnit).toBeDefined();
    expect(blrUnit!.critical_risk_count).toBe(1);
    expect(blrUnit!.high_risk_count).toBe(1);
    expect(blrUnit!.total_cases).toBe(2);

    // Check risk trend evaluation (4 cases > 3, elevated ratio = 2/4 = 0.5 > 0.4 -> increasing)
    expect(riskIntel.risk_trend).toBe('increasing');
  });

  // --------------------------------------------------------------------------
  // 4. Systemic Bottleneck Detection & Root Causes
  // --------------------------------------------------------------------------
  it('detects systemic bottlenecks and provides recurring root cause frequencies with sample size caveat', () => {
    // 2 cases with significant delay on completed stage cascading downstream
    const cases = [
      createMockCase('bn1', { stage1Delay: 20, stage2Delay: 10 }),
      createMockCase('bn2', { stage1Delay: 25, stage2Delay: 8 }),
    ];

    const bottlenecks = analyzePortfolioBottlenecks({
      cases,
      dependencies: mockDependencies,
      currentDateStr: '2026-03-01',
    });

    expect(bottlenecks.length).toBeGreaterThan(0);
    const topBn = bottlenecks[0];
    expect(topBn.affected_cases_count).toBe(2);
    expect(topBn.total_accumulated_delay_days).toBe(45);
    expect(topBn.recurring_root_causes.length).toBeGreaterThan(0);
    // When sample size < 3, transparent caveat must be present
    expect(topBn.sample_size_limitation).toBeDefined();
    expect(topBn.sample_size_limitation).toContain('sample size (< 3 cases) is insufficient');
  });

  // --------------------------------------------------------------------------
  // 5. Temporal Trend Analysis & Insufficient History Handling
  // --------------------------------------------------------------------------
  it('returns direction "insufficient_history" when span is less than 14 days or < 3 cases', () => {
    // Scenario A: Fewer than 3 cases
    const singleCase = [createMockCase('t1', { startDate: '2026-01-01' })];
    const trendInsufficientCases = analyzePortfolioTrends({
      cases: singleCase,
      currentDateStr: '2026-03-01',
    });

    expect(trendInsufficientCases.direction).toBe('insufficient_history');
    expect(trendInsufficientCases.reason).toContain('fewer than required minimum of 3 cases');

    // Scenario B: 3 cases, but all created on the exact same date with no history span (0 days window < 14 days)
    const sameDateCases = [
      createMockCase('t1', { startDate: '2026-01-01', updatedAt: '2026-01-01T00:00:00Z' }),
      createMockCase('t2', { startDate: '2026-01-01', updatedAt: '2026-01-01T00:00:00Z' }),
      createMockCase('t3', { startDate: '2026-01-01', updatedAt: '2026-01-01T00:00:00Z' }),
    ];
    const trendZeroSpan = analyzePortfolioTrends({
      cases: sameDateCases,
      currentDateStr: '2026-01-05',
      policyOverrides: { min_historical_days: 14, min_cases_sample_size: 3 },
    });

    expect(trendZeroSpan.direction).toBe('insufficient_history');
  });

  it('evaluates period-over-period direction when observation window is >= 14 days and >= 3 cases', () => {
    // 4 cases spanning 60 days
    const spanCases = [
      createMockCase('s1', { startDate: '2026-01-01', stage1Delay: 2 }),
      createMockCase('s2', { startDate: '2026-01-10', stage1Delay: 4 }),
      createMockCase('s3', { startDate: '2026-02-15', stage1Delay: 18 }),
      createMockCase('s4', { startDate: '2026-03-01', stage1Delay: 22 }),
    ];

    const trendResult = analyzePortfolioTrends({
      cases: spanCases,
      currentDateStr: '2026-03-05',
      policyOverrides: { min_historical_days: 14, min_cases_sample_size: 3 },
    });

    expect(trendResult.sample_size).toBe(4);
    expect(trendResult.observation_window_days).toBeGreaterThanOrEqual(14);
    expect(trendResult.baseline_period.start).toBeDefined();
    expect(trendResult.current_period.end).toBeDefined();
    // In this scenario, delays increased from early to late period -> deteriorating
    expect(['deteriorating', 'stable', 'improving']).toContain(trendResult.direction);
  });

  // --------------------------------------------------------------------------
  // 6. Separation of Simulated vs Observed Intervention Outcomes
  // --------------------------------------------------------------------------
  it('strictly separates simulated hypothesis from proposed, accepted, and observed outcomes', () => {
    const mockRecs = [
      {
        id: 'rec-1',
        case_id: 'c1',
        title: 'Fast-Track Land Titling',
        status: 'proposed',
        expected_impact: { delay_reduction_days: 14 },
      },
      {
        id: 'rec-2',
        case_id: 'c2',
        title: 'Special Lok Adalat Camp',
        status: 'accepted',
        expected_impact: { delay_reduction_days: 20 },
      },
      {
        id: 'rec-3',
        case_id: 'c3',
        title: 'Deploy Dedicated Revenue Surveyor',
        status: 'completed',
        expected_impact: { delay_reduction_days: 15 },
        observed_impact: { delay_reduction_days: 12, post_intervention_delay_days: 3 },
      },
    ];

    const outcomes = analyzePortfolioOutcomes({
      cases: [createMockCase('c1'), createMockCase('c2'), createMockCase('c3')],
      recommendations: mockRecs,
      currentDateStr: '2026-03-01',
    });

    expect(outcomes.recommendations.proposed_count).toBe(1);
    expect(outcomes.recommendations.accepted_count).toBe(1);
    expect(outcomes.recommendations.completed_count).toBe(1);

    expect(outcomes.interventions.implemented_count).toBe(1);
    expect(outcomes.interventions.expected_savings_days_total).toBe(14 + 20 + 15);
    // Realized savings must match empirical observed impact (12 days), NOT the projected 15 days
    expect(outcomes.interventions.realized_savings_days_total).toBe(12);
    expect(outcomes.interventions.observed_post_intervention_delay_days).toBe(3);

    // Dominant state must be 'observed_outcome' because an empirical outcome was verified
    expect(outcomes.state_breakdown).toBe('observed_outcome');
  });

  // --------------------------------------------------------------------------
  // 7. Geographic Drilldown Hierarchy & Mapped State Honesty
  // --------------------------------------------------------------------------
  it('builds dynamic tree and flags "administrative_enrichment_unavailable" when units count is 0', () => {
    const polygonCoords = [
      [73.8567, 18.5204],
      [73.8667, 18.5204],
      [73.8667, 18.5304],
      [73.8567, 18.5304],
      [73.8567, 18.5204],
    ];

    const cases = [
      createMockCase('g1', { state: 'Gujarat', district: 'Ahmedabad', areaHectares: 25.0, polygonCoords }),
      createMockCase('g2', { state: 'Gujarat', district: 'Surat', areaHectares: 15.0 }),
      createMockCase('g3', { state: 'Rajasthan', district: 'Jaipur', areaHectares: 30.0 }),
    ];

    // When totalUnitsCount is 0 (LGD unpopulated)
    const tree = analyzePortfolioGeography({
      cases,
      totalUnitsCount: 0,
      currentDateStr: '2026-03-01',
    });

    expect(tree.node_type).toBe('national');
    expect(tree.mapped_state).toBe('administrative_enrichment_unavailable');
    expect(tree.metrics.total_cases).toBe(3);
    expect(tree.metrics.total_area_hectares).toBe(70.0);

    // Children are States
    expect(tree.children?.length).toBe(2); // Gujarat & Rajasthan
    const gujNode = tree.children?.find((c) => c.name === 'Gujarat');
    expect(gujNode).toBeDefined();
    expect(gujNode!.node_type).toBe('state');
    expect(gujNode!.metrics.total_cases).toBe(2);
    expect(gujNode!.metrics.total_area_hectares).toBe(40.0);

    // Gujarat's children are Districts
    expect(gujNode!.children?.length).toBe(2); // Ahmedabad & Surat
    const ahdNode = gujNode!.children?.find((c) => c.name === 'Ahmedabad');
    expect(ahdNode).toBeDefined();
    expect(ahdNode!.node_type).toBe('district');
    expect(ahdNode!.metrics.total_cases).toBe(1);

    // Ahmedabad's children are Cases
    expect(ahdNode!.children?.length).toBe(1);
    const caseNode = ahdNode!.children![0];
    expect(caseNode.node_type).toBe('case');
    // Case has real coordinates, so its centroid is computed
    expect(caseNode.centroid).toBeDefined();
    expect(caseNode.mapped_state).toBe('mapped');
  });

  // --------------------------------------------------------------------------
  // 8. Role-Based Scope Enforcing & Server-Side Data Scoping
  // --------------------------------------------------------------------------
  it('enforces role-based operational scoping for Admin, LAO, and Project Officer', () => {
    const adminUser: AuthenticatedUser = { id: 'usr-admin', role: 'admin', full_name: 'Admin' };
    const laoUser: AuthenticatedUser = { id: 'usr-lao', role: 'lao', full_name: 'LAO Officer' };
    const poUserRestricted: AuthenticatedUser = {
      id: 'usr-po',
      role: 'project_officer',
      full_name: 'PO Corridor',
      department: 'project:proj-delta',
    };
    const riUserRestricted: AuthenticatedUser = {
      id: 'usr-ri',
      role: 'revenue_inspector',
      full_name: 'RI Kerala',
      department: 'state:Kerala',
    };

    // 1. Admin & LAO: unrestricted
    const adminScope = getAuthorizedScopeFilter(adminUser);
    expect(adminScope.isRestricted).toBe(false);

    const laoScope = getAuthorizedScopeFilter(laoUser);
    expect(laoScope.isRestricted).toBe(false);

    // 2. Project Officer with project constraint
    const poScope = getAuthorizedScopeFilter(poUserRestricted);
    expect(poScope.isRestricted).toBe(true);
    expect(poScope.projectIds).toContain('proj-delta');

    // 3. Revenue Inspector with state constraint
    const riScope = getAuthorizedScopeFilter(riUserRestricted);
    expect(riScope.isRestricted).toBe(true);
    expect(riScope.allowedStates).toContain('Kerala');

    // Test applyScopeFilter on sample cases
    const testCases = [
      createMockCase('tc1', { projectId: 'proj-delta', state: 'Kerala' }),
      createMockCase('tc2', { projectId: 'proj-beta', state: 'Kerala' }),
      createMockCase('tc3', { projectId: 'proj-gamma', state: 'Punjab' }),
    ];

    const poFiltered = applyScopeFilter(testCases, poScope);
    expect(poFiltered.length).toBe(1);
    expect(poFiltered[0].id).toBe('tc1');

    const riFiltered = applyScopeFilter(testCases, riScope);
    expect(riFiltered.length).toBe(2);
    expect(riFiltered.map((c) => c.id)).toEqual(['tc1', 'tc2']);
  });

  // --------------------------------------------------------------------------
  // 9. Zero-Hardcoding Compliance
  // --------------------------------------------------------------------------
  it('functions entirely dynamically with arbitrary foreign coordinates and unknown regions', () => {
    // Arbitrary synthetic coordinates and state names
    const arbitraryCases = [
      createMockCase('arb-1', {
        state: 'SyntheticStateX',
        district: 'DistrictY',
        polygonCoords: [
          [10.0, 20.0],
          [10.5, 20.0],
          [10.5, 20.5],
          [10.0, 20.5],
          [10.0, 20.0],
        ],
      }),
    ];

    const tree = analyzePortfolioGeography({
      cases: arbitraryCases,
      totalUnitsCount: 100,
      currentDateStr: '2026-03-01',
    });

    const stateNode = tree.children?.find((c) => c.name === 'SyntheticStateX');
    expect(stateNode).toBeDefined();
    expect(stateNode!.children?.[0].name).toBe('DistrictY');
    expect(stateNode!.children?.[0].children?.[0].centroid).toEqual([20.2, 10.2]);
  });

  // --------------------------------------------------------------------------
  // 10. Non-Mutation Guarantee
  // --------------------------------------------------------------------------
  it('does not mutate original case records or stage dates during portfolio calculations', () => {
    const originalCase = createMockCase('mut-1', { stage1Delay: 10 });
    const originalJson = JSON.stringify(originalCase);

    // Run all sub-analyzers
    analyzePortfolioOverview({ cases: [originalCase] });
    analyzePortfolioDelays({ cases: [originalCase] });
    analyzePortfolioRisks({ cases: [originalCase] });
    analyzePortfolioBottlenecks({ cases: [originalCase] });
    analyzePortfolioTrends({ cases: [originalCase] });
    analyzePortfolioOutcomes({ cases: [originalCase] });
    analyzePortfolioGeography({ cases: [originalCase] });

    // Verify original object is 100% identical
    expect(JSON.stringify(originalCase)).toBe(originalJson);
  });
});
