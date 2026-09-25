import {
  CaseStageInstance,
  WorkflowStage,
  StageDependency,
  ScenarioSimulation,
  AcquisitionCase,
} from '../../shared/types';
import { calculateDaysBetween, addDaysToDate } from './deviationCalculator';
import { calculateDownstreamDAGImpact } from './impactAnalyzer';

export interface ProposedIntervention {
  action_type:
    | 'compress_stage_duration'
    | 'fast_track_hearing'
    | 'waive_dependency_lag'
    | 'resolve_active_bottleneck'
    | 'resolve_document_backlog'
    | 'resolve_data_discrepancy'
    | 'disburse_advance_compensation';
  target_stage_id?: string;
  duration_delta_days: number; // e.g. -10 days or 10 days recovery
  description: string;
}

export function runWhatIfScenarioSimulation(params: {
  caseItem: AcquisitionCase;
  stageInstances: CaseStageInstance[];
  stages: WorkflowStage[];
  dependencies: StageDependency[];
  scenarioName: string;
  scenarioDescription?: string;
  proposedActions: ProposedIntervention[];
  currentDateStr?: string;
}): ScenarioSimulation {
  const currentDate = params.currentDateStr || new Date().toISOString().split('T')[0];

  // 1. Calculate Baseline State
  const baselineImpact = calculateDownstreamDAGImpact({
    stageInstances: params.stageInstances,
    stages: params.stages,
    dependencies: params.dependencies,
    currentDateStr: currentDate,
  });

  const baselineCompletion = baselineImpact.projected_completion_date;

  // 2. Clone state in-memory (ZERO mutation of production instances or stages)
  const clonedInstances: CaseStageInstance[] = params.stageInstances.map((inst) => ({
    ...inst,
    actual_end_date: inst.actual_end_date,
    actual_start_date: inst.actual_start_date,
    expected_start_date: inst.expected_start_date,
    expected_end_date: inst.expected_end_date,
    status: inst.status,
    delay_days: inst.delay_days,
  }));

  const clonedStages: WorkflowStage[] = params.stages.map((st) => ({
    ...st,
    completion_criteria: { ...st.completion_criteria },
  }));

  const clonedDeps: StageDependency[] = params.dependencies.map((d) => ({ ...d }));

  // Stage lookup
  const stageMap = new Map<string, WorkflowStage>();
  clonedStages.forEach((s) => stageMap.set(s.id, s));

  // 3. Apply interventions strictly to cloned in-memory state
  const appliedChangesNotes: string[] = [];
  const assumptionsApplied: string[] = [];
  const evidenceUsed: string[] = [
    `Baseline projected completion: ${baselineCompletion}`,
    `Active critical path milestones: ${baselineImpact.critical_path_stages_count ?? 1}`,
  ];

  for (const action of params.proposedActions) {
    const targetInst = action.target_stage_id
      ? clonedInstances.find(
          (i) => i.stage_id === action.target_stage_id || i.id === action.target_stage_id
        )
      : clonedInstances.find((i) => i.status === 'in_progress' || i.status === 'blocked');

    const targetStage = action.target_stage_id
      ? stageMap.get(action.target_stage_id) || (targetInst ? stageMap.get(targetInst.stage_id) : undefined)
      : targetInst
      ? stageMap.get(targetInst.stage_id)
      : undefined;

    const stageTitle = targetStage?.title || targetInst?.stage?.title || 'Target Milestone';
    const rawActionType = action.action_type || (action as any).type;
    const rawDelta = action.duration_delta_days ?? (action as any).compression_days;
    const reductionDays = rawDelta !== undefined ? Math.abs(rawDelta) : 7;

    switch (rawActionType) {
      case 'compress_stage_duration':
      case 'fast_track_hearing': {
        if (targetStage) {
          const curDuration = targetStage.default_duration_days || 20;
          targetStage.default_duration_days = Math.max(1, curDuration - reductionDays);
        }
        if (targetInst) {
          const currentDuration = calculateDaysBetween(targetInst.expected_start_date, targetInst.expected_end_date);
          const newDuration = Math.max(1, currentDuration - reductionDays);
          targetInst.expected_end_date = addDaysToDate(targetInst.expected_start_date, newDuration);
        }
        appliedChangesNotes.push(`Accelerated "${stageTitle}" milestone by ${reductionDays} days.`);
        assumptionsApplied.push(`Assumes additional administrative/hearing personnel deployed to execute "${stageTitle}" within compressed duration.`);
        break;
      }

      case 'resolve_active_bottleneck': {
        if (targetInst) {
          if (targetInst.status === 'blocked') {
            targetInst.status = 'in_progress';
          }
          if (currentDate >= targetInst.expected_end_date) {
            targetInst.actual_end_date = currentDate;
            targetInst.status = 'completed';
          }
        }
        appliedChangesNotes.push(`Resolved active blockage on "${stageTitle}" as of simulation date.`);
        assumptionsApplied.push(`Assumes inter-agency statutory clearance granted immediately for "${stageTitle}".`);
        break;
      }

      case 'resolve_document_backlog': {
        // Accelerates the target or active stage by clearing validation delays
        if (targetInst) {
          const curEnd = targetInst.expected_end_date;
          targetInst.expected_end_date = addDaysToDate(curEnd, -Math.min(7, reductionDays));
        }
        appliedChangesNotes.push(`Cleared statutory document verification backlog for "${stageTitle}".`);
        assumptionsApplied.push('Assumes all pending legal notices and gazette dates signed off by revenue officer.');
        break;
      }

      case 'resolve_data_discrepancy': {
        // Eliminates field boundary discrepancy lag
        clonedDeps.forEach((d) => {
          if (action.target_stage_id && (d.stage_id === action.target_stage_id || d.depends_on_stage_id === action.target_stage_id)) {
            d.lag_days = 0;
          }
        });
        appliedChangesNotes.push(`Reconciled cross-source discrepancies affecting "${stageTitle}".`);
        assumptionsApplied.push('Assumes joint field demarcation completed and GIS boundary reconciled with state land records.');
        break;
      }

      case 'waive_dependency_lag': {
        clonedDeps.forEach((d) => {
          if (!action.target_stage_id || d.stage_id === action.target_stage_id || d.depends_on_stage_id === action.target_stage_id) {
            d.lag_days = 0;
          }
        });
        appliedChangesNotes.push(`Eliminated inter-stage statutory lag for "${stageTitle}".`);
        assumptionsApplied.push('Assumes executive waiver granted for administrative lag between statutory notices.');
        break;
      }

      case 'disburse_advance_compensation': {
        if (targetInst) {
          const curEnd = targetInst.expected_end_date;
          targetInst.expected_end_date = addDaysToDate(curEnd, -Math.min(14, reductionDays));
        }
        appliedChangesNotes.push(`Initiated court compensation deposit under Section 64 for "${stageTitle}".`);
        assumptionsApplied.push('Assumes compensation funds deposited in tribunal authority escrow, permitting possession takeover.');
        break;
      }
    }
  }

  // 4. Recalculate DAG propagation with interventions applied
  const simulatedImpact = calculateDownstreamDAGImpact({
    stageInstances: clonedInstances,
    stages: clonedStages,
    dependencies: clonedDeps,
    currentDateStr: currentDate,
  });

  const simulatedCompletion = simulatedImpact.projected_completion_date;

  // 5. Compare baseline vs simulated outcome
  const baselineDaysFromNow = calculateDaysBetween(currentDate, baselineCompletion);
  const simulatedDaysFromNow = calculateDaysBetween(currentDate, simulatedCompletion);
  const daysSaved = Math.max(0, baselineDaysFromNow - simulatedDaysFromNow);

  // Measure stage-by-stage differences
  const affectedStagesComparison = simulatedImpact.affected_downstream_stages.map((simStage) => {
    const baseStage = baselineImpact.affected_downstream_stages.find((b) => b.stage_id === simStage.stage_id);
    const stageSaved = baseStage
      ? Math.max(0, calculateDaysBetween(simStage.projected_end, baseStage.projected_end))
      : 0;

    return {
      stage_id: simStage.stage_id,
      stage_title: simStage.stage_title,
      original_end: baseStage?.projected_end || simStage.original_expected_end,
      simulated_end: simStage.projected_end,
      days_saved: stageSaved,
      is_on_critical_path: simStage.is_on_critical_path,
    };
  });

  // Calculate risk score delta
  const riskScoreDelta = Math.min(45, Math.round(daysSaved * 1.5));

  const simulationResult = {
    affected_stages: affectedStagesComparison,
    net_timeline_change_days: daysSaved,
    risk_score_delta: riskScoreDelta,
    feasibility_notes: appliedChangesNotes.join(' ') || 'Standard administrative intervention scenario.',
    assumptions_applied: assumptionsApplied,
    evidence_used: evidenceUsed,
  };

  return {
    case_id: params.caseItem.id,
    name: params.scenarioName,
    description: params.scenarioDescription,
    is_hypothetical: true,
    proposed_actions: params.proposedActions,
    original_projected_date: baselineCompletion,
    simulated_projected_date: simulatedCompletion,
    delay_recovered_days: daysSaved,
    simulation_result: simulationResult,
    created_at: new Date().toISOString(),
  };
}
