import { describe, test, expect, beforeEach } from 'bun:test';
import {
  getRiskWeightsSync,
  getRiskBandsSync,
  getBottleneckThresholdsSync,
  getAttentionQueueCriteriaSync,
  getEscalationRulesSync,
  updatePolicy,
  resetPoliciesToDefaults,
  DEFAULT_RISK_WEIGHTS,
} from '../server/services/policyEngine';
import { calculateDeterministicRiskAssessment } from '../server/services/riskAssessment';
import { detectCaseBottlenecks } from '../server/services/bottleneckDetector';
import { analyzePortfolioOperations } from '../server/services/portfolioAnalyzer';
import { getRecentAuditLogs, clearInMemoryAuditLogs } from '../server/services/auditLogger';
import {
  AcquisitionCase,
  CaseStageInstance,
  WorkflowStage,
  StageDependency,
} from '../shared/types';

describe('Day 5 Configurable Policy Engine & Business Rules', () => {
  beforeEach(() => {
    resetPoliciesToDefaults();
    clearInMemoryAuditLogs();
  });

  test('retrieves default institutional policy configurations with zero hardcoding', () => {
    const weights = getRiskWeightsSync();
    expect(weights.schedule_delay_weight).toBe(0.40);
    expect(weights.dependency_blockage_weight).toBe(0.25);
    expect(weights.document_friction_weight).toBe(0.20);
    expect(weights.cadastral_dispute_weight).toBe(0.15);

    const bands = getRiskBandsSync();
    expect(bands.critical_threshold).toBe(75);
    expect(bands.high_threshold).toBe(50);
    expect(bands.medium_threshold).toBe(25);

    const bottlenecks = getBottleneckThresholdsSync();
    expect(bottlenecks.active_overdue_threshold_days).toBe(5);
    expect(bottlenecks.high_overdue_days).toBe(15);
    expect(bottlenecks.critical_overdue_days).toBe(30);

    const attention = getAttentionQueueCriteriaSync();
    expect(attention.delay_days_threshold).toBe(10);
    expect(attention.flag_critical_risk).toBe(true);

    const escalation = getEscalationRulesSync();
    expect(escalation.sla_breach_escalation_days).toBe(15);
    expect(escalation.critical_risk_auto_escalate).toBe(true);
  });

  test('dynamically updates policy in-memory and records audit trail', async () => {
    const updated = await updatePolicy({
      key: 'attention_queue_criteria',
      config_value: {
        delay_days_threshold: 14,
        flag_unverified_docs: true,
        flag_disputed_parcels: true,
        flag_blocked_stages: true,
        flag_critical_risk: true,
        flag_high_risk: false,
      },
      actor_name: 'Lead Director',
      actor_id: 'director-101',
    });

    expect(updated.config_value.delay_days_threshold).toBe(14);
    expect(updated.config_value.flag_high_risk).toBe(false);

    // Verify cache updated
    const retrieved = getAttentionQueueCriteriaSync();
    expect(retrieved.delay_days_threshold).toBe(14);

    // Verify audit event captured
    const logs = getRecentAuditLogs({ event_type: 'POLICY_UPDATED' });
    expect(logs.length).toBe(1);
    expect(logs[0].actor_name).toBe('Lead Director');
    expect(logs[0].metadata?.policy_id).toBe('attention_queue_criteria');
    expect(logs[0].metadata?.new_value?.delay_days_threshold).toBe(14);
  });

  test('risk calculation responds dynamically to configurable policy weights', () => {
    const mockCase: AcquisitionCase = {
      id: 'case-test-policy',
      project_id: 'proj-1',
      workflow_id: 'wf-1',
      case_number: 'CASE/POL/001',
      title: 'Policy Sensitivity Case',
      state: 'Maharashtra',
      district: 'Pune',
      status: 'active',
      priority: 'high',
      start_date: '2026-01-01',
      expected_completion_date: '2026-06-01',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const mockStages: WorkflowStage[] = [
      { id: 's1', workflow_id: 'wf-1', stage_number: 1, code: 'S1', title: 'Sec 11', default_duration_days: 30, is_mandatory: true, required_role: 'lao', required_documents: [] },
      { id: 's2', workflow_id: 'wf-1', stage_number: 2, code: 'S2', title: 'Hearing', default_duration_days: 30, is_mandatory: true, required_role: 'lao', required_documents: [] },
    ];

    const mockInstances: CaseStageInstance[] = [
      {
        id: 'inst-1',
        case_id: 'case-test-policy',
        stage_id: 's1',
        status: 'in_progress',
        expected_start_date: '2026-01-01',
        expected_end_date: '2026-01-31',
        delay_days: 45, // significant delay
        is_overdue: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    // Baseline calculation (default schedule weight = 0.40)
    const baseline = calculateDeterministicRiskAssessment({
      caseItem: mockCase,
      stageInstances: mockInstances,
      stages: mockStages,
      dependencies: [],
      currentDateStr: '2026-03-01',
    });

    // Custom calculation where schedule weight is heavily amplified to 0.90
    const amplified = calculateDeterministicRiskAssessment({
      caseItem: mockCase,
      stageInstances: mockInstances,
      stages: mockStages,
      dependencies: [],
      currentDateStr: '2026-03-01',
      policyOverrides: {
        weights: {
          schedule_delay_weight: 0.90,
          dependency_blockage_weight: 0.05,
          document_friction_weight: 0.03,
          cadastral_dispute_weight: 0.02,
        },
      },
    });

    expect(amplified.overall_risk_score).toBeGreaterThan(baseline.overall_risk_score);
    expect(amplified.factor_breakdown.details[0].evidence).toContain('Weight: 90%');
  });

  test('bottleneck detection responds dynamically to configurable threshold overrides', () => {
    const mockStages: WorkflowStage[] = [
      { id: 's1', workflow_id: 'wf-1', stage_number: 1, code: 'S1', title: 'Joint Measurement', default_duration_days: 15, is_mandatory: true, required_role: 'revenue_inspector', required_documents: [] },
    ];

    const mockInstances: CaseStageInstance[] = [
      {
        id: 'inst-1',
        case_id: 'case-bn-policy',
        stage_id: 's1',
        status: 'in_progress',
        expected_start_date: '2026-02-01',
        expected_end_date: '2026-02-15',
        duration_actual_days: 20,
        delay_days: 7, // 7 days overdue
        is_overdue: true,
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      },
    ];

    // Under default policy (threshold = 5 days), 7 days overdue IS a bottleneck
    const defaultBottlenecks = detectCaseBottlenecks({
      caseId: 'case-bn-policy',
      stageInstances: mockInstances,
      stages: mockStages,
      dependencies: [],
      currentDateStr: '2026-02-22',
    });
    expect(defaultBottlenecks.length).toBe(1);

    // Under relaxed policy (threshold = 10 days), 7 days overdue is NOT flagged
    const relaxedBottlenecks = detectCaseBottlenecks({
      caseId: 'case-bn-policy',
      stageInstances: mockInstances,
      stages: mockStages,
      dependencies: [],
      currentDateStr: '2026-02-22',
      policyOverrides: {
        active_overdue_threshold_days: 10,
      },
    });
    expect(relaxedBottlenecks.length).toBe(0);
  });

  test('portfolio operations attention queue responds dynamically to delay threshold policy', () => {
    const mockCase: any = {
      id: 'c-delay-8',
      case_number: 'C/008',
      title: 'Moderate Delay Case',
      status: 'active',
      priority: 'medium',
      start_date: '2026-01-01',
      expected_completion_date: '2026-03-01',
      stage_instances: [
        {
          id: 'si-1',
          stage_id: 'st-1',
          status: 'completed',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-20',
          actual_start_date: '2026-01-01',
          actual_end_date: '2026-01-28', // exactly 8 days statutory delay
          delay_days: 8,
          is_overdue: false,
        },
      ],
      parcels: [],
      documents: [],
    };

    // With default delay threshold = 10 days, 8 days delay does not enter queue
    const defaultOps = analyzePortfolioOperations({
      cases: [mockCase],
      currentDateStr: '2026-01-15',
      policyOverrides: {
        delay_days_threshold: 10,
        flag_high_risk: false,
      },
    });
    expect(defaultOps.attention_queue.length).toBe(0);

    // With stricter policy threshold = 7 days, 8 days delay enters queue
    const strictOps = analyzePortfolioOperations({
      cases: [mockCase],
      currentDateStr: '2026-01-15',
      policyOverrides: {
        delay_days_threshold: 7,
      },
    });
    expect(strictOps.attention_queue.length).toBe(1);
    expect(strictOps.attention_queue[0].case_id).toBe('c-delay-8');
  });

  test('retrieves default Day 2 live external data policies via policy engine', () => {
    const {
      getFreshnessPolicySync,
      getDataQualityPolicySync,
      getSpatialDiscrepancyPolicySync,
      getWeatherRiskPolicySync,
    } = require('../server/services/policyEngine');

    const freshness = getFreshnessPolicySync();
    expect(freshness.fresh_seconds).toBe(1800);
    expect(freshness.aging_seconds).toBe(7200);
    expect(freshness.stale_seconds).toBe(86400);

    const quality = getDataQualityPolicySync();
    expect(quality.connectivity_weight).toBe(0.25);
    expect(quality.freshness_weight).toBe(0.25);
    expect(quality.completeness_weight).toBe(0.20);
    expect(quality.spatial_precision_weight).toBe(0.15);
    expect(quality.plausibility_weight).toBe(0.15);
    expect(quality.min_acceptable_score).toBe(70);

    const discrepancy = getSpatialDiscrepancyPolicySync();
    expect(discrepancy.acceptable_distance_meters).toBe(50);
    expect(discrepancy.medium_severity_distance_meters).toBe(250);
    expect(discrepancy.critical_severity_distance_meters).toBe(1000);

    const weather = getWeatherRiskPolicySync();
    expect(weather.severe_weather_delay_points).toBe(10);
    expect(weather.min_quality_score).toBe(70);
    expect(weather.allow_stale_data_influence).toBe(false);
  });

  test('Day 2 services respond dynamically when policy configuration is updated', async () => {
    const {
      getFreshnessConfig,
      evaluateFreshness,
    } = require('../server/services/freshnessEngine');
    const { calculateDataQuality } = require('../server/services/dataQualityService');

    // Update freshness policy to tighter SLA (10m = 600s)
    await updatePolicy({
      key: 'external_freshness_policy',
      config_value: {
        fresh_seconds: 600,
        aging_seconds: 1800,
        stale_seconds: 7200,
      },
    });

    const customFreshnessConfig = getFreshnessConfig('weather');
    expect(customFreshnessConfig.fresh_seconds).toBe(600);

    // 15m ago is now aging instead of fresh
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const evalResult = evaluateFreshness(fifteenMinAgo, fifteenMinAgo, 'weather');
    expect(evalResult.state).toBe('aging');

    // Update data quality min acceptable score to 85
    await updatePolicy({
      key: 'external_data_quality_policy',
      config_value: {
        connectivity_weight: 0.25,
        freshness_weight: 0.25,
        completeness_weight: 0.20,
        spatial_precision_weight: 0.15,
        plausibility_weight: 0.15,
        min_acceptable_score: 85,
      },
    });

    const qualityAssessment = calculateDataQuality({
      observation: { provider: 'Open-Meteo' },
      freshness: evalResult,
      sourceOperational: true,
    });
    // With score around 70-80, min_acceptable_score of 85 makes it not acceptable
    expect(qualityAssessment.is_acceptable).toBe(false);
  });
});
