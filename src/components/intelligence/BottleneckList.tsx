import React from 'react';
import { BottleneckItem } from '../../../shared/types';
import { Badge } from '../common/Badge';
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';

interface BottleneckListProps {
  bottlenecks: BottleneckItem[];
}

export const BottleneckList: React.FC<BottleneckListProps> = ({ bottlenecks }) => {
  if (!bottlenecks || bottlenecks.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs">
        <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
        <h4 className="font-bold text-gov-slate text-sm">No Active Workflow Bottlenecks</h4>
        <p className="text-slate-500 mt-1 max-w-md mx-auto">
          All statutory milestones are progressing within expected SLA benchmarks. Prerequisite dependencies and document verifications are clear.
        </p>
      </div>
    );
  }

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'critical':
        return <Badge variant="red">CRITICAL BOTTLENECK</Badge>;
      case 'high':
        return <Badge variant="red">HIGH BOTTLENECK</Badge>;
      case 'medium':
        return <Badge variant="amber">MEDIUM BOTTLENECK</Badge>;
      default:
        return <Badge variant="navy">LOW</Badge>;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-gov-red" />
          <h4 className="text-xs font-bold text-gov-slate uppercase tracking-wider">
            Active Workflow Bottlenecks ({bottlenecks.length})
          </h4>
        </div>
        <span className="text-[11px] text-slate-500">Ranked by Critical Path Impact</span>
      </div>

      <div className="space-y-2.5">
        {bottlenecks.map((b, idx) => (
          <div
            key={idx}
            className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-all text-xs space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <strong className="text-gov-slate text-sm font-semibold">{b.stage_title}</strong>
                {getSeverityBadge(b.severity)}
              </div>

              <div className="flex items-center gap-2 text-right">
                {b.deviation_days > 0 && (
                  <span className="font-mono font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded text-[11px]">
                    +{b.deviation_days} Days Deviation
                  </span>
                )}
              </div>
            </div>

            <p className="text-slate-600 text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <strong className="text-gov-slate">Evidence:</strong> {b.evidence}
            </p>

            {b.downstream_stages_count > 0 && (
              <div className="flex items-start gap-1.5 text-[11px] text-slate-500 pt-1">
                <ArrowRight className="h-3.5 w-3.5 text-gov-navy shrink-0 mt-0.5" />
                <span>
                  <strong>Cascading Friction:</strong> Delay directly impacts {b.downstream_stages_count} downstream stage(s):{' '}
                  <span className="font-medium text-gov-navy">{b.downstream_stage_titles.join(' → ')}</span>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
