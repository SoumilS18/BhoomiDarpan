import { describe, expect, it } from 'bun:test';
import { calculateDaysBetween, addDaysToDate, calculateStageDeviations, calculateCaseMetrics } from '../server/services/deviationCalculator';
import { WorkflowStage, StageDependency, CaseStageInstance } from '../shared/types';

describe('Configurable Workflow Engine - Multi-Workflow Validation', () => {
  // Workflow 1: Arbitrary 4-Stage Linear Workflow (e.g. State Express Highway)
  const arbitraryWorkflowStages1: WorkflowStage[] = [
    {
      id: 'wf1-s1',
      workflow_id: 'wf-1',
      stage_number: 1,
      code: 'STAGE_ALPHA',
      title: 'Preliminary Feasibility Survey',
      default_duration_days: 20,
      is_mandatory: true,
      required_documents: ['feasibility_doc'],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: new Date().toISOString(),
    },
    {
      id: 'wf1-s2',
      workflow_id: 'wf-1',
      stage_number: 2,
      code: 'STAGE_BETA',
      title: 'Joint Stakeholder Consultation',
      default_duration_days: 35,
      is_mandatory: true,
      required_documents: ['consultation_memo'],
      completion_criteria: {},
      escalation_threshold_days: 7,
      created_at: new Date().toISOString(),
    },
    {
      id: 'wf1-s3',
      workflow_id: 'wf-1',
      stage_number: 3,
      code: 'STAGE_GAMMA',
      title: 'Cadastral DGPS Demarcation',
      default_duration_days: 25,
      is_mandatory: true,
      required_documents: ['dgps_map'],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: new Date().toISOString(),
    },
    {
      id: 'wf1-s4',
      workflow_id: 'wf-1',
      stage_number: 4,
      code: 'STAGE_DELTA',
      title: 'Final Compensation Award',
      default_duration_days: 15,
      is_mandatory: true,
      required_documents: ['award_receipt'],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: new Date().toISOString(),
    },
  ];

  // Dependencies for Workflow 1 (Linear Finish-to-Start)
  const dependencies1: StageDependency[] = [
    { id: 'd1', stage_id: 'wf1-s2', depends_on_stage_id: 'wf1-s1', dependency_type: 'finish_to_start', lag_days: 0 },
    { id: 'd2', stage_id: 'wf1-s3', depends_on_stage_id: 'wf1-s2', dependency_type: 'finish_to_start', lag_days: 0 },
    { id: 'd3', stage_id: 'wf1-s4', depends_on_stage_id: 'wf1-s3', dependency_type: 'finish_to_start', lag_days: 0 },
  ];

  // Workflow 2: Completely different 3-Stage Fast-Track Workflow (e.g. Direct Private Purchase)
  const arbitraryWorkflowStages2: WorkflowStage[] = [
    {
      id: 'wf2-s1',
      workflow_id: 'wf-2',
      stage_number: 1,
      code: 'STAGE_CONSENT',
      title: 'Voluntary Landowner Consent',
      default_duration_days: 10,
      is_mandatory: true,
      required_documents: ['consent_forms'],
      completion_criteria: {},
      escalation_threshold_days: 3,
      created_at: new Date().toISOString(),
    },
    {
      id: 'wf2-s2',
      workflow_id: 'wf-2',
      stage_number: 2,
      code: 'STAGE_DEED',
      title: 'Sale Deed Execution & Registry',
      default_duration_days: 14,
      is_mandatory: true,
      required_documents: ['registered_deed'],
      completion_criteria: {},
      escalation_threshold_days: 4,
      created_at: new Date().toISOString(),
    },
    {
      id: 'wf2-s3',
      workflow_id: 'wf-2',
      stage_number: 3,
      code: 'STAGE_DISBURSE',
      title: 'Direct Account Transfer',
      default_duration_days: 7,
      is_mandatory: true,
      required_documents: ['bank_ack'],
      completion_criteria: {},
      escalation_threshold_days: 2,
      created_at: new Date().toISOString(),
    },
  ];

  const dependencies2: StageDependency[] = [
    { id: 'd2-1', stage_id: 'wf2-s2', depends_on_stage_id: 'wf2-s1', dependency_type: 'finish_to_start', lag_days: 2 }, // 2 day lag
    { id: 'd2-2', stage_id: 'wf2-s3', depends_on_stage_id: 'wf2-s2', dependency_type: 'finish_to_start', lag_days: 0 },
  ];

  it('calculates dynamic timeline dates for Workflow 1 strictly from stage durations', () => {
    const caseStartDate = '2026-01-01';
    let runningDate = caseStartDate;
    const stageDateMap = new Map<string, { expectedStart: string; expectedEnd: string }>();

    for (const stage of arbitraryWorkflowStages1) {
      const expectedStart = runningDate;
      const expectedEnd = addDaysToDate(expectedStart, stage.default_duration_days);
      stageDateMap.set(stage.id, { expectedStart, expectedEnd });
      runningDate = expectedEnd;
    }

    // Stage 1: 2026-01-01 -> +20 days -> 2026-01-21
    expect(stageDateMap.get('wf1-s1')?.expectedStart).toBe('2026-01-01');
    expect(stageDateMap.get('wf1-s1')?.expectedEnd).toBe('2026-01-21');

    // Stage 2: 2026-01-21 -> +35 days -> 2026-02-25
    expect(stageDateMap.get('wf1-s2')?.expectedStart).toBe('2026-01-21');
    expect(stageDateMap.get('wf1-s2')?.expectedEnd).toBe('2026-02-25');

    // Stage 3: 2026-02-25 -> +25 days -> 2026-03-22
    expect(stageDateMap.get('wf1-s3')?.expectedStart).toBe('2026-02-25');
    expect(stageDateMap.get('wf1-s3')?.expectedEnd).toBe('2026-03-22');

    // Stage 4: 2026-03-22 -> +15 days -> 2026-04-06
    expect(stageDateMap.get('wf1-s4')?.expectedStart).toBe('2026-03-22');
    expect(stageDateMap.get('wf1-s4')?.expectedEnd).toBe('2026-04-06');

    // Total expected project duration = 20 + 35 + 25 + 15 = 95 days
    expect(calculateDaysBetween(caseStartDate, runningDate)).toBe(95);
  });

  it('calculates dynamic timeline dates for Workflow 2 with custom lag days', () => {
    const caseStartDate = '2026-05-01';
    
    // Stage 1: 10 days duration -> 2026-05-01 to 2026-05-11
    const s1End = addDaysToDate('2026-05-01', 10);
    expect(s1End).toBe('2026-05-11');

    // Stage 2: depends on s1 with lag = 2 days -> starts on 2026-05-13
    const s2Start = addDaysToDate(s1End, 2);
    expect(s2Start).toBe('2026-05-13');
    const s2End = addDaysToDate(s2Start, 14);
    expect(s2End).toBe('2026-05-27');

    // Stage 3: starts on 2026-05-27 -> 7 days -> ends 2026-06-03
    const s3End = addDaysToDate(s2End, 7);
    expect(s3End).toBe('2026-06-03');

    // Total duration = 10 + 2 (lag) + 14 + 7 = 33 days
    expect(calculateDaysBetween(caseStartDate, s3End)).toBe(33);
  });

  it('detects and propagates delay on arbitrary workflows', () => {
    // Suppose in Workflow 1, Stage 1 completes 15 days late
    const instances: CaseStageInstance[] = [
      {
        id: 'inst-1',
        case_id: 'case-w1',
        stage_id: 'wf1-s1',
        status: 'completed',
        expected_start_date: '2026-01-01',
        expected_end_date: '2026-01-21',
        actual_start_date: '2026-01-01',
        actual_end_date: '2026-02-05', // 15 days late
        delay_days: 0,
        updated_at: '2026-02-05',
        stage: arbitraryWorkflowStages1[0],
      },
      {
        id: 'inst-2',
        case_id: 'case-w1',
        stage_id: 'wf1-s2',
        status: 'in_progress',
        expected_start_date: '2026-01-21',
        expected_end_date: '2026-02-25',
        actual_start_date: '2026-02-06',
        delay_days: 0,
        updated_at: '2026-02-06',
        stage: arbitraryWorkflowStages1[1],
      },
    ];

    const deviations = calculateStageDeviations(instances, '2026-02-10');
    expect(deviations[0].delay_days).toBe(15);

    const metrics = calculateCaseMetrics({
      startDate: '2026-01-01',
      expectedCompletionDate: '2026-04-06',
      stageInstances: deviations,
      currentDateStr: '2026-02-10',
    });

    // Projected completion date must shift forward by exactly 15 days
    expect(metrics.projected_completion_date).toBe(addDaysToDate('2026-04-06', 15));
    expect(metrics.net_delay_days).toBe(15);
    expect(metrics.is_delayed).toBe(true);
  });
});
