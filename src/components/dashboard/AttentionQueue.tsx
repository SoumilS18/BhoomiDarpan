import React, { useState } from 'react';
import { AttentionQueueItem } from '../../../shared/types';
import { Badge } from '../common/Badge';
import {
  Flame,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  FileWarning,
  Scale,
  GitPullRequest,
  MapPin,
  Clock,
  UserCheck,
  Zap,
} from 'lucide-react';
import { formatDate } from '../../lib/utils';
import { ROLE_LABELS } from '../../lib/domainLabels';
import type { UserRole } from '../../../shared/types';

interface AttentionQueueProps {
  queue: AttentionQueueItem[];
  onSelectCase: (caseId: string, tab?: string) => void;
}

export const AttentionQueue: React.FC<AttentionQueueProps> = ({ queue, onSelectCase }) => {
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');

  const filteredQueue = queue.filter((item) => {
    if (selectedSeverity === 'all') return true;
    return item.risk_level === selectedSeverity;
  });

  if (!queue || queue.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs">
        <CheckCircle2 className="h-9 w-9 text-emerald-500 mx-auto mb-2" />
        <h4 className="font-bold text-gov-slate text-sm">Attention Queue Clear</h4>
        <p className="text-slate-500 mt-1 max-w-md mx-auto">
          No cases currently meet the attention thresholds configured for this deployment. This
          reflects the live case population — it is not a statement that all work is on schedule.
        </p>
      </div>
    );
  }

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'critical':
        return <Badge variant="red">CRITICAL RISK</Badge>;
      case 'high':
        return <Badge variant="amber">HIGH RISK</Badge>;
      case 'medium':
        return <Badge variant="navy">MODERATE</Badge>;
      default:
        return <Badge variant="slate">LOW</Badge>;
    }
  };

  /**
   * Which backend role the recommended action belongs to.
   *
   * The key is a real `UserRole`; the label is rendered from `ROLE_LABELS`, so
   * the column can never print a role name the API does not recognise.
   */
  const getActionRecommendation = (item: AttentionQueueItem) => {
    if (item.unverified_docs_count > 0) {
      return {
        roleKey: 'revenue_inspector' as UserRole,
        actionLabel: 'Verify',
        tab: 'documents',
        issue: `${item.unverified_docs_count} Unverified Statutory Document${item.unverified_docs_count > 1 ? 's' : ''}`,
      };
    }
    if (item.disputed_parcels_count > 0) {
      return {
        roleKey: 'lao' as UserRole,
        actionLabel: 'Review',
        tab: 'disputes',
        issue: `${item.disputed_parcels_count} Active Parcel Dispute${item.disputed_parcels_count > 1 ? 's' : ''}`,
      };
    }
    if (item.has_active_bottleneck) {
      return {
        roleKey: 'project_officer' as UserRole,
        actionLabel: 'Resolve',
        tab: 'intelligence',
        issue: 'Active Stage Bottleneck',
      };
    }
    return {
      roleKey: 'approver' as UserRole,
      actionLabel: 'Inspect',
      tab: 'workflow',
      issue: 'SLA Milestone Trajectory',
    };
  };

  const getAgeInDays = (dateStr: string) => {
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (days <= 0) return 'Today';
      if (days === 1) return '1 day ago';
      return `${days} days in queue`;
    } catch {
      return 'Recent';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 text-xs shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-red-50 text-gov-red rounded-lg border border-red-200">
            <Flame className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-gov-slate text-sm">
                Operational Attention Queue
              </h3>
              <span className="bg-red-100 text-gov-red text-[11px] font-bold px-2 py-0.5 rounded-full">
                {queue.length} Active
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Immediate operational triage: priority-ranked cases requiring officer action, document verification, or bottleneck resolution.
            </p>
          </div>
        </div>

        {/* Severity quick filters */}
        <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200 text-[11px]">
          <button
            type="button"
            onClick={() => setSelectedSeverity('all')}
            className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
              selectedSeverity === 'all'
                ? 'bg-white text-gov-slate shadow-xs font-semibold'
                : 'text-slate-500 hover:text-gov-slate'
            }`}
          >
            All ({queue.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedSeverity('critical')}
            className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
              selectedSeverity === 'critical'
                ? 'bg-red-600 text-white shadow-xs font-semibold'
                : 'text-slate-500 hover:text-gov-slate'
            }`}
          >
            Critical ({queue.filter((q) => q.risk_level === 'critical').length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedSeverity('high')}
            className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
              selectedSeverity === 'high'
                ? 'bg-amber-600 text-white shadow-xs font-semibold'
                : 'text-slate-500 hover:text-gov-slate'
            }`}
          >
            High ({queue.filter((q) => q.risk_level === 'high').length})
          </button>
        </div>
      </div>

      {/* Queue Items Table */}
      <div className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-2.5 px-3">Case &amp; Corridor</th>
              <th className="py-2.5 px-2.5">Issue &amp; Severity</th>
              <th className="py-2.5 px-2.5">Why Attention Required</th>
              <th className="py-2.5 px-2.5">Responsible Role</th>
              <th className="py-2.5 px-2 text-center">Delay / Age</th>
              <th className="py-2.5 px-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredQueue.map((item) => {
              const recommendation = getActionRecommendation(item);
              const ageText = getAgeInDays(item.last_updated_at);

              return (
                <tr key={item.case_id} className="hover:bg-slate-50/80 transition-colors group">
                  {/* Case Identifier */}
                  <td className="py-2.5 px-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold text-gov-navy bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 shrink-0">
                          {item.case_number}
                        </span>
                        <strong className="text-gov-slate font-semibold text-xs group-hover:text-gov-navy transition-colors line-clamp-1 max-w-[200px] xl:max-w-[280px]">
                          {item.title}
                        </strong>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 line-clamp-1 max-w-[200px] xl:max-w-[280px]">
                        {item.project_name && <span className="text-slate-500 font-medium truncate">{item.project_name} •</span>}
                        <span className="truncate">{item.village}, {item.district}, {item.state}</span>
                      </div>
                    </div>
                  </td>

                  {/* Issue & Severity */}
                  <td className="py-2.5 px-2.5 whitespace-nowrap">
                    <div className="space-y-1">
                      <div className="font-semibold text-gov-slate text-[11px]">
                        {recommendation.issue}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {getRiskBadge(item.risk_level)}
                        <span className="text-[10px] font-mono text-slate-400">
                          {item.risk_score}/100
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Why Attention Required */}
                  <td className="py-2.5 px-2.5 max-w-[210px]">
                    <p className="text-slate-700 leading-snug line-clamp-1 text-[11px]">
                      {item.primary_evidence}
                    </p>

                    <div className="flex flex-wrap gap-1 mt-1 text-[9px]">
                      {item.has_active_bottleneck && (
                        <span className="inline-flex items-center gap-0.5 bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.2 rounded font-medium">
                          <GitPullRequest className="h-2.5 w-2.5" /> Stage Overdue
                        </span>
                      )}
                      {item.unverified_docs_count > 0 && (
                        <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded font-medium">
                          <FileWarning className="h-2.5 w-2.5" /> Pending Verification
                        </span>
                      )}
                      {item.disputed_parcels_count > 0 && (
                        <span className="inline-flex items-center gap-0.5 bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.2 rounded font-medium">
                          <Scale className="h-2.5 w-2.5" /> Active Dispute
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Responsible Role */}
                  <td className="py-2.5 px-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-[11px] font-medium text-slate-700">
                      <UserCheck className="h-3 w-3 text-slate-400 shrink-0" />
                      <span>{ROLE_LABELS[recommendation.roleKey]}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 max-w-[140px] truncate">
                      Stage: {item.current_stage_title}
                    </div>
                  </td>

                  {/* Delay / Age */}
                  <td className="py-2.5 px-2 text-center whitespace-nowrap">
                    <div>
                      {item.projected_delay_days > 0 ? (
                        <span className="font-mono font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded text-[10px]">
                          +{item.projected_delay_days}d SLA
                        </span>
                      ) : (
                        <span className="font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px]">
                          On Track
                        </span>
                      )}
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        <span>{ageText}</span>
                      </div>
                    </div>
                  </td>

                  {/* Recommended Action / Direct jump */}
                  <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onSelectCase(item.case_id, recommendation.tab)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-white bg-gov-navy hover:bg-gov-blue rounded-md shadow-xs transition-colors cursor-pointer shrink-0"
                      title={`Jump to ${recommendation.tab} tab`}
                    >
                      <Zap className="h-2.5 w-2.5 text-amber-300 shrink-0" />
                      <span>{recommendation.actionLabel}</span>
                      <ArrowRight className="h-2.5 w-2.5 shrink-0 opacity-80" />
                    </button>
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
