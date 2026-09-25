import React from 'react';
import { DownstreamImpactResult } from '../../../shared/types';
import { Badge } from '../common/Badge';
import {
  Calendar,
  GitPullRequest,
  AlertCircle,
  CheckCircle2,
  TrendingDown,
  ArrowRight,
  GitBranch,
} from 'lucide-react';
import { formatDate } from '../../lib/utils';

interface DownstreamImpactViewProps {
  impact: DownstreamImpactResult;
}

export const DownstreamImpactView: React.FC<DownstreamImpactViewProps> = ({ impact }) => {
  if (!impact) {
    return null;
  }

  const hasDelay = impact.projected_net_delay_days > 0;
  const criticalPathCount =
    impact.critical_path_stages_count ??
    impact.affected_downstream_stages.filter((s) => s.is_on_critical_path).length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <GitPullRequest className="h-4 w-4 text-gov-navy" />
          <h4 className="text-xs font-bold text-gov-slate uppercase tracking-wider">
            Downstream Schedule &amp; Dependency Impact
          </h4>
        </div>
        <div className="flex items-center gap-2">
          {hasDelay ? (
            <Badge variant="red">
              <span className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Schedule Slippage: +{impact.projected_net_delay_days} Days
              </span>
            </Badge>
          ) : (
            <Badge variant="emerald">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Zero Critical Path Slippage
              </span>
            </Badge>
          )}
        </div>
      </div>

      {/* Date Comparison Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium">Statutory Baseline End</span>
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="text-sm font-bold text-gov-slate font-mono">
            {impact.baseline_completion_date ? formatDate(impact.baseline_completion_date) : 'N/A'}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Original statutory SLA deadline</p>
        </div>

        <div
          className={`border rounded-lg p-3 ${
            hasDelay ? 'bg-red-50/50 border-red-200' : 'bg-emerald-50/50 border-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium">Projected Completion</span>
            <TrendingDown
              className={`h-3.5 w-3.5 ${hasDelay ? 'text-red-500' : 'text-emerald-500'}`}
            />
          </div>
          <div className={`text-sm font-bold font-mono ${hasDelay ? 'text-red-700' : 'text-emerald-700'}`}>
            {impact.projected_completion_date ? formatDate(impact.projected_completion_date) : 'N/A'}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {hasDelay
              ? `Delayed by ${impact.projected_net_delay_days} calendar days`
              : 'Tracking strictly on schedule'}
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium">Direct vs Propagated Delay</span>
            <GitBranch className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="text-sm font-bold text-gov-slate font-mono">
            {impact.direct_delay_days ?? 0}d / {impact.propagated_delay_days ?? 0}d
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Origin vs DAG-cascaded slip</p>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium">Critical Path Friction</span>
            <span className="font-mono text-xs font-bold text-gov-navy">{criticalPathCount} Stages</span>
          </div>
          <div className="text-sm font-bold text-gov-slate font-mono truncate">
            {impact.current_affected_stage || 'None currently active'}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Active friction locus</p>
        </div>
      </div>

      {/* Downstream Stage Cascading Schedule Table */}
      {impact.affected_downstream_stages.length === 0 ? (
        <div className="p-4 bg-slate-50 rounded-lg text-center text-slate-500 text-[11px]">
          No dependent downstream stages are currently impacted.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Downstream Milestone</th>
                <th className="py-2.5 px-3">Impact Type</th>
                <th className="py-2.5 px-3">Original Schedule</th>
                <th className="py-2.5 px-3">Projected Realignment</th>
                <th className="py-2.5 px-3 text-center">Slippage</th>
                <th className="py-2.5 px-3 text-center">Schedule Slack</th>
                <th className="py-2.5 px-3 text-right">Path Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {impact.affected_downstream_stages.map((stage, idx) => (
                <tr
                  key={idx}
                  className={`hover:bg-slate-50/80 transition-colors ${
                    stage.is_on_critical_path ? 'bg-amber-50/20' : ''
                  }`}
                >
                  <td className="py-2.5 px-3 font-semibold text-gov-slate">
                    <div className="flex items-center gap-1.5">
                      <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                      <span>{stage.stage_title}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    {stage.impact_type === 'direct_delay' ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
                        Direct
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        Propagated
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                    {formatDate(stage.original_expected_start)} → {formatDate(stage.original_expected_end)}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-medium text-gov-slate whitespace-nowrap">
                    {formatDate(stage.projected_start)} → {formatDate(stage.projected_end)}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {stage.delay_shift_days > 0 ? (
                      <span className="font-mono font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded text-[10px]">
                        +{stage.delay_shift_days}d
                      </span>
                    ) : (
                      <span className="font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
                        0d
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono text-slate-500">
                    {stage.slack_days !== undefined ? `${stage.slack_days}d` : '0d'}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {stage.is_on_critical_path ? (
                      <Badge variant="red">CRITICAL PATH</Badge>
                    ) : (
                      <Badge variant="slate">SLACK AVAILABLE</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
