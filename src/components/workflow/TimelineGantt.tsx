import React from 'react';
import { CaseStageInstance } from '../../../shared/types';
import { StageProgressBadge } from '../cases/StageProgressBadge';
import { Button } from '../common/Button';
import { Clock, Calendar, AlertTriangle, CheckCircle2, ChevronRight, FileCheck } from 'lucide-react';

interface TimelineGanttProps {
  stages: CaseStageInstance[];
  onSelectStageForAdvance: (stage: CaseStageInstance) => void;
}

export const TimelineGantt: React.FC<TimelineGanttProps> = ({
  stages,
  onSelectStageForAdvance,
}) => {
  // Sort stages by stage_number
  const sortedStages = [...stages].sort(
    (a, b) => (a.stage?.stage_number || 0) - (b.stage?.stage_number || 0)
  );

  return (
    <div className="space-y-3">
      {sortedStages.map((inst, index) => {
        const stage = inst.stage;
        const isLast = index === sortedStages.length - 1;
        const isOverdue = Boolean((inst as any).is_overdue);
        const delayDays = inst.delay_days || 0;

        return (
          <div key={inst.id} className="relative flex items-start gap-4">
            {/* Timeline Vertical Track & Node */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all shadow-sm ${
                  inst.status === 'completed'
                    ? 'bg-gov-emerald text-white ring-4 ring-emerald-50'
                    : inst.status === 'in_progress'
                    ? 'bg-gov-navy text-white ring-4 ring-blue-50 animate-pulse'
                    : inst.status === 'blocked'
                    ? 'bg-gov-red text-white ring-4 ring-red-50'
                    : 'bg-slate-100 text-slate-500 border border-slate-300'
                }`}
              >
                {inst.status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  stage?.stage_number || index + 1
                )}
              </div>
              {!isLast && (
                <div
                  className={`w-0.5 my-1.5 grow min-h-[44px] ${
                    inst.status === 'completed' ? 'bg-emerald-300' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>

            {/* Stage Card */}
            <div
              className={`flex-1 rounded-xl border p-4 transition-all bg-white ${
                inst.status === 'in_progress'
                  ? 'border-blue-300 shadow-gov-md ring-1 ring-blue-100'
                  : inst.status === 'blocked'
                  ? 'border-red-300 shadow-gov-md bg-red-50/20'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-gov-slate">
                      {stage?.title || `Stage ${index + 1}`}
                    </h4>
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                      {stage?.code}
                    </span>
                    <StageProgressBadge status={inst.status} isOverdue={isOverdue} />
                  </div>
                  {stage?.description && (
                    <p className="text-xs text-slate-500 mt-1 max-w-2xl">{stage.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {delayDays > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-gov-red bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                      <AlertTriangle className="h-3 w-3" />
                      <span>+{delayDays} Days Delay</span>
                    </span>
                  )}

                  <Button
                    size="sm"
                    variant={inst.status === 'in_progress' ? 'primary' : 'outline'}
                    onClick={() => onSelectStageForAdvance(inst)}
                    rightIcon={<ChevronRight className="h-3 w-3" />}
                  >
                    <span>Update Stage</span>
                  </Button>
                </div>
              </div>

              {/* Dynamic Timelines Comparison Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-100 text-xs">
                {/* Expected Planned Duration */}
                <div className="bg-slate-50/80 rounded-lg p-2.5 border border-slate-200/70">
                  <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 mb-1">
                    <Calendar className="h-3 w-3 text-slate-400" />
                    <span>Statutory Baseline SLA</span>
                  </div>
                  <div className="font-mono text-gov-slate font-medium">
                    {inst.expected_start_date} <span className="text-slate-400">→</span> {inst.expected_end_date}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Planned duration:{' '}
                    {typeof stage?.default_duration_days === 'number' ? (
                      <strong>{stage.default_duration_days} days</strong>
                    ) : (
                      <span className="text-slate-400">Not defined for this stage</span>
                    )}
                  </div>
                </div>

                {/* Actual Execution Duration */}
                <div
                  className={`rounded-lg p-2.5 border ${
                    inst.status === 'completed'
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : inst.status === 'in_progress'
                      ? 'bg-blue-50/50 border-blue-200'
                      : 'bg-slate-50/80 border-slate-200/70'
                  }`}
                >
                  <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 mb-1">
                    <Clock className="h-3 w-3 text-slate-400" />
                    <span>Actual Recorded Execution</span>
                  </div>
                  <div className="font-mono text-gov-slate font-medium">
                    {inst.actual_start_date ? (
                      <>
                        {inst.actual_start_date} <span className="text-slate-400">→</span>{' '}
                        {inst.actual_end_date || <span className="text-blue-600 italic">In Progress</span>}
                      </>
                    ) : (
                      <span className="text-slate-400 italic">Not initiated yet</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {inst.actual_end_date ? (
                      <span className="text-emerald-700 font-medium">Concluded on record</span>
                    ) : inst.actual_start_date ? (
                      <span className="text-blue-700 font-medium">Active operational phase</span>
                    ) : (
                      'Awaiting prior dependencies'
                    )}
                  </div>
                </div>

                {/* Statutory Requirements */}
                <div className="bg-slate-50/80 rounded-lg p-2.5 border border-slate-200/70">
                  <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 mb-1">
                    <FileCheck className="h-3 w-3 text-slate-400" />
                    <span>Prerequisites &amp; Role</span>
                  </div>
                  <div className="text-gov-slate font-medium capitalize">
                    Role: <strong>{stage?.required_role || '—'}</strong>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">
                    Docs:{' '}
                    {stage?.required_documents && stage.required_documents.length > 0
                      ? stage.required_documents.join(', ')
                      : 'Standard procedure'}
                  </div>
                </div>
              </div>

              {/* Official Notes if present */}
              {inst.notes && (
                <div className="mt-2.5 rounded bg-amber-50/60 border border-amber-200/80 p-2 text-[11px] text-amber-900">
                  <span className="font-semibold">Official Record Note: </span>
                  {inst.notes}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
