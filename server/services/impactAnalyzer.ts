import {
  CaseStageInstance,
  WorkflowStage,
  StageDependency,
  DownstreamImpactResult,
  StageScheduleProjected,
} from '../../shared/types';
import { addDaysToDate, calculateDaysBetween, calculateStageDeviations } from './deviationCalculator';

export type { StageScheduleProjected };

export function calculateDownstreamDAGImpact(params: {
  stageInstances: CaseStageInstance[];
  stages: WorkflowStage[];
  dependencies: StageDependency[];
  currentDateStr?: string;
}): DownstreamImpactResult {
  const currentDate = params.currentDateStr || new Date().toISOString().split('T')[0];
  const enrichedStages = calculateStageDeviations(params.stageInstances, currentDate);

  // 1. Build map of dependencies: stage_id -> list of prerequisite dependencies
  const prereqsMap = new Map<string, StageDependency[]>();
  params.dependencies.forEach((d) => {
    const list = prereqsMap.get(d.stage_id) || [];
    list.push(d);
    prereqsMap.set(d.stage_id, list);
  });

  // Stage lookup
  const stageMap = new Map<string, WorkflowStage>();
  params.stages.forEach((s) => stageMap.set(s.id, s));

  // Sort stages topologically or by stage_number
  const sortedStages = [...params.stages].sort((a, b) => a.stage_number - b.stage_number);

  // Instance lookup by stage_id
  const instanceMap = new Map<string, (typeof enrichedStages)[0]>();
  enrichedStages.forEach((inst) => instanceMap.set(inst.stage_id, inst));

  // 2. Identify active bottleneck / currently delayed stages
  const delayedInstances = enrichedStages.filter(
    (inst) => (inst.status !== 'completed' && inst.is_overdue) || (inst.status === 'completed' && inst.delay_days > 0)
  );

  const activeAffected = enrichedStages.find(
    (inst) => (inst.status === 'in_progress' || inst.status === 'blocked') && inst.is_overdue
  ) || delayedInstances[delayedInstances.length - 1];

  const currentAffectedTitle = activeAffected?.stage?.title || 'No active delay';

  // 3. Forward DAG propagation to compute projected start and end dates
  const projectedDates = new Map<
    string,
    { start: string; end: string; delayShift: number; isDirect: boolean }
  >();
  let baselineProjectedCompletion = '';
  let finalProjectedCompletion = '';

  for (const stage of sortedStages) {
    const inst = instanceMap.get(stage.id);
    const deps = prereqsMap.get(stage.id) || [];
    const duration = stage.default_duration_days || 14;

    const originalStart = inst?.expected_start_date || currentDate;
    const originalEnd = inst?.expected_end_date || addDaysToDate(originalStart, duration);

    if (originalEnd > baselineProjectedCompletion) {
      baselineProjectedCompletion = originalEnd;
    }

    let projectedStart = originalStart;
    let isDirect = false;

    if (inst && inst.status === 'completed' && inst.actual_end_date) {
      // Completed stage: actual end is fixed
      if (inst.actual_end_date > finalProjectedCompletion) {
        finalProjectedCompletion = inst.actual_end_date;
      }
      projectedDates.set(stage.id, {
        start: inst.actual_start_date || inst.expected_start_date,
        end: inst.actual_end_date,
        delayShift: inst.delay_days,
        isDirect: inst.delay_days > 0,
      });
      continue;
    }

    // Determine projected start based on prerequisites
    if (deps.length > 0) {
      let maxDepEnd = originalStart;
      for (const dep of deps) {
        const depProj = projectedDates.get(dep.depends_on_stage_id);
        if (depProj) {
          const lag = dep.lag_days || 0;
          const depEndWithLag = addDaysToDate(depProj.end, lag);
          if (depEndWithLag > maxDepEnd) {
            maxDepEnd = depEndWithLag;
          }
        }
      }
      projectedStart = maxDepEnd;
    } else if (inst && (inst.status === 'in_progress' || inst.status === 'blocked')) {
      projectedStart = inst.actual_start_date || inst.expected_start_date;
    }

    // Determine projected end
    let projectedEnd = addDaysToDate(projectedStart, duration);

    // If active and overdue beyond projectedEnd, end shifts to at least today + remaining minimum time
    if (inst && (inst.status === 'in_progress' || inst.status === 'blocked')) {
      if (inst.is_overdue) {
        isDirect = true;
      }
      if (currentDate > projectedEnd) {
        projectedEnd = currentDate;
      }
    }

    const delayShift = calculateDaysBetween(originalEnd, projectedEnd);
    projectedDates.set(stage.id, { start: projectedStart, end: projectedEnd, delayShift, isDirect });

    if (projectedEnd > finalProjectedCompletion) {
      finalProjectedCompletion = projectedEnd;
    }
  }

  // 4. Critical path & Float/Slack Analysis
  const downstreamList: StageScheduleProjected[] = [];
  let directDelayDays = 0;
  let propagatedDelayDays = 0;
  let criticalPathCount = 0;

  for (const stage of sortedStages) {
    const inst = instanceMap.get(stage.id);
    const proj = projectedDates.get(stage.id);
    if (!proj) continue;

    const originalStart = inst?.expected_start_date || proj.start;
    const originalEnd = inst?.expected_end_date || proj.end;
    const delayShift = Math.max(0, proj.delayShift);

    // Calculate slack/float: distance from stage projected end to final completion
    const daysToFinal = calculateDaysBetween(proj.end, finalProjectedCompletion);
    const isCritical = daysToFinal === 0 || delayShift > 0;
    const slackDays = isCritical ? 0 : Math.max(0, daysToFinal);

    if (isCritical) {
      criticalPathCount++;
    }

    const impactType: 'direct_delay' | 'propagated_delay' = proj.isDirect
      ? 'direct_delay'
      : 'propagated_delay';

    if (delayShift > 0) {
      if (impactType === 'direct_delay') {
        directDelayDays += delayShift;
      } else {
        propagatedDelayDays += delayShift;
      }
    }

    downstreamList.push({
      stage_id: stage.id,
      stage_title: stage.title,
      original_expected_start: originalStart,
      original_expected_end: originalEnd,
      projected_start: proj.start,
      projected_end: proj.end,
      delay_shift_days: delayShift,
      is_on_critical_path: isCritical,
      impact_type: impactType,
      slack_days: slackDays,
    });
  }

  const netDelayDays = Math.max(0, calculateDaysBetween(baselineProjectedCompletion, finalProjectedCompletion));

  return {
    current_affected_stage: currentAffectedTitle,
    projected_net_delay_days: netDelayDays,
    baseline_completion_date: baselineProjectedCompletion || currentDate,
    projected_completion_date: finalProjectedCompletion || baselineProjectedCompletion || currentDate,
    affected_downstream_stages: downstreamList,
    critical_path_stages_count: criticalPathCount,
    direct_delay_days: directDelayDays,
    propagated_delay_days: propagatedDelayDays,
  };
}
