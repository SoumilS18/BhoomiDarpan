import { describe, expect, it } from 'bun:test';
import { calculatePredictiveDelay } from '../server/services/predictiveDelayEngine';
import { calculateDeterministicRiskAssessment } from '../server/services/riskAssessment';
import { analyzeCaseRootCauses } from '../server/services/rootCauseAnalyzer';
import { calculateDownstreamDAGImpact } from '../server/services/impactAnalyzer';
import { generateEvidenceBasedRecommendations } from '../server/services/recommendationEngine';
import { runWhatIfScenarioSimulation } from '../server/services/scenarioSimulator';
import { detectCaseBottlenecks } from '../server/services/bottleneckDetector';
import {
  getPredictiveDelayPolicySync,
  getRecommendationPolicySync,
  getWeatherRiskPolicySync,
  updatePolicy,
  resetPoliciesToDefaults,
} from '../server/services/policyEngine';
import {
  AcquisitionCase,
  CaseStageInstance,
  WorkflowStage,
  StageDependency,
  CaseDocument,
  Parcel,
  ExternalObservation,
  DataDiscrepancy,
} from '../shared/types';

describe('Day 3: Predictive Decision Intelligence & Explainability Engine', () => {
  const mockCase: AcquisitionCase = {
    id: '11111111-1111-4111-8111-111111111111',
    project_id: '22222222-2222-4222-8222-222222222222',
    case_number: 'LA-2026-CORRIDOR-009',
    title: 'Interstate Freight Corridor Acquisition Unit 9',
    state: 'Madhya Pradesh',
    district: 'Indore',
    village: 'Rau',
    workflow_id: '33333333-3333-4333-8333-333333333333',
    status: 'in_progress',
    priority: 'high',
    start_date: '2026-01-01',
    expected_completion_date: '2026-04-30',
    total_area_hectares: 85.4,
    estimated_compensation: 32000000,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const mockStages: WorkflowStage[] = [
    {
      id: 'stg-1',
      workflow_id: '33333333-3333-4333-8333-333333333333',
      stage_number: 1,
      code: 'SEC_4_SIA',
      title: 'Social Impact Assessment (Section 4)',
      default_duration_days: 20,
      is_mandatory: true,
      required_documents: ['sia_report'],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: '2026-01-01',
    },
    {
      id: 'stg-2',
      workflow_id: '33333333-3333-4333-8333-333333333333',
      stage_number: 2,
      code: 'SEC_11_PUB',
      title: 'Preliminary Notification (Section 11)',
      default_duration_days: 25,
      is_mandatory: true,
      required_documents: ['gazette_notification'],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: '2026-01-01',
    },
    {
      id: 'stg-3',
      workflow_id: '33333333-3333-4333-8333-333333333333',
      stage_number: 3,
      code: 'SEC_15_OBJ',
      title: 'Hearing of Objections (Section 15)',
      default_duration_days: 30,
      is_mandatory: true,
      required_documents: ['hearing_minutes'],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: '2026-01-01',
    },
    {
      id: 'stg-4',
      workflow_id: '33333333-3333-4333-8333-333333333333',
      stage_number: 4,
      code: 'SEC_19_DECL',
      title: 'Declaration of Acquisition (Section 19)',
      default_duration_days: 20,
      is_mandatory: true,
      required_documents: ['section_19_declaration'],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: '2026-01-01',
    },
  ];

  const mockDependencies: StageDependency[] = [
    {
      id: 'dep-1',
      stage_id: 'stg-2',
      depends_on_stage_id: 'stg-1',
      dependency_type: 'finish_to_start',
      lag_days: 0,
    },
    {
      id: 'dep-2',
      stage_id: 'stg-3',
      depends_on_stage_id: 'stg-2',
      dependency_type: 'finish_to_start',
      lag_days: 2,
    },
    {
      id: 'dep-3',
      stage_id: 'stg-4',
      depends_on_stage_id: 'stg-3',
      dependency_type: 'finish_to_start',
      lag_days: 0,
    },
  ];

  describe('1. Policy-Driven Configuration & Defaults', () => {
    it('retrieves predictive delay and recommendation policies via policyEngine', () => {
      const predPolicy = getPredictiveDelayPolicySync();
      expect(predPolicy).toBeDefined();
      expect(predPolicy.historical_velocity_weight).toBe(0.40);
      expect(predPolicy.overdue_acceleration_factor).toBe(1.2);
      expect(predPolicy.weather_delay_factor_days).toBe(5);

      const recPolicy = getRecommendationPolicySync();
      expect(recPolicy).toBeDefined();
      expect(recPolicy.critical_urgency_delay_threshold).toBe(14);
      expect(recPolicy.auto_suggest_tribunal_reference).toBe(true);
      expect(recPolicy.max_active_recommendations).toBe(8);
    });
  });

  describe('2. Empirical Predictive Delay Forecasting', () => {
    it('computes empirical velocity from completed milestones and projects completion', () => {
      // Stage 1 completed in 30 days instead of scheduled 20 days (Velocity: 1.5x)
      const stageInstances: CaseStageInstance[] = [
        {
          id: 'inst-1',
          case_id: mockCase.id,
          stage_id: 'stg-1',
          status: 'completed',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-20',
          actual_start_date: '2026-01-01',
          actual_end_date: '2026-01-30', // took 30 days (+10 days slip)
          delay_days: 10,
          stage: mockStages[0],
          created_at: '2026-01-01',
          updated_at: '2026-01-30',
        },
        {
          id: 'inst-2',
          case_id: mockCase.id,
          stage_id: 'stg-2',
          status: 'in_progress',
          expected_start_date: '2026-01-31',
          expected_end_date: '2026-02-25',
          actual_start_date: '2026-01-31',
          delay_days: 5,
          stage: mockStages[1],
          created_at: '2026-01-01',
          updated_at: '2026-02-28',
        },
        {
          id: 'inst-3',
          case_id: mockCase.id,
          stage_id: 'stg-3',
          status: 'not_started',
          expected_start_date: '2026-02-27',
          expected_end_date: '2026-03-29',
          delay_days: 0,
          stage: mockStages[2],
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
        {
          id: 'inst-4',
          case_id: mockCase.id,
          stage_id: 'stg-4',
          status: 'not_started',
          expected_start_date: '2026-03-30',
          expected_end_date: '2026-04-19',
          delay_days: 0,
          stage: mockStages[3],
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      const { estimate, evidenceLedger } = calculatePredictiveDelay({
        caseItem: mockCase,
        stageInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        currentDateStr: '2026-03-02', // Stage 2 is now overdue
      });

      expect(estimate.historical_velocity_ratio).toBeGreaterThan(1.0);
      expect(estimate.methodology).toBe('historical_velocity_and_critical_path_dag');
      expect(estimate.expected_additional_delay_days).toBeGreaterThan(0);
      expect(estimate.max_projected_delay_days).toBeGreaterThanOrEqual(estimate.min_projected_delay_days);
      expect(estimate.projected_completion_date).toBeDefined();
      expect(estimate.major_contributing_factors.length).toBeGreaterThan(0);

      // Verify evidence classification taxonomy
      const classifications = evidenceLedger.map((e) => e.classification);
      expect(classifications).toContain('observed_fact');
      expect(classifications).toContain('calculated_metric');
      expect(classifications).toContain('predictive_estimate');
    });

    it('honestly reports limitations and defaults to statutory baseline when 0 milestones are completed', () => {
      const earlyStageInstances: CaseStageInstance[] = [
        {
          id: 'inst-1',
          case_id: mockCase.id,
          stage_id: 'stg-1',
          status: 'in_progress',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-20',
          actual_start_date: '2026-01-01',
          delay_days: 0,
          stage: mockStages[0],
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      const { estimate } = calculatePredictiveDelay({
        caseItem: mockCase,
        stageInstances: earlyStageInstances,
        stages: mockStages.slice(0, 1),
        dependencies: [],
        currentDateStr: '2026-01-10',
      });

      expect(estimate.historical_velocity_ratio).toBe(1.0);
      expect(estimate.methodology).toBe('statutory_baseline_only');
      expect(estimate.limitations.length).toBeGreaterThan(0);
      expect(estimate.limitations[0]).toContain('Zero completed milestones');
    });

    it('excludes stale external meteorological observations from delay projection per policy', () => {
      const staleWeatherObs: ExternalObservation = {
        id: 'obs-stale-1',
        provider: 'open_meteo',
        observation_type: 'weather',
        entity_type: 'case',
        entity_id: mockCase.id,
        observed_at: '2026-01-01T00:00:00Z',
        retrieved_at: '2026-01-01T00:05:00Z',
        freshness_state: 'stale',
        confidence_score: 0.90,
        quality_score: 95,
        normalized_values: { precipitation_mm: 75, weather_code: 65, weather_condition: 'Heavy rain' },
        metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      };

      const { estimate, evidenceLedger } = calculatePredictiveDelay({
        caseItem: mockCase,
        stageInstances: [],
        stages: mockStages,
        dependencies: mockDependencies,
        externalObservation: staleWeatherObs,
        currentDateStr: '2026-01-02',
      });

      // Stale weather must NOT contribute delay days
      expect(estimate.limitations.some((lim) => lim.includes('stale'))).toBe(true);
      const staleEvidence = evidenceLedger.find((e) => e.is_stale_or_excluded === true);
      expect(staleEvidence).toBeDefined();
      expect(staleEvidence?.statement).toContain('stale');
    });
  });

  describe('3. Root Cause Attribution with 5-Level Classification', () => {
    it('distinguishes immediate cause, upstream cause, and contributing factors across DAG', async () => {
      // Stage 1 was late (upstream cause) -> Stage 2 is blocked -> Stage 2 has unverified docs (contributing factor)
      const stageInstances: CaseStageInstance[] = [
        {
          id: 'inst-1',
          case_id: mockCase.id,
          stage_id: 'stg-1',
          status: 'in_progress', // not completed
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-20',
          actual_start_date: '2026-01-01',
          delay_days: 15,
          stage: mockStages[0],
          created_at: '2026-01-01',
          updated_at: '2026-02-05',
        },
        {
          id: 'inst-2',
          case_id: mockCase.id,
          stage_id: 'stg-2',
          status: 'blocked',
          expected_start_date: '2026-01-21',
          expected_end_date: '2026-02-15',
          notes: 'Awaiting Section 4 SIA notification sign-off',
          delay_days: 10,
          stage: mockStages[1],
          created_at: '2026-01-01',
          updated_at: '2026-02-05',
        },
      ];

      const mockDocs: CaseDocument[] = [
        {
          id: 'doc-1',
          case_id: mockCase.id,
          stage_instance_id: 'inst-2',
          title: 'Gazette Publication Notification',
          file_name: 'gazette.pdf',
          file_url: 'https://storage/gazette.pdf',
          document_type: 'section_11_preliminary',
          status: 'validation_required',
          created_at: '2026-01-01',
          uploaded_at: '2026-01-01',
        },
      ];

      const mockParcels: Parcel[] = [
        {
          id: 'par-1',
          case_id: mockCase.id,
          survey_number: '304/2B',
          area_acres: 4.2,
          land_type: 'agricultural',
          compensation_amount: 1200000,
          acquisition_status: 'disputed',
          landowner_names: ['Tribal Farmer Cooperative'],
          is_verified: false,
          created_at: '2026-01-01',
        },
      ];

      const causes = await analyzeCaseRootCauses({
        caseTitle: mockCase.title,
        stageInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        documents: mockDocs,
        parcels: mockParcels,
        currentDateStr: '2026-02-10',
        isCaseDelayed: true,
      });

      expect(causes.length).toBeGreaterThanOrEqual(3);

      const classifications = causes.map((c) => c.classification);
      expect(classifications).toContain('upstream_cause');
      expect(classifications).toContain('contributing_factor');

      // Verify that disputed parcel is identified as contributing legal factor
      const disputeCause = causes.find((c) => c.category === 'dispute_litigation');
      expect(disputeCause).toBeDefined();
      expect(disputeCause?.classification).toBe('contributing_factor');
      expect(disputeCause?.evidence).toContain('304/2B');
    });

    it('returns "insufficient_evidence" when case is delayed but no milestone evidence is logged', async () => {
      const emptyCauses = await analyzeCaseRootCauses({
        caseTitle: mockCase.title,
        stageInstances: [],
        stages: mockStages,
        dependencies: mockDependencies,
        documents: [],
        parcels: [],
        currentDateStr: '2026-05-01', // well past expected completion
        isCaseDelayed: true,
      });

      expect(emptyCauses.length).toBe(1);
      expect(emptyCauses[0].cause).toBe('insufficient_evidence');
      expect(emptyCauses[0].classification).toBe('data_quality_limitation');
      expect(emptyCauses[0].evidence).toContain('no stage blockages');
    });
  });

  describe('4. Downstream Schedule DAG Impact & Critical Path Analysis', () => {
    it('distinguishes direct delay from propagated delay and computes schedule slack', () => {
      // Stage 1 delayed by 10 days
      const stageInstances: CaseStageInstance[] = [
        {
          id: 'inst-1',
          case_id: mockCase.id,
          stage_id: 'stg-1',
          status: 'completed',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-20',
          actual_start_date: '2026-01-01',
          actual_end_date: '2026-01-30', // +10 days direct delay
          delay_days: 10,
          stage: mockStages[0],
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
          actual_start_date: '2026-01-31', // start shifted by 10 days
          delay_days: 0,
          stage: mockStages[1],
          created_at: '2026-01-01',
          updated_at: '2026-01-31',
        },
      ];

      const impact = calculateDownstreamDAGImpact({
        stageInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        currentDateStr: '2026-02-01',
      });

      expect(impact.projected_net_delay_days).toBeGreaterThan(0);
      expect(impact.critical_path_stages_count).toBeGreaterThan(0);

      // Verify direct vs propagated delay on stages
      const stg1 = impact.affected_downstream_stages.find((s) => s.stage_id === 'stg-1');
      const stg2 = impact.affected_downstream_stages.find((s) => s.stage_id === 'stg-2');

      expect(stg1?.impact_type).toBe('direct_delay');
      expect(stg2?.impact_type).toBe('propagated_delay');
      expect(stg2?.delay_shift_days).toBe(9);
    });
  });

  describe('5. Advisory Recommendations & Human Governance', () => {
    it('generates prioritized recommendations with valid UUIDs, policies, and expected benefits', () => {
      const bottlenecks = detectCaseBottlenecks({
        caseId: mockCase.id,
        stageInstances: [
          {
            id: 'inst-2',
            case_id: mockCase.id,
            stage_id: 'stg-2',
            status: 'blocked',
            expected_start_date: '2026-01-21',
            expected_end_date: '2026-02-15',
            notes: 'Awaiting environmental clearance',
            delay_days: 14,
            stage: mockStages[1],
            created_at: '2026-01-01',
            updated_at: '2026-02-01',
          },
        ],
        stages: mockStages,
        dependencies: mockDependencies,
      });

      const mockParcels: Parcel[] = [
        {
          id: 'par-1',
          case_id: mockCase.id,
          survey_number: '101/A',
          area_acres: 3,
          land_type: 'agricultural',
          compensation_amount: 500000,
          acquisition_status: 'disputed',
          landowner_names: ['Disputed Estate'],
          is_verified: false,
          created_at: '2026-01-01',
        },
      ];

      const recs = generateEvidenceBasedRecommendations({
        caseId: mockCase.id,
        bottlenecks,
        rootCauses: [],
        stageInstances: [],
        stages: mockStages,
        parcels: mockParcels,
      });

      expect(recs.length).toBeGreaterThan(0);
      recs.forEach((rec) => {
        // Must have valid UUID format
        expect(rec.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        expect(rec.status).toBe('proposed');
        expect(rec.is_implemented).toBe(false);
        expect(rec.expected_benefit).toBeDefined();
        expect(rec.relevant_policy).toBeDefined();
        expect(rec.triggering_factors && rec.triggering_factors.length > 0).toBe(true);
      });

      // Tribunal reference recommendation generated for disputed parcels
      const tribunalRec = recs.find((r) => r.action_type === 'initiate_tribunal_reference');
      expect(tribunalRec).toBeDefined();
      expect(tribunalRec?.urgency).toBe('critical');
    });
  });

  describe('6. What-If Scenario Simulation Sandbox (In-Memory Isolation)', () => {
    it('supports 6 intervention types and computes timeline recovery without mutating production records', () => {
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
          stage: mockStages[0],
          created_at: '2026-01-01',
          updated_at: '2026-01-30',
        },
        {
          id: 'inst-2',
          case_id: mockCase.id,
          stage_id: 'stg-2',
          status: 'in_progress',
          expected_start_date: '2026-01-31',
          expected_end_date: '2026-02-25',
          actual_start_date: '2026-01-31',
          delay_days: 15,
          stage: mockStages[1],
          created_at: '2026-01-01',
          updated_at: '2026-03-01',
        },
        {
          id: 'inst-3',
          case_id: mockCase.id,
          stage_id: 'stg-3',
          status: 'not_started',
          expected_start_date: '2026-02-27',
          expected_end_date: '2026-03-29',
          delay_days: 0,
          stage: mockStages[2],
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      // Deep snapshot to verify absolute zero mutation
      const originalInstancesJson = JSON.stringify(stageInstances);
      const originalStagesJson = JSON.stringify(mockStages);
      const originalDepsJson = JSON.stringify(mockDependencies);

      const simulation = runWhatIfScenarioSimulation({
        caseItem: mockCase,
        stageInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        scenarioName: 'Combined Fast-Track & Bottleneck Resolution',
        scenarioDescription: 'Testing in-memory DAG recalculation across 3 intervention actions',
        proposedActions: [
          {
            action_type: 'compress_stage_duration',
            target_stage_id: 'stg-2',
            duration_delta_days: 10,
            description: 'Deploy additional revenue inspection personnel',
          },
          {
            action_type: 'resolve_document_backlog',
            target_stage_id: 'stg-2',
            duration_delta_days: 5,
            description: 'Clear gazette notice verification backlog',
          },
          {
            action_type: 'waive_dependency_lag',
            target_stage_id: 'stg-3',
            duration_delta_days: 2,
            description: 'Waive inter-stage statutory waiting lag',
          },
        ],
        currentDateStr: '2026-03-01',
      });

      expect(simulation.is_hypothetical).toBe(true);
      expect(simulation.delay_recovered_days).toBeGreaterThan(0);
      expect(simulation.simulated_projected_date).toBeDefined();
      expect(simulation.simulation_result.assumptions_applied?.length).toBeGreaterThan(0);
      expect(simulation.simulation_result.affected_stages.length).toBeGreaterThan(0);

      // Verify ZERO mutation of input objects
      expect(JSON.stringify(stageInstances)).toBe(originalInstancesJson);
      expect(JSON.stringify(mockStages)).toBe(originalStagesJson);
      expect(JSON.stringify(mockDependencies)).toBe(originalDepsJson);
    });
  });

  describe('7. Explainable Risk Assessment & Excluded Evidence', () => {
    it('documents applied policy keys and logs excluded stale weather with 0 penalty', () => {
      const staleWeatherObs: ExternalObservation = {
        id: 'obs-stale-2',
        provider: 'open_meteo',
        observation_type: 'weather',
        entity_type: 'case',
        entity_id: mockCase.id,
        observed_at: '2026-01-01T00:00:00Z',
        retrieved_at: '2026-01-01T00:05:00Z',
        freshness_state: 'stale',
        confidence_score: 0.90,
        quality_score: 95,
        normalized_values: { precipitation_mm: 90, weather_code: 95, weather_condition: 'Thunderstorm' },
        metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      };

      const assessment = calculateDeterministicRiskAssessment({
        caseItem: mockCase,
        stageInstances: [],
        stages: mockStages,
        dependencies: mockDependencies,
        externalObservation: staleWeatherObs,
        currentDateStr: '2026-01-02',
      });

      const details = assessment.factor_breakdown.details;
      const weatherFactor = details.find((d) => d.category === 'external_weather');

      expect(weatherFactor).toBeDefined();
      expect(weatherFactor?.status).toBe('excluded');
      expect(weatherFactor?.impact).toBe(0);
      expect(weatherFactor?.policy_key).toBe('weather_risk_policy');
      expect(weatherFactor?.evidence).toContain('stale');
    });
  });
});
