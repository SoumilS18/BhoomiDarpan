import React from 'react';
import { PortfolioBottleneckSummary } from '../../../shared/types';
import { Badge } from '../common/Badge';
import { GitPullRequest, ShieldAlert, ArrowRight, CheckCircle2, Clock, Layers } from 'lucide-react';

interface PortfolioBottlenecksProps {
  bottlenecks: PortfolioBottleneckSummary[];
  onSelectBottleneckStage?: (stageCode: string) => void;
  onSelectCase?: (caseId: string) => void;
}

export const PortfolioBottlenecks: React.FC<PortfolioBottlenecksProps> = ({
  bottlenecks,
  onSelectBottleneckStage,
  onSelectCase,
}) => {
  if (!bottlenecks || bottlenecks.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-xs">
        <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2.5" />
        <h4 className="font-bold text-gov-slate text-sm">No Systemic Bottlenecks Detected</h4>
        <p className="text-slate-500 mt-1 max-w-md mx-auto text-[11px]">
          All statutory milestones across active cases are progressing within expected SLA thresholds. Prerequisite dependencies and document verifications are clear.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-orange-50 text-orange-600 rounded-lg border border-orange-200">
            <GitPullRequest className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-bold text-gov-slate text-sm">
              Systemic Stage Bottleneck Analytics ({bottlenecks.length})
            </h3>
            <p className="text-[11px] text-slate-500">
              Aggregated operational friction loci ranked by affected case volume and cumulative delay impact.
            </p>
          </div>
        </div>
        <span className="text-[11px] text-slate-400">Drill down into affected case workspaces</span>
      </div>

      <div className="space-y-3">
        {bottlenecks.map((b, idx) => (
          <div
            key={b.stage_code}
            className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition-all space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-gov-red font-bold text-xs shrink-0">
                  {idx + 1}
                </span>
                <div>
                  <h4 className="font-bold text-gov-slate text-sm">{b.stage_title}</h4>
                  <span className="font-mono text-[10px] text-slate-400">{b.stage_code}</span>
                </div>
              </div>

              {/* Severity Counts Badges */}
              <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                {b.critical_count > 0 && (
                  <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded font-semibold">
                    {b.critical_count} Critical
                  </span>
                )}
                {b.high_count > 0 && (
                  <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                    {b.high_count} High
                  </span>
                )}
                {b.medium_count > 0 && (
                  <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-semibold">
                    {b.medium_count} Moderate
                  </span>
                )}
              </div>
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-200/60 text-[11px]">
              <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                <span className="text-[10px] text-slate-400 block font-medium">Affected Cases</span>
                <strong className="text-gov-slate text-sm font-bold">{b.delayed_cases_count} cases</strong>
              </div>

              <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                <span className="text-[10px] text-slate-400 block font-medium">Average Stage Delay</span>
                <strong className="text-gov-red text-sm font-bold">+{b.average_delay_days} days</strong>
              </div>

              <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                <span className="text-[10px] text-slate-400 block font-medium">Accumulated Delay</span>
                <strong className="text-red-700 text-sm font-bold font-mono">
                  {b.total_accumulated_delay_days} days
                </strong>
              </div>

              <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                <span className="text-[10px] text-slate-400 block font-medium">Downstream Friction</span>
                <strong className="text-gov-navy text-sm font-bold">
                  {b.downstream_impact_count} milestones
                </strong>
              </div>
            </div>

            {/* Action Bar */}
            {b.affected_case_ids.length > 0 && onSelectCase && (
              <div className="flex items-center justify-between pt-1 text-[11px]">
                <span className="text-[10px] text-slate-400">
                  {b.affected_case_ids.length} case workspace(s) affected by this bottleneck
                </span>
                <button
                  type="button"
                  onClick={() => onSelectCase(b.affected_case_ids[0])}
                  className="text-gov-navy hover:text-gov-navy-light font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Inspect Lead Case</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
