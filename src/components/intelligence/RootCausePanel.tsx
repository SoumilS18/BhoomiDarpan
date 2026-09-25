import React from 'react';
import { RootCauseItem } from '../../../shared/types';
import { Badge } from '../common/Badge';
import {
  FileWarning,
  GitBranch,
  Scale,
  Clock,
  Compass,
  HelpCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface RootCausePanelProps {
  rootCauses: RootCauseItem[];
}

export const RootCausePanel: React.FC<RootCausePanelProps> = ({ rootCauses }) => {
  if (!rootCauses || rootCauses.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs">
        <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
        <h4 className="font-bold text-gov-slate text-sm">No Root-Cause Friction Identified</h4>
        <p className="text-slate-500 mt-1 max-w-md mx-auto">
          Current case trajectory has no anomalous blockers, documentation backlogs, or disputed parcels.
        </p>
      </div>
    );
  }

  const getCategoryConfig = (category: string) => {
    switch (category) {
      case 'workflow_dependency':
        return {
          label: 'Prerequisite Dependency',
          icon: <GitBranch className="h-3.5 w-3.5 text-amber-600" />,
          badgeVariant: 'amber' as const,
        };
      case 'documentation_issue':
        return {
          label: 'Documentation & Validation',
          icon: <FileWarning className="h-3.5 w-3.5 text-orange-600" />,
          badgeVariant: 'amber' as const,
        };
      case 'approval_dependency':
        return {
          label: 'Inter-Agency Clearance',
          icon: <Clock className="h-3.5 w-3.5 text-indigo-600" />,
          badgeVariant: 'navy' as const,
        };
      case 'dispute_litigation':
        return {
          label: 'Cadastral / Legal Dispute',
          icon: <Scale className="h-3.5 w-3.5 text-red-600" />,
          badgeVariant: 'red' as const,
        };
      case 'survey_delay':
        return {
          label: 'Field Ground Survey',
          icon: <Compass className="h-3.5 w-3.5 text-blue-600" />,
          badgeVariant: 'navy' as const,
        };
      default:
        return {
          label: 'Operational Blocker',
          icon: <HelpCircle className="h-3.5 w-3.5 text-slate-600" />,
          badgeVariant: 'slate' as const,
        };
    }
  };

  const getClassificationBadge = (classification?: string) => {
    switch (classification) {
      case 'immediate_cause':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
            IMMEDIATE CAUSE
          </span>
        );
      case 'upstream_cause':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            UPSTREAM CAUSE
          </span>
        );
      case 'contributing_factor':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            CONTRIBUTING FACTOR
          </span>
        );
      case 'external_contextual_factor':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
            CONTEXTUAL FACTOR
          </span>
        );
      case 'data_quality_limitation':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            DATA LIMITATION
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gov-navy" />
          <h4 className="text-xs font-bold text-gov-slate uppercase tracking-wider">
            Root-Cause Attribution ({rootCauses.length})
          </h4>
        </div>
        <span className="text-[11px] text-slate-500">DAG-Driven Evidence Attribution</span>
      </div>

      <div className="space-y-2.5">
        {rootCauses.map((rc, idx) => {
          const cat = getCategoryConfig(rc.category);
          const confidencePct = Math.round(rc.confidence * 100);
          const isInsufficient = rc.cause === 'insufficient_evidence';

          if (isInsufficient) {
            return (
              <div
                key={idx}
                className="bg-amber-50/70 rounded-xl border border-amber-300 p-4 text-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <HelpCircle className="h-4 w-4 text-amber-600" />
                    <span>Insufficient Recorded Evidence for Root Cause Determination</span>
                  </div>
                  {getClassificationBadge(rc.classification)}
                </div>
                <p className="text-amber-800/90 text-[11px] leading-relaxed">
                  {rc.evidence}
                </p>
                <div className="text-[10px] text-amber-700 italic border-t border-amber-200/60 pt-1">
                  Diagnostic Integrity Note: System refuses to fabricate speculative causes when case milestone logs lack recorded event evidence.
                </div>
              </div>
            );
          }

          return (
            <div
              key={idx}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-all text-xs space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-slate-50 rounded-md border border-slate-100">{cat.icon}</span>
                  <div>
                    <h5 className="font-semibold text-gov-slate text-sm leading-tight">{rc.cause}</h5>
                    {rc.affected_stage && (
                      <span className="text-[11px] text-slate-500">
                        Affected Stage: <strong className="text-gov-slate">{rc.affected_stage}</strong>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {getClassificationBadge(rc.classification)}
                  <Badge variant={cat.badgeVariant}>{cat.label}</Badge>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold border ${
                      confidencePct >= 85
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : confidencePct >= 70
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                    title="Confidence score derived from factual evidence"
                  >
                    {confidencePct}% Confidence
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1.5 text-[11px]">
                <div>
                  <strong className="text-gov-slate">Factual Evidence:</strong>{' '}
                  <span className="text-slate-700">{rc.evidence}</span>
                </div>
                <div>
                  <strong className="text-gov-slate">Impact on Schedule:</strong>{' '}
                  <span className="text-slate-600">{rc.relationship_to_delay}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
