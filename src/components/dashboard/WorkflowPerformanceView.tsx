import React, { useState } from 'react';
import { WorkflowPerformanceMetric } from '../../../shared/types';
import { GitBranch, Clock, CheckCircle2, AlertCircle, ArrowRight, TrendingUp } from 'lucide-react';
import { Badge } from '../common/Badge';

interface WorkflowPerformanceViewProps {
  workflows: WorkflowPerformanceMetric[];
}

export const WorkflowPerformanceView: React.FC<WorkflowPerformanceViewProps> = ({ workflows }) => {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(
    workflows[0]?.workflow_id || ''
  );

  if (!workflows || workflows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-xs">
        <GitBranch className="h-10 w-10 text-slate-300 mx-auto mb-2.5" />
        <h4 className="font-bold text-gov-slate text-sm">No Workflow SLA Data Available</h4>
        <p className="text-slate-500 mt-1 max-w-md mx-auto text-[11px]">
          Operational duration data will populate as acquisition cases progress through statutory milestones.
        </p>
      </div>
    );
  }

  const activeWorkflow = workflows.find((w) => w.workflow_id === selectedWorkflowId) || workflows[0];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 text-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gov-navy/5 text-gov-navy rounded-lg border border-gov-navy/10">
            <GitBranch className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-bold text-gov-slate text-sm">
              Workflow Milestone Performance &amp; SLA Analysis
            </h3>
            <p className="text-[11px] text-slate-500">
              Evaluates statutory expected durations versus actual historical completion times across arbitrary workflows.
            </p>
          </div>
        </div>

        {/* Workflow Switcher (if multiple workflows) */}
        {workflows.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Workflow Model:</span>
            <select
              value={activeWorkflow.workflow_id}
              onChange={(e) => setSelectedWorkflowId(e.target.value)}
              className="py-1 px-2.5 rounded-lg border border-slate-200 text-xs text-gov-slate bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy"
            >
              {workflows.map((w) => (
                <option key={w.workflow_id} value={w.workflow_id}>
                  {w.workflow_name} ({w.total_cases} cases)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* High-Level Workflow Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3">
          <span className="text-[10px] text-slate-400 block font-medium">Active / Completed Cases</span>
          <div className="text-sm font-bold text-gov-slate mt-0.5">
            {activeWorkflow.active_cases} active • {activeWorkflow.completed_cases} completed
          </div>
          <span className="text-[10px] text-slate-500">{activeWorkflow.total_cases} total cases</span>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3">
          <span className="text-[10px] text-slate-400 block font-medium">Average Workflow Progress</span>
          <div className="text-sm font-bold text-gov-navy mt-0.5 font-mono">
            {activeWorkflow.average_progress_pct}%
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full mt-1 overflow-hidden">
            <div
              className="bg-gov-navy h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, activeWorkflow.average_progress_pct)}%` }}
            />
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3">
          <span className="text-[10px] text-slate-400 block font-medium">Statutory Baseline Duration</span>
          <div className="text-sm font-bold text-gov-slate mt-0.5 font-mono">
            {activeWorkflow.avg_expected_duration_days} Days
          </div>
          <span className="text-[10px] text-slate-400">Sum of default stage durations</span>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3">
          <span className="text-[10px] text-slate-400 block font-medium">Actual Historical Average</span>
          <div className={`text-sm font-bold mt-0.5 font-mono ${
            activeWorkflow.avg_actual_duration_days > activeWorkflow.avg_expected_duration_days
              ? 'text-gov-red'
              : 'text-emerald-700'
          }`}>
            {activeWorkflow.avg_actual_duration_days} Days
          </div>
          <span className="text-[10px] text-slate-500">
            {activeWorkflow.avg_actual_duration_days > activeWorkflow.avg_expected_duration_days
              ? `+${activeWorkflow.avg_actual_duration_days - activeWorkflow.avg_expected_duration_days}d variance`
              : 'Within statutory benchmarks'}
          </span>
        </div>
      </div>

      {/* Stage-by-Stage Breakdown Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-2.5 px-3">Statutory Milestone</th>
              <th className="py-2.5 px-3 text-center">Statutory SLA Target</th>
              <th className="py-2.5 px-3 text-center">Actual Average</th>
              <th className="py-2.5 px-3 text-center">Duration Variance</th>
              <th className="py-2.5 px-3 text-center">Overdue Cases</th>
              <th className="py-2.5 px-3 text-right">Milestone Completion Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {activeWorkflow.stage_metrics.map((stage) => {
              const isOverdueVariance = stage.delay_deviation_days > 0;

              return (
                <tr key={stage.stage_id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-gov-slate">
                    <div className="space-y-0.5">
                      <span>{stage.stage_title}</span>
                      <span className="font-mono text-[10px] text-slate-400 block">{stage.stage_code}</span>
                    </div>
                  </td>

                  <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                    {stage.expected_duration_days} days
                  </td>

                  <td className="py-2.5 px-3 text-center font-mono font-medium text-gov-slate">
                    {stage.actual_avg_duration_days} days
                  </td>

                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    {isOverdueVariance ? (
                      <span className="font-mono font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded text-[10px]">
                        +{stage.delay_deviation_days}d late
                      </span>
                    ) : (
                      <span className="font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
                        On target
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 text-center font-mono">
                    {stage.overdue_cases_count > 0 ? (
                      <span className="font-bold text-gov-red">{stage.overdue_cases_count}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono font-semibold text-gov-slate">{stage.completion_rate_pct}%</span>
                      <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-gov-emerald h-full rounded-full"
                          style={{ width: `${stage.completion_rate_pct}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
