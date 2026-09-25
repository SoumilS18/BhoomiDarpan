import { describe, expect, it } from 'bun:test';
import { calculateDeterministicRiskAssessment } from '../server/services/riskAssessment';
import { detectCaseBottlenecks } from '../server/services/bottleneckDetector';
import { calculateDownstreamDAGImpact } from '../server/services/impactAnalyzer';
import { generateEvidenceBasedRecommendations } from '../server/services/recommendationEngine';
import { runWhatIfScenarioSimulation } from '../server/services/scenarioSimulator';
import {
  AcquisitionCase,
  CaseStageInstance,
  WorkflowStage,
  StageDependency,
  CaseDocument,
  Parcel,
} from '../shared/types';

describe('Day 3 Decision Intelligence & Predictive Analytics Engine', () => {
  const mockCase: AcquisitionCase = {
    id: 'case-alpha-id',
    project_id: 'proj-1',
    case_number: 'LA-2026-DELHI-001',
    title: 'Delhi-Meerut Expressway Section 4',
    description: 'National highway corridor expansion',
    state: 'Delhi',
    district: 'North East Delhi',
    village: 'Mandoli',
    workflow_id: 'wf-1',
    status: 'in_progress',
    priority: 'high',
    start_date: '2026-01-01',
    expected_completion_date: '2026-03-31',
    total_area_hectares: 120.5,
    estimated_compensation: 45000000,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const mockStages: WorkflowStage[] = [
    {
      id: 'stage-1',
      workflow_id: 'wf-1',
      stage_number: 1,
      code: 'SEC_4_SIA',
      title: 'Section 4 SIA Study',
      description: 'Social Impact Assessment',
      default_duration_days: 20,
      is_mandatory: true,
      required_documents: [],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: '2026-01-01',
    },
    {
      id: 'stage-2',
      workflow_id: 'wf-1',
      stage_number: 2,
      code: 'SEC_11_NOTIF',
      title: 'Section 11 Preliminary Notification',
      description: 'Preliminary Notification Publication',
      default_duration_days: 25,
      is_mandatory: true,
      required_documents: [],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: '2026-01-01',
    },
    {
      id: 'stage-3',
      workflow_id: 'wf-1',
      stage_number: 3,
      code: 'SEC_15_HEARING',
      title: 'Section 15 Hearing of Objections',
      description: 'Hearing of Objections by Collector',
      default_duration_days: 28,
      is_mandatory: true,
      required_documents: [],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: '2026-01-01',
    },
  ];

  const mockStageInstances: CaseStageInstance[] = [
    {
      id: 'inst-1',
      case_id: 'case-alpha-id',
      stage_id: 'stage-1',
      status: 'completed',
      expected_start_date: '2026-01-01',
      expected_end_date: '2026-01-20',
      actual_start_date: '2026-01-01',
      actual_end_date: '2026-01-20',
      delay_days: 0,
      updated_at: '2026-01-20',
      stage: mockStages[0],
    },
    {
      id: 'inst-2',
      case_id: 'case-alpha-id',
      stage_id: 'stage-2',
      status: 'in_progress',
      expected_start_date: '2026-01-21',
      expected_end_date: '2026-02-15',
      actual_start_date: '2026-01-21',
      actual_end_date: undefined,
      delay_days: 14,
      updated_at: '2026-02-15',
      stage: mockStages[1],
    },
    {
      id: 'inst-3',
      case_id: 'case-alpha-id',
      stage_id: 'stage-3',
      status: 'pending',
      expected_start_date: '2026-02-16',
      expected_end_date: '2026-03-15',
      delay_days: 0,
      updated_at: '2026-01-01',
      stage: mockStages[2],
    },
  ];

  const mockDependencies: StageDependency[] = [
    {
      id: 'dep-1',
      workflow_id: 'wf-1',
      stage_id: 'stage-2',
      depends_on_stage_id: 'stage-1',
      dependency_type: 'finish_to_start',
      lag_days: 0,
      created_at: '2026-01-01',
    },
    {
      id: 'dep-2',
      workflow_id: 'wf-1',
      stage_id: 'stage-3',
      depends_on_stage_id: 'stage-2',
      dependency_type: 'finish_to_start',
      lag_days: 2,
      created_at: '2026-01-01',
    },
  ];

  describe('Explainable Multi-Factor Risk Assessment', () => {
    it('calculates low risk score for on-schedule cases without friction', () => {
      const onScheduleInstances: CaseStageInstance[] = [
        {
          ...mockStageInstances[0],
          status: 'completed',
          delay_days: 0,
        },
        {
          ...mockStageInstances[1],
          status: 'completed',
          actual_end_date: '2026-02-15',
          delay_days: 0,
        },
        {
          ...mockStageInstances[2],
          status: 'in_progress',
          expected_end_date: '2026-03-30',
          delay_days: 0,
        },
      ];

      const assessment = calculateDeterministicRiskAssessment({
        caseItem: mockCase,
        stageInstances: onScheduleInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        documents: [],
        parcels: [],
        currentDateStr: '2026-02-20',
      });

      expect(assessment.overall_risk_score).toBeLessThanOrEqual(30);
      expect(assessment.risk_level).toBe('low');
      expect(assessment.factor_breakdown.schedule_delay_score).toBe(0);
    });

    it('derives elevated risk when schedule is significantly delayed', () => {
      const assessment = calculateDeterministicRiskAssessment({
        caseItem: mockCase,
        stageInstances: mockStageInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        documents: [],
        parcels: [],
        currentDateStr: '2026-03-01', // 14 days overdue on stage 2
      });

      expect(assessment.overall_risk_score).toBeGreaterThan(15);
      expect(assessment.observed_facts.length).toBeGreaterThan(0);
      expect(assessment.factor_breakdown.schedule_delay_score).toBeGreaterThan(0);
    });

    it('incorporates unverified document friction and disputed parcels into risk formula', () => {
      const mockDocs: CaseDocument[] = [
        {
          id: 'doc-1',
          case_id: 'case-alpha-id',
          title: 'Gazette Section 11 Notification',
          file_name: 'gazette_sec11.pdf',
          file_path: 'case-alpha-id/gazette_sec11.pdf',
          file_size_bytes: 1024,
          mime_type: 'application/pdf',
          document_type: 'section_11_preliminary',
          status: 'validation_required',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      const mockParcels: Parcel[] = [
        {
          id: 'p-1',
          case_id: 'case-alpha-id',
          survey_number: '101/A',
          area_acres: 5,
          land_type: 'agricultural',
          compensation_amount: 500000,
          acquisition_status: 'disputed',
          landowner_names: ['Ramesh'],
          is_verified: false,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      const assessment = calculateDeterministicRiskAssessment({
        caseItem: mockCase,
        stageInstances: mockStageInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        documents: mockDocs,
        parcels: mockParcels,
        currentDateStr: '2026-03-01',
      });

      expect(assessment.factor_breakdown.missing_documents_score).toBeGreaterThan(0);
      expect(assessment.factor_breakdown.cadastral_dispute_score).toBeGreaterThan(0);
      expect(assessment.overall_risk_score).toBeGreaterThan(20);
    });
  });

  describe('Active Bottleneck Detection', () => {
    it('detects SLA breaches >= 5 days as active bottlenecks with downstream impact', () => {
      const bottlenecks = detectCaseBottlenecks({
        caseId: 'case-alpha-id',
        stageInstances: mockStageInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        currentDateStr: '2026-03-01',
      });

      expect(bottlenecks.length).toBeGreaterThanOrEqual(1);
      const b2 = bottlenecks.find((b) => b.stage_title.includes('Section 11'));
      expect(b2).toBeDefined();
      expect(b2?.deviation_days).toBeGreaterThanOrEqual(10);
      expect(['medium', 'high', 'critical']).toContain(b2?.severity || '');
      expect(b2?.downstream_stages_count).toBe(1);
      expect(b2?.downstream_stage_titles).toContain('Section 15 Hearing of Objections');
    });

    it('returns empty array when all stages are strictly on time', () => {
      const cleanInstances: CaseStageInstance[] = [
        { ...mockStageInstances[0], delay_days: 0 },
        { ...mockStageInstances[1], delay_days: 0, status: 'completed', actual_end_date: '2026-02-15' },
        { ...mockStageInstances[2], delay_days: 0, status: 'in_progress', expected_end_date: '2026-03-30' },
      ];

      const bottlenecks = detectCaseBottlenecks({
        caseId: 'case-alpha-id',
        stageInstances: cleanInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        currentDateStr: '2026-02-20',
      });
      expect(bottlenecks.length).toBe(0);
    });
  });

  describe('Downstream Schedule Impact DAG Analysis', () => {
    it('propagates milestone delay downstream through DAG dependencies', () => {
      const impact = calculateDownstreamDAGImpact({
        stageInstances: mockStageInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        currentDateStr: '2026-03-01',
      });

      expect(impact.projected_net_delay_days).toBeGreaterThan(0);
      expect(impact.affected_downstream_stages.length).toBeGreaterThanOrEqual(1);

      const sec15 = impact.affected_downstream_stages.find(
        (s) => s.stage_id === 'stage-3' || s.stage_title?.includes('Section 15')
      );
      expect(sec15).toBeDefined();
      expect(sec15?.is_on_critical_path).toBe(true);
    });
  });

  describe('Advisory Recommendations Engine', () => {
    it('generates prioritized recommendations without auto-execution', () => {
      const bottlenecks = detectCaseBottlenecks({
        caseId: 'case-alpha-id',
        stageInstances: mockStageInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        currentDateStr: '2026-03-01',
      });

      const mockDocs: CaseDocument[] = [
        {
          id: 'doc-1',
          case_id: 'case-alpha-id',
          title: 'Gazette Section 11 Notification',
          file_name: 'gazette_sec11.pdf',
          file_path: 'case-alpha-id/gazette_sec11.pdf',
          file_size_bytes: 1024,
          mime_type: 'application/pdf',
          document_type: 'section_11_preliminary',
          status: 'validation_required',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      const recommendations = generateEvidenceBasedRecommendations({
        caseId: 'case-alpha-id',
        bottlenecks,
        rootCauses: [],
        stageInstances: mockStageInstances,
        stages: mockStages,
        documents: mockDocs,
        parcels: [],
      });

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].is_implemented).toBe(false);
      expect(recommendations[0].status).toBe('proposed');

      const docRec = recommendations.find((r) => r.action_type === 'validate_statutory_notice');
      expect(docRec).toBeDefined();
      expect(docRec?.urgency).toBe('critical');
    });
  });

  describe('What-If Scenario Simulation (In-Memory Isolation)', () => {
    it('computes timeline recovery safely without mutating original stage dates', () => {
      const originalDates = mockStageInstances.map((s) => ({
        id: s.id,
        expected_end: s.expected_end_date,
        delay_days: s.delay_days,
      }));

      const simulation = runWhatIfScenarioSimulation({
        caseItem: mockCase,
        stageInstances: mockStageInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        scenarioName: 'Accelerate Section 15 Hearing',
        proposedActions: [
          {
            action_type: 'compress_stage_duration',
            target_stage_id: 'stage-3',
            duration_delta_days: 10,
            description: 'Deploy additional hearing panels',
          },
        ],
        currentDateStr: '2026-03-01',
      });

      // Simulation outputs
      expect(simulation.delay_recovered_days).toBe(10);
      expect(simulation.simulation_result.net_timeline_change_days).toBe(10);
      expect(simulation.simulation_result.risk_score_delta).toBeGreaterThanOrEqual(0);
      expect(simulation.simulated_projected_date).not.toBe(simulation.original_projected_date);

      // Verify that original stages memory was completely untouched (zero mutation)
      mockStageInstances.forEach((st, idx) => {
        expect(st.expected_end_date).toBe(originalDates[idx].expected_end);
        expect(st.delay_days).toBe(originalDates[idx].delay_days);
      });
    });
  });
});
