import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  AcquisitionCase,
  CaseStageInstance,
  WorkflowStage,
  StageDependency,
  Parcel,
  CaseDocument,
  ExternalObservation,
  DataDiscrepancy,
} from '../shared/types';
import { calculatePredictiveDelay } from '../server/services/predictiveDelayEngine';
import { calculateDownstreamDAGImpact } from '../server/services/impactAnalyzer';
import { analyzeCaseRootCauses } from '../server/services/rootCauseAnalyzer';
import { generateEvidenceBasedRecommendations } from '../server/services/recommendationEngine';
import { runWhatIfScenarioSimulation } from '../server/services/scenarioSimulator';
import {
  updatePolicy,
  resetPoliciesToDefaults,
  getPredictiveDelayPolicySync,
  getRecommendationPolicySync,
} from '../server/services/policyEngine';

describe('BhoomiDarpan Day 3 Final Hardening & Verification Pass', () => {
  const mockCase: AcquisitionCase = {
    id: 'case-harden-001',
    project_id: 'proj-harden-001',
    workflow_id: 'wf-harden-001',
    case_number: 'LA-2026-HARDEN-01',
    title: 'Hardened Corridor Acquisition Verification',
    description: 'Statutory verification corridor',
    state: 'State-Dynamic',
    district: 'District-Dynamic',
    status: 'in_progress',
    priority: 'high',
    current_stage_id: 'stg-1',
    total_area_acres: 50,
    created_at: '2026-01-01',
    updated_at: '2026-02-01',
  };

  const mockStages: WorkflowStage[] = [
    {
      id: 'stg-1',
      workflow_id: 'wf-harden-001',
      stage_number: 1,
      name: 'preliminary_survey',
      title: 'Preliminary Survey & Boundary Marking',
      stage_category: 'survey',
      default_duration_days: 20,
      is_mandatory: true,
      statutory_sla_days: 30,
      is_active: true,
    },
    {
      id: 'stg-2',
      workflow_id: 'wf-harden-001',
      stage_number: 2,
      name: 'sec_11_notification',
      title: 'Section 11 Preliminary Notification',
      stage_category: 'legal',
      default_duration_days: 25,
      is_mandatory: true,
      statutory_sla_days: 35,
      is_active: true,
    },
    {
      id: 'stg-3',
      workflow_id: 'wf-harden-001',
      stage_number: 3,
      name: 'hearing_objections',
      title: 'Hearing of Objections (Section 15)',
      stage_category: 'hearing',
      default_duration_days: 30,
      is_mandatory: true,
      statutory_sla_days: 45,
      is_active: true,
    },
    {
      id: 'stg-4-parallel',
      workflow_id: 'wf-harden-001',
      stage_number: 4,
      name: 'social_impact_assessment',
      title: 'Social Impact Assessment (Parallel Track)',
      stage_category: 'survey',
      default_duration_days: 15,
      is_mandatory: false,
      statutory_sla_days: 25,
      is_active: true,
    },
  ];

  beforeEach(() => {
    resetPoliciesToDefaults();
  });

  afterEach(() => {
    resetPoliciesToDefaults();
  });

  // ==========================================================================
  // 1. VERIFY PREDICTIVE DELAY MATHEMATICS
  // ==========================================================================
  describe('1. Predictive Delay Arithmetic & Evidence Traceability', () => {
    it('manually traces completed milestones velocity calculation with exact arithmetic', () => {
      // Completed Milestone 1: expected Jan 1 to Jan 21 (20 days), actual Jan 1 to Feb 01 (31 days)
      // Completed Milestone 2: expected Jan 21 to Feb 10 (20 days), actual Feb 01 to Feb 21 (20 days)
      // Total Expected = 20 + 20 = 40 days
      // Total Actual = 31 + 20 = 51 days
      // Expected Velocity Ratio = 51 / 40 = 1.275 -> rounded to 1.28
      const stageInstances: CaseStageInstance[] = [
        {
          id: 'inst-1',
          case_id: mockCase.id,
          stage_id: 'stg-1',
          status: 'completed',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-21',
          actual_start_date: '2026-01-01',
          actual_end_date: '2026-02-01',
          delay_days: 11,
          created_at: '2026-01-01',
          updated_at: '2026-02-01',
        },
        {
          id: 'inst-2',
          case_id: mockCase.id,
          stage_id: 'stg-2',
          status: 'completed',
          expected_start_date: '2026-01-21',
          expected_end_date: '2026-02-10',
          actual_start_date: '2026-02-01',
          actual_end_date: '2026-02-21',
          delay_days: 11,
          created_at: '2026-01-01',
          updated_at: '2026-02-21',
        },
        {
          id: 'inst-3',
          case_id: mockCase.id,
          stage_id: 'stg-3',
          status: 'in_progress',
          expected_start_date: '2026-02-10',
          expected_end_date: '2026-03-12',
          delay_days: 0,
          created_at: '2026-01-01',
          updated_at: '2026-02-21',
        },
      ];

      const { estimate, evidenceLedger } = calculatePredictiveDelay({
        caseItem: mockCase,
        stageInstances,
        stages: mockStages.slice(0, 3),
        dependencies: [
          { id: 'dep-1', workflow_id: 'wf-harden-001', stage_id: 'stg-2', depends_on_stage_id: 'stg-1', dependency_type: 'finish_to_start', lag_days: 0 },
          { id: 'dep-2', workflow_id: 'wf-harden-001', stage_id: 'stg-3', depends_on_stage_id: 'stg-2', dependency_type: 'finish_to_start', lag_days: 0 },
        ],
        currentDateStr: '2026-02-22',
      });

      // Verify exact arithmetic
      expect(estimate.historical_velocity_ratio).toBe(1.28);
      expect(estimate.methodology).toBe('historical_velocity_and_critical_path_dag');

      // Remaining stage is stg-3 (default duration 30 days)
      // Velocity delay formula: Math.round(30 * (1.28 - 1.0) * 0.40) = Math.round(30 * 0.28 * 0.40) = Math.round(3.36) = 3 days
      expect(estimate.expected_additional_delay_days).toBe(3);

      // Verify evidence ledger contains the observed fact
      const fact = evidenceLedger.find((e) => e.classification === 'observed_fact');
      expect(fact).toBeDefined();
      expect(fact?.statement).toContain('Velocity Ratio: 1.28x');
    });

    it('honestly reports statutory baseline and limitations when 0 milestones completed', () => {
      const stageInstances: CaseStageInstance[] = [
        {
          id: 'inst-1',
          case_id: mockCase.id,
          stage_id: 'stg-1',
          status: 'in_progress',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-21',
          delay_days: 0,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      const { estimate } = calculatePredictiveDelay({
        caseItem: mockCase,
        stageInstances,
        stages: [mockStages[0]],
        dependencies: [],
        currentDateStr: '2026-01-10',
      });

      expect(estimate.historical_velocity_ratio).toBe(1.0);
      expect(estimate.methodology).toBe('statutory_baseline_only');
      expect(estimate.limitations.some((l) => l.includes('Zero completed milestones'))).toBe(true);
      expect(estimate.confidence).toBeLessThan(0.85);
    });

    it('does not double-count active stage overdue in expected additional delay', () => {
      // Active stage is overdue by 10 days
      const stageInstances: CaseStageInstance[] = [
        {
          id: 'inst-1',
          case_id: mockCase.id,
          stage_id: 'stg-1',
          status: 'in_progress',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-20',
          delay_days: 10,
          created_at: '2026-01-01',
          updated_at: '2026-01-30',
        },
      ];

      const { estimate } = calculatePredictiveDelay({
        caseItem: mockCase,
        stageInstances,
        stages: [mockStages[0]],
        dependencies: [],
        currentDateStr: '2026-01-30', // 10 days past expected_end
      });

      // Active stage overdue is tracked in current_stage_delay_risk_days
      expect(estimate.current_stage_delay_risk_days).toBe(10);
      // But expected_additional_delay_days (future friction beyond current realized slip) is 0
      expect(estimate.expected_additional_delay_days).toBe(0);
    });
  });

  // ==========================================================================
  // 2. VERIFY RUNTIME POLICY DYNAMISM
  // ==========================================================================
  describe('2. Runtime System Policy Dynamic Usage', () => {
    it('modifies predictive delay calculations immediately when policy is updated at runtime', async () => {
      const stageInstances: CaseStageInstance[] = [
        {
          id: 'inst-1',
          case_id: mockCase.id,
          stage_id: 'stg-1',
          status: 'in_progress',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-20',
          delay_days: 0,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      const mockDocs: CaseDocument[] = [
        {
          id: 'doc-1',
          case_id: mockCase.id,
          title: 'Gazette Notice Copy',
          document_type: 'preliminary_notice',
          file_path: 'docs/test.pdf',
          mime_type: 'application/pdf',
          status: 'validation_required',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      // Default policy allocates 7 days per pending document
      const defaultRun = calculatePredictiveDelay({
        caseItem: mockCase,
        stageInstances,
        stages: [mockStages[0]],
        dependencies: [],
        documents: mockDocs,
        currentDateStr: '2026-01-05',
      });
      expect(defaultRun.estimate.expected_additional_delay_days).toBe(7);

      // Now dynamically update policy at runtime: change document_clearance_delay_days to 14
      const currentPol = getPredictiveDelayPolicySync();
      await updatePolicy({
        key: 'predictive_delay_policy',
        config_value: {
          ...currentPol,
          document_clearance_delay_days: 14,
        },
        actor_name: 'Policy Test Officer',
      });

      // Re-run calculation: behavior must immediately reflect updated policy without code changes
      const updatedRun = calculatePredictiveDelay({
        caseItem: mockCase,
        stageInstances,
        stages: [mockStages[0]],
        dependencies: [],
        documents: mockDocs,
        currentDateStr: '2026-01-05',
      });
      expect(updatedRun.estimate.expected_additional_delay_days).toBe(14);
    });

    it('modifies recommendation urgency thresholds dynamically when policy is updated', async () => {
      const currentRecPol = getRecommendationPolicySync();
      expect(currentRecPol.elevated_urgency_delay_threshold).toBe(5);

      // Update recommendation policy to flag elevated urgency at 2 days delay
      await updatePolicy({
        key: 'recommendation_policy',
        config_value: {
          ...currentRecPol,
          elevated_urgency_delay_threshold: 2,
        },
        actor_name: 'Admin Officer',
      });

      const recs = generateEvidenceBasedRecommendations({
        caseId: mockCase.id,
        bottlenecks: [
          {
            stage_instance_id: 'inst-1',
            stage_title: 'Joint Survey Inspection',
            deviation_days: 3, // 3 days > 2 days threshold
            severity: 'high',
            evidence: 'Exceeded SLA duration by 3 days',
            downstream_stages_count: 1,
            downstream_stage_titles: ['Section 11 Notification'],
          },
        ],
        rootCauses: [],
        stageInstances: [],
        stages: mockStages,
      });

      const stageRec = recs.find((r) => r.action_type === 'compress_stage_duration');
      expect(stageRec).toBeDefined();
      expect(stageRec?.urgency).toBe('elevated');
    });
  });

  // ==========================================================================
  // 3. DOWNSTREAM IMPACT: 5 SPECIFIC DAG CASES
  // ==========================================================================
  describe('3. Downstream Schedule DAG Impact: 5 Canonical Cases', () => {
    // Case A: No dependency
    it('Case A: evaluates stage with zero dependencies without artificial propagation', () => {
      const stageInstances: CaseStageInstance[] = [
        {
          id: 'inst-1',
          case_id: mockCase.id,
          stage_id: 'stg-1',
          status: 'completed',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-20',
          actual_start_date: '2026-01-01',
          actual_end_date: '2026-01-30', // 10 days slip
          delay_days: 10,
          created_at: '2026-01-01',
          updated_at: '2026-01-30',
        },
      ];

      const impact = calculateDownstreamDAGImpact({
        stageInstances,
        stages: [mockStages[0]],
        dependencies: [],
        currentDateStr: '2026-02-01',
      });

      expect(impact.affected_downstream_stages.length).toBe(1);
      expect(impact.affected_downstream_stages[0].impact_type).toBe('direct_delay');
      expect(impact.propagated_delay_days).toBe(0);
      expect(impact.direct_delay_days).toBe(10);
      expect(impact.projected_net_delay_days).toBe(10);
    });

    // Case B: One dependent stage
    it('Case B: propagates delay directly from Stage 1 to single dependent Stage 2', () => {
      const stageInstances: CaseStageInstance[] = [
        {
          id: 'inst-1',
          case_id: mockCase.id,
          stage_id: 'stg-1',
          status: 'completed',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-20',
          actual_start_date: '2026-01-01',
          actual_end_date: '2026-01-30',
          delay_days: 10,
          created_at: '2026-01-01',
          updated_at: '2026-01-30',
        },
        {
          id: 'inst-2',
          case_id: mockCase.id,
          stage_id: 'stg-2',
          status: 'in_progress',
          expected_start_date: '2026-01-21',
          expected_end_date: '2026-02-15',
          delay_days: 0,
          created_at: '2026-01-01',
          updated_at: '2026-01-30',
        },
      ];

      const impact = calculateDownstreamDAGImpact({
        stageInstances,
        stages: mockStages.slice(0, 2),
        dependencies: [
          { id: 'dep-1', workflow_id: 'wf-harden-001', stage_id: 'stg-2', depends_on_stage_id: 'stg-1', dependency_type: 'finish_to_start', lag_days: 0 },
        ],
        currentDateStr: '2026-02-01',
      });

      const stg1 = impact.affected_downstream_stages.find((s) => s.stage_id === 'stg-1');
      const stg2 = impact.affected_downstream_stages.find((s) => s.stage_id === 'stg-2');

      expect(stg1?.impact_type).toBe('direct_delay');
      expect(stg2?.impact_type).toBe('propagated_delay');
      expect(stg2?.delay_shift_days).toBe(9); // Jan 30 + 25d = Feb 24 (9 days after Feb 15)
    });

    // Case C: Multi-level dependency chain (stg-1 -> stg-2 -> stg-3)
    it('Case C: propagates delay along multi-level chain without double-counting net project slip', () => {
      const stageInstances: CaseStageInstance[] = [
        {
          id: 'inst-1',
          case_id: mockCase.id,
          stage_id: 'stg-1',
          status: 'completed',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-20',
          actual_start_date: '2026-01-01',
          actual_end_date: '2026-01-30', // +10 days
          delay_days: 10,
          created_at: '2026-01-01',
          updated_at: '2026-01-30',
        },
        {
          id: 'inst-2',
          case_id: mockCase.id,
          stage_id: 'stg-2',
          status: 'not_started',
          expected_start_date: '2026-01-21',
          expected_end_date: '2026-02-15',
          delay_days: 0,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
        {
          id: 'inst-3',
          case_id: mockCase.id,
          stage_id: 'stg-3',
          status: 'not_started',
          expected_start_date: '2026-02-16',
          expected_end_date: '2026-03-18',
          delay_days: 0,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      const impact = calculateDownstreamDAGImpact({
        stageInstances,
        stages: mockStages.slice(0, 3),
        dependencies: [
          { id: 'dep-1', workflow_id: 'wf-harden-001', stage_id: 'stg-2', depends_on_stage_id: 'stg-1', dependency_type: 'finish_to_start', lag_days: 0 },
          { id: 'dep-2', workflow_id: 'wf-harden-001', stage_id: 'stg-3', depends_on_stage_id: 'stg-2', dependency_type: 'finish_to_start', lag_days: 0 },
        ],
        currentDateStr: '2026-02-01',
      });

      // Both downstream stages receive propagated delay
      const stg2 = impact.affected_downstream_stages.find((s) => s.stage_id === 'stg-2');
      const stg3 = impact.affected_downstream_stages.find((s) => s.stage_id === 'stg-3');
      expect(stg2?.impact_type).toBe('propagated_delay');
      expect(stg3?.impact_type).toBe('propagated_delay');

      // Net delay reflects the calendar shift of final completion (approx 8-10 days due to February length), NOT the sum of all shifts
      expect(impact.projected_net_delay_days).toBeLessThanOrEqual(10);
      expect(impact.projected_net_delay_days).toBeGreaterThanOrEqual(8);
    });

    // Case D: Non-critical path with available slack
    it('Case D: correctly identifies non-critical parallel stage with positive schedule slack', () => {
      // Main critical path: stg-1 (20d) -> stg-2 (25d) -> stg-3 (30d) = 75 total days
      // Parallel path: stg-4-parallel (15d) starting with stg-1, has large slack before project finish
      const stageInstances: CaseStageInstance[] = [
        {
          id: 'inst-1',
          case_id: mockCase.id,
          stage_id: 'stg-1',
          status: 'in_progress',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-21',
          delay_days: 0,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
        {
          id: 'inst-4',
          case_id: mockCase.id,
          stage_id: 'stg-4-parallel',
          status: 'in_progress',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-16', // finishes Jan 16, well before project finish
          delay_days: 0,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      const impact = calculateDownstreamDAGImpact({
        stageInstances,
        stages: [mockStages[0], mockStages[3]],
        dependencies: [],
        currentDateStr: '2026-01-05',
      });

      const parallel = impact.affected_downstream_stages.find((s) => s.stage_id === 'stg-4-parallel');
      expect(parallel).toBeDefined();
      // stg-4-parallel finishes Jan 16, final completion is Jan 21 -> slack is 5 days
      expect(parallel?.slack_days).toBe(5);
      expect(parallel?.is_on_critical_path).toBe(false);
    });

    // Case E: Critical-path delay
    it('Case E: flags stage on the critical path with 0 slack and critical path status', () => {
      const stageInstances: CaseStageInstance[] = [
        {
          id: 'inst-1',
          case_id: mockCase.id,
          stage_id: 'stg-1',
          status: 'in_progress',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-21',
          delay_days: 0,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      const impact = calculateDownstreamDAGImpact({
        stageInstances,
        stages: [mockStages[0]],
        dependencies: [],
        currentDateStr: '2026-01-05',
      });

      const critStage = impact.affected_downstream_stages.find((s) => s.stage_id === 'stg-1');
      expect(critStage?.is_on_critical_path).toBe(true);
      expect(critStage?.slack_days).toBe(0);
    });
  });

  // ==========================================================================
  // 4. ROOT CAUSE VERIFICATION & EVIDENCE TRANSPARENCY
  // ==========================================================================
  describe('4. Root Cause Attribution & Evidence Transparency', () => {
    it('returns "insufficient_evidence" when case is delayed but no milestone logs exist', async () => {
      const delayedInstances: CaseStageInstance[] = [
        {
          id: 'inst-delayed',
          case_id: mockCase.id,
          stage_id: 'stg-1',
          status: 'in_progress',
          expected_start_date: '2025-10-01',
          expected_end_date: '2025-10-31', // Far past expected date
          delay_days: 100,
          created_at: '2025-10-01',
          updated_at: '2025-10-01',
        },
      ];

      const causes = await analyzeCaseRootCauses({
        caseTitle: mockCase.title,
        stageInstances: [],
        stages: [mockStages[0]],
        dependencies: [],
        documents: [],
        parcels: [],
        auditLogs: [],
        isCaseDelayed: true,
      });

      expect(causes.length).toBe(1);
      expect(causes[0].cause).toBe('insufficient_evidence');
      expect(causes[0].classification).toBe('data_quality_limitation');
      expect(causes[0].evidence).toContain('no stage blockages, unverified documents, or cadastral disputes');
    });

    it('identifies external contextual factor when severe fresh weather telemetry is present', async () => {
      const obs: ExternalObservation = {
        id: 'obs-weather-severe',
        entity_type: 'case',
        entity_id: mockCase.id,
        observation_type: 'weather_observation',
        provider: 'open_meteo',
        observed_at: new Date().toISOString(),
        retrieved_at: new Date().toISOString(),
        freshness_state: 'fresh',
        quality_score: 95,
        confidence_score: 0.95,
        provenance_id: 'prov-1',
        created_at: new Date().toISOString(),
        normalized_values: {
          weather_condition: 'Heavy Thunderstorm',
          precipitation_mm: 75,
          weather_code: 95,
        },
      };

      const causes = await analyzeCaseRootCauses({
        caseTitle: mockCase.title,
        stageInstances: [],
        stages: mockStages,
        dependencies: [],
        externalObservation: obs,
      });

      const weatherCause = causes.find((c) => c.category === 'external_factors');
      expect(weatherCause).toBeDefined();
      expect(weatherCause?.classification).toBe('external_contextual_factor');
      expect(weatherCause?.cause).toContain('Heavy Thunderstorm');
      expect(weatherCause?.evidence).toContain('Precipitation: 75mm');
    });
  });

  // ==========================================================================
  // 5. WHAT-IF SCENARIO SIMULATION ISOLATION
  // ==========================================================================
  describe('5. What-If Scenario Simulation Non-Destructive Isolation', () => {
    it('runs simulation repeatedly without mutating original case or stage dates', () => {
      const initialStageInstances: CaseStageInstance[] = [
        {
          id: 'inst-orig-1',
          case_id: mockCase.id,
          stage_id: 'stg-1',
          status: 'completed',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-20',
          actual_start_date: '2026-01-01',
          actual_end_date: '2026-01-30',
          delay_days: 10,
          created_at: '2026-01-01',
          updated_at: '2026-01-30',
        },
        {
          id: 'inst-orig-2',
          case_id: mockCase.id,
          stage_id: 'stg-2',
          status: 'in_progress',
          expected_start_date: '2026-01-21',
          expected_end_date: '2026-02-15',
          delay_days: 14,
          created_at: '2026-01-01',
          updated_at: '2026-01-30',
        },
      ];

      // Deep copy snapshots for comparison
      const snapshotBefore = JSON.stringify(initialStageInstances);

      // Run simulation 1
      const sim1 = runWhatIfScenarioSimulation({
        caseItem: mockCase,
        stageInstances: initialStageInstances,
        stages: mockStages.slice(0, 2),
        dependencies: [
          { id: 'dep-1', workflow_id: 'wf-harden-001', stage_id: 'stg-2', depends_on_stage_id: 'stg-1', dependency_type: 'finish_to_start', lag_days: 0 },
        ],
        scenarioName: 'Fast-Track Intervention',
        currentDateStr: '2026-01-31',
        proposedActions: [{ action_type: 'compress_stage_duration', target_stage_id: 'stg-2', duration_delta_days: 10, description: 'Compress survey' }],
      });

      // Run simulation 2
      const sim2 = runWhatIfScenarioSimulation({
        caseItem: mockCase,
        stageInstances: initialStageInstances,
        stages: mockStages.slice(0, 2),
        dependencies: [
          { id: 'dep-1', workflow_id: 'wf-harden-001', stage_id: 'stg-2', depends_on_stage_id: 'stg-1', dependency_type: 'finish_to_start', lag_days: 0 },
        ],
        scenarioName: 'Hearing Acceleration',
        currentDateStr: '2026-01-31',
        proposedActions: [{ action_type: 'fast_track_hearing', duration_delta_days: 7, description: 'Fast track hearing' }],
      });

      // Assert that original instances were NEVER modified
      expect(JSON.stringify(initialStageInstances)).toBe(snapshotBefore);

      // Both simulations produced hypothetical savings
      expect(sim1.delay_recovered_days).toBeGreaterThan(0);
      expect(sim1.simulation_result.assumptions_applied).toBeDefined();
      expect(sim2.delay_recovered_days).toBeGreaterThan(0);
      expect(sim2.simulation_result.assumptions_applied).toBeDefined();
    });
  });
});
