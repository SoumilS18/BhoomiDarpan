import React from 'react';
import { AcquisitionCase } from '../../../shared/types';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { MapPin, Calendar, Clock, ArrowRight, AlertTriangle } from 'lucide-react';

interface CaseCardProps {
  caseItem: AcquisitionCase;
  onClick: () => void;
}

export const CaseCard: React.FC<CaseCardProps> = ({ caseItem, onClick }) => {
  const metrics = caseItem.calculated_metrics;
  const progress = metrics?.progress_percentage ?? 0;
  const isDelayed = metrics?.is_delayed || caseItem.status === 'delayed';
  const netDelayDays = metrics?.net_delay_days ?? 0;

  // Format INR Currency
  const formatCurrency = (amount: number) => {
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(2)} Cr`;
    }
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)} L`;
    }
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const priorityVariants: Record<string, 'red' | 'amber' | 'navy' | 'slate'> = {
    critical: 'red',
    high: 'amber',
    medium: 'navy',
    low: 'slate',
  };

  return (
    <Card
      hoverEffect
      onClick={onClick}
      className="cursor-pointer border-slate-200 hover:border-gov-navy/40 transition-all group"
    >
      <div className="p-5">
        {/* Header: Case Number & Priority */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-gov-navy bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                {caseItem.case_number}
              </span>
              <Badge variant={priorityVariants[caseItem.priority] || 'slate'}>
                {caseItem.priority.toUpperCase()}
              </Badge>
            </div>
            <h4 className="text-sm font-bold text-gov-slate mt-1.5 line-clamp-1 group-hover:text-gov-navy transition-colors">
              {caseItem.title}
            </h4>
          </div>

          {isDelayed && (
            <div className="flex items-center gap-1 text-[11px] font-semibold text-gov-red bg-red-50 border border-red-200 px-2 py-0.5 rounded-full shrink-0 animate-pulse">
              <AlertTriangle className="h-3 w-3" />
              <span>+{netDelayDays}d Delay</span>
            </div>
          )}
        </div>

        {/* Location & Project */}
        <div className="space-y-1 my-3 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="truncate">
              {caseItem.village}, {caseItem.district}, {caseItem.state}
            </span>
          </div>
          {caseItem.project && (
            <div className="text-[11px] text-slate-600 truncate pl-5">
              Project: <span className="font-medium text-gov-slate">{caseItem.project.name}</span>
            </div>
          )}
        </div>

        {/* Progress Bar & Current Stage */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="flex justify-between items-center text-xs mb-1.5">
            <span className="text-[11px] text-slate-500">
              Stage: <strong className="text-gov-slate font-semibold">{metrics?.current_stage_title || '—'}</strong>
            </span>
            <span className="font-mono font-bold text-gov-navy text-xs">{progress}%</span>
          </div>

          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                isDelayed ? 'bg-gov-amber' : progress === 100 ? 'bg-gov-emerald' : 'bg-gov-navy'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Bottom Vitals: Area, Compensation, Dates */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <div>
            <span>Area: </span>
            <strong className="text-gov-slate">{caseItem.total_area_hectares} Ha</strong>
          </div>
          <div>
            <span>Comp: </span>
            <strong className="text-gov-slate">{formatCurrency(caseItem.estimated_compensation)}</strong>
          </div>
          <div className="flex items-center gap-1 text-gov-navy font-semibold group-hover:translate-x-0.5 transition-transform">
            <span>View Workspace</span>
            <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      </div>
    </Card>
  );
};
