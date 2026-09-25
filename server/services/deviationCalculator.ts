import { CaseStageInstance, CaseCalculatedMetrics, WorkflowStage, StageDependency } from '../../shared/types';

export function calculateDaysBetween(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const diffTime = end.getTime() - start.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

export function addDaysToDate(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

export interface EnrichedStageInstance extends CaseStageInstance {
  is_overdue: boolean;
  overdue_days: number;
  duration_expected_days: number;
  duration_actual_days?: number;
  stage_deviation_days: number;
}

export function calculateStageDeviations(
  stageInstances: CaseStageInstance[],
  currentDateStr: string = new Date().toISOString().split('T')[0]
): EnrichedStageInstance[] {
  return stageInstances.map((inst) => {
    const durationExpected = calculateDaysBetween(inst.expected_start_date, inst.expected_end_date);
    let durationActual: number | undefined;
    let deviationDays = 0;
    let isOverdue = false;
    let overdueDays = 0;

    if (inst.status === 'completed' && inst.actual_end_date) {
      // Completed stage: deviation is actual_end - expected_end
      deviationDays = calculateDaysBetween(inst.expected_end_date, inst.actual_end_date);
      if (inst.actual_start_date) {
        durationActual = calculateDaysBetween(inst.actual_start_date, inst.actual_end_date);
      }
    } else if (inst.status === 'in_progress' || inst.status === 'blocked' || inst.status === 'pending_approval') {
      // Active stage: check if overdue past expected_end_date
      if (currentDateStr > inst.expected_end_date) {
        isOverdue = true;
        overdueDays = calculateDaysBetween(inst.expected_end_date, currentDateStr);
        deviationDays = overdueDays;
      }
      if (inst.actual_start_date) {
        durationActual = calculateDaysBetween(inst.actual_start_date, currentDateStr);
      }
    } else if (inst.status === 'not_started') {
      // Stage hasn't started yet: check if start is overdue
      if (currentDateStr > inst.expected_start_date) {
        isOverdue = true;
        overdueDays = calculateDaysBetween(inst.expected_start_date, currentDateStr);
        deviationDays = overdueDays;
      }
    }

    return {
      ...inst,
      delay_days: deviationDays,
      is_overdue: isOverdue,
      overdue_days: overdueDays,
      duration_expected_days: durationExpected,
      duration_actual_days: durationActual,
      stage_deviation_days: deviationDays,
    };
  });
}

export function calculateCaseMetrics(params: {
  startDate: string;
  expectedCompletionDate: string;
  actualCompletionDate?: string;
  stageInstances: CaseStageInstance[];
  currentDateStr?: string;
}): CaseCalculatedMetrics {
  const currentDate = params.currentDateStr || new Date().toISOString().split('T')[0];
  const enrichedStages = calculateStageDeviations(params.stageInstances, currentDate);

  const totalStages = enrichedStages.length;
  const completedStages = enrichedStages.filter((s) => s.status === 'completed').length;
  const blockedStagesCount = enrichedStages.filter((s) => s.status === 'blocked').length;

  // Find current active stage
  const currentActive = enrichedStages.find(
    (s) => s.status === 'in_progress' || s.status === 'pending_approval' || s.status === 'blocked'
  ) || enrichedStages.find((s) => s.status === 'not_started');

  const currentStageIndex = currentActive
    ? enrichedStages.findIndex((s) => s.id === currentActive.id) + 1
    : totalStages;

  const currentStageTitle = currentActive?.stage?.title || (completedStages === totalStages ? 'Completed' : 'Initiation');

  // Weighted progress by expected duration
  let totalExpectedDays = 0;
  let completedDays = 0;
  let netDelayDays = 0;

  for (const stage of enrichedStages) {
    const expectedDuration = Math.max(1, stage.duration_expected_days || stage.stage?.default_duration_days || 14);
    totalExpectedDays += expectedDuration;

    if (stage.status === 'completed') {
      completedDays += expectedDuration;
    } else if (stage.status === 'in_progress') {
      // Partial progress based on actual days elapsed in this stage
      const elapsed = stage.duration_actual_days || 0;
      completedDays += Math.min(expectedDuration * 0.75, elapsed);
    }

    // Accumulate net delay
    if (stage.delay_days > 0) {
      netDelayDays += stage.delay_days;
    }
  }

  const progressPercentage = totalExpectedDays > 0
    ? Math.min(100, Math.round((completedDays / totalExpectedDays) * 100))
    : (totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0);

  const totalActualDaysElapsed = calculateDaysBetween(
    params.startDate,
    params.actualCompletionDate || currentDate
  );

  const daysOverdue = currentDate > params.expectedCompletionDate && !params.actualCompletionDate
    ? calculateDaysBetween(params.expectedCompletionDate, currentDate)
    : 0;

  const projectedCompletionDate = addDaysToDate(params.expectedCompletionDate, netDelayDays);

  return {
    current_stage_index: currentStageIndex,
    current_stage_title: currentStageTitle,
    total_stages: totalStages,
    completed_stages: completedStages,
    progress_percentage: progressPercentage,
    total_expected_days: totalExpectedDays,
    total_actual_days_elapsed: totalActualDaysElapsed,
    net_delay_days: netDelayDays,
    is_delayed: netDelayDays > 0 || daysOverdue > 0,
    projected_completion_date: projectedCompletionDate,
    days_overdue: daysOverdue,
    blocked_stages_count: blockedStagesCount,
  };
}
