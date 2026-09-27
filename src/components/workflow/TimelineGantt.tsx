import React from 'react';
import { CaseStageInstance } from '../../../shared/types';
import { StageProgressBadge } from '../cases/StageProgressBadge';
import { Button } from '../common/Button';
import { calculateDaysBetween } from '../../../shared/utils/dateUtils';
import {
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileCheck,
  TrendingUp,
  Edit3,
  CalendarCheck,
  CalendarX,
  UserCheck,
} from 'lucide-react';

interface TimelineGanttProps {
  stages: CaseStageInstance[];
  onSelectStageForAdvance: (stage: CaseStageInstance) => void;
  onSelectStageForSchedule?: (stage: CaseStageInstance) => void;
}

export const TimelineGantt: React.FC<TimelineGanttProps> = ({
  stages,
  onSelectStageForAdvance,
  onSelectStageForSchedule,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  // Sort stages by stage_number
  const sortedStages = [...stages].sort(
    (a, b) => (a.stage?.stage_number || 0) - (b.stage?.stage_number || 0)
  );

  const getStageScheduleBadge = (inst: CaseStageInstance) => {
    const isCompleted = inst.status === 'completed';
    const isActive =
      inst.status === 'in_progress' ||
      inst.status === 'blocked' ||
      inst.status === 'pending_approval';

    if (isCompleted && inst.actual_end_date && inst.expected_end_date) {
      const diff = calculateDaysBetween(inst.expected_end_date, inst.actual_end_date);
      if (diff < 0) {
        return {
          type: 'early',
          label: `Completed ${Math.abs(diff)}d Early`,
          className: 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold',
          icon: TrendingUp,
        };
      } else if (diff > 0) {
        return {
          type: 'delayed',
          label: `Completed +${diff}d Late`,
          className: 'bg-amber-50 text-amber-900 border-amber-300 font-bold',
          icon: AlertTriangle,
        };
      } else {
        return {
          type: 'ontrack',
          label: 'Completed On Target',
          className: 'bg-blue-50 text-blue-900 border-blue-300 font-bold',
          icon: CheckCircle2,
        };
      }
    }

    if (isActive && inst.expected_end_date) {
      if (todayStr > inst.expected_end_date) {
        const overdueDays = calculateDaysBetween(inst.expected_end_date, todayStr);
        return {
          type: 'delayed',
          label: `Overdue by ${overdueDays}d`,
          className: 'bg-red-50 text-red-900 border-red-300 font-bold animate-pulse',
          icon: AlertTriangle,
        };
      } else {
        const remainingDays = calculateDaysBetween(todayStr, inst.expected_end_date);
        return {
          type: 'ontrack',
          label: `On Track (${remainingDays}d Left)`,
          className: 'bg-blue-50 text-blue-900 border-blue-200 font-semibold',
          icon: Clock,
        };
      }
    }

    if (inst.status === 'not_started' && inst.expected_start_date) {
      if (todayStr > inst.expected_start_date) {
        const startOverdue = calculateDaysBetween(inst.expected_start_date, todayStr);
        return {
          type: 'delayed',
          label: `Start Overdue by ${startOverdue}d`,
          className: 'bg-amber-50 text-amber-900 border-amber-300 font-medium',
          icon: AlertTriangle,
        };
      }
      return {
        type: 'scheduled',
        label: `Scheduled: ${inst.expected_start_date}`,
        className: 'bg-slate-50 text-slate-600 border-slate-200',
        icon: Calendar,
      };
    }

    return null;
  };

  return (
    <div className="space-y-3">
      {sortedStages.map((inst, index) => {
        const stage = inst.stage;
        const isLast = index === sortedStages.length - 1;
        const isOverdue = Boolean((inst as any).is_overdue);
        const scheduleBadge = getStageScheduleBadge(inst);
        const BadgeIcon = scheduleBadge?.icon;

        return (
          <div key={inst.id} className="relative flex items-start gap-3 sm:gap-4">
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
                  className={`w-0.5 my-1.5 grow min-h-[48px] ${
                    inst.status === 'completed' ? 'bg-emerald-300' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>

            {/* Stage Card */}
            <div
              className={`flex-1 rounded-xl border p-4 transition-all bg-white ${
                inst.status === 'in_progress'
                  ? 'border-blue-300 shadow-md ring-1 ring-blue-100'
                  : inst.status === 'blocked'
                  ? 'border-red-300 shadow-md bg-red-50/20'
                  : 'border-slate-200 hover:border-slate-300 shadow-xs'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-bold text-gov-slate">
                      {stage?.title || `Stage ${index + 1}`}
                    </h4>
                    <span className="font-mono text-[10px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                      {stage?.code}
                    </span>
                    <StageProgressBadge status={inst.status} isOverdue={isOverdue} />
                    {scheduleBadge && (
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full border ${scheduleBadge.className}`}
                      >
                        {BadgeIcon && <BadgeIcon className="h-3 w-3 shrink-0" />}
                        <span>{scheduleBadge.label}</span>
                      </span>
                    )}
                  </div>
                  {stage?.description && (
                    <p className="text-xs text-slate-500 mt-1 max-w-2xl">{stage.description}</p>
                  )}
                </div>

                {/* Stage Actions */}
                <div className="flex items-center gap-1.5 ml-auto">
                  {onSelectStageForSchedule && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onSelectStageForSchedule(inst)}
                      className="text-xs text-slate-700 hover:text-gov-navy border-slate-300"
                      leftIcon={<Edit3 className="h-3 w-3" />}
                    >
                      <span>Edit Target Date</span>
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant={inst.status === 'in_progress' ? 'primary' : 'outline'}
                    onClick={() => onSelectStageForAdvance(inst)}
                    rightIcon={<ChevronRight className="h-3 w-3" />}
                    className={
                      inst.status === 'in_progress'
                        ? 'bg-gov-navy hover:bg-gov-blue text-white font-semibold'
                        : ''
                    }
                  >
                    <span>Update Status</span>
                  </Button>
                </div>
              </div>

              {/* Dynamic Timelines Comparison Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-100 text-xs">
                {/* Expected Planned Duration & Mentioned Target Date */}
                <div className="bg-blue-50/50 rounded-lg p-2.5 border border-blue-200/70">
                  <div className="text-[11px] font-bold text-gov-navy flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-blue-700" />
                      <span>Target SLA Deadline</span>
                    </span>
                    {onSelectStageForSchedule && (
                      <button
                        type="button"
                        onClick={() => onSelectStageForSchedule(inst)}
                        className="text-[10px] text-blue-700 hover:underline cursor-pointer"
                      >
                        Change
                      </button>
                    )}
                  </div>
                  <div className="font-mono text-gov-slate font-bold text-xs">
                    {inst.expected_start_date} <span className="text-slate-400 font-normal">→</span>{' '}
                    <span className="text-gov-navy">{inst.expected_end_date}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Planned duration:{' '}
                    {typeof stage?.default_duration_days === 'number' ? (
                      <strong>{stage.default_duration_days} days</strong>
                    ) : (
                      <span className="text-slate-400">Defined SLA</span>
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
                  <div className="font-mono text-gov-slate font-medium text-xs">
                    {inst.actual_start_date ? (
                      <>
                        {inst.actual_start_date} <span className="text-slate-400">→</span>{' '}
                        {inst.actual_end_date || (
                          <span className="text-blue-700 font-bold italic">In Progress</span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-400 italic">Not initiated yet</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {inst.actual_end_date ? (
                      <span className="text-emerald-700 font-semibold">Concluded on record</span>
                    ) : inst.actual_start_date ? (
                      <span className="text-blue-700 font-semibold">Active operational phase</span>
                    ) : (
                      'Awaiting prior dependencies'
                    )}
                  </div>
                </div>

                {/* Statutory Requirements */}
                <div className="bg-slate-50/80 rounded-lg p-2.5 border border-slate-200/70">
                  <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 mb-1">
                    <UserCheck className="h-3 w-3 text-slate-400" />
                    <span>Responsible Role &amp; Protocol</span>
                  </div>
                  <div className="text-gov-slate font-medium capitalize">
                    Role: <strong className="text-gov-navy">{stage?.required_role || 'LAO'}</strong>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">
                    Docs:{' '}
                    {stage?.required_documents && stage.required_documents.length > 0
                      ? stage.required_documents.join(', ')
                      : 'Standard statutory record'}
                  </div>
                </div>
              </div>

              {/* Official Notes if present */}
              {inst.notes && (
                <div className="mt-2.5 rounded bg-amber-50/70 border border-amber-200 p-2 text-[11px] text-amber-900 flex items-start gap-1.5">
                  <FileCheck className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Official Record Note: </span>
                    <span>{inst.notes}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
