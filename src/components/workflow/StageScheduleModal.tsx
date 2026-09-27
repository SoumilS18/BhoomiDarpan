import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { CaseStageInstance, StageInstanceStatus } from '../../../shared/types';
import { updateCaseStageSchedule } from '../../lib/api';
import { calculateDaysBetween, addDaysToDate } from '../../../shared/utils/dateUtils';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Check,
  TrendingUp,
  TrendingDown,
  Info,
  CalendarCheck,
  CalendarX,
} from 'lucide-react';

interface StageScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  stageInstance: CaseStageInstance | null;
  onScheduleUpdated: () => void;
}

export const StageScheduleModal: React.FC<StageScheduleModalProps> = ({
  isOpen,
  onClose,
  caseId,
  stageInstance,
  onScheduleUpdated,
}) => {
  const [expectedStartDate, setExpectedStartDate] = useState('');
  const [expectedEndDate, setExpectedEndDate] = useState('');
  const [actualStartDate, setActualStartDate] = useState('');
  const [actualEndDate, setActualEndDate] = useState('');
  const [status, setStatus] = useState<StageInstanceStatus>('in_progress');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && stageInstance) {
      setExpectedStartDate(stageInstance.expected_start_date || '');
      setExpectedEndDate(stageInstance.expected_end_date || '');
      setActualStartDate(stageInstance.actual_start_date || '');
      setActualEndDate(stageInstance.actual_end_date || '');
      setStatus(stageInstance.status);
      setNotes(stageInstance.notes || '');
      setError(null);
    }
  }, [isOpen, stageInstance]);

  if (!stageInstance) return null;

  const todayStr = new Date().toISOString().split('T')[0];

  // Dynamic status evaluation
  const plannedDuration = expectedStartDate && expectedEndDate
    ? Math.max(1, calculateDaysBetween(expectedStartDate, expectedEndDate))
    : stageInstance.stage?.default_duration_days || 30;

  // Calculate if delayed or early
  let scheduleAnalysisText = '';
  let scheduleAnalysisType: 'early' | 'delayed' | 'ontrack' | 'neutral' = 'neutral';

  if (status === 'completed' && actualEndDate && expectedEndDate) {
    const diff = calculateDaysBetween(expectedEndDate, actualEndDate);
    if (diff < 0) {
      scheduleAnalysisType = 'early';
      scheduleAnalysisText = `Completed ${Math.abs(diff)} days ahead of statutory target date!`;
    } else if (diff > 0) {
      scheduleAnalysisType = 'delayed';
      scheduleAnalysisText = `Concluded with a ${diff}-day delay beyond target completion deadline.`;
    } else {
      scheduleAnalysisType = 'ontrack';
      scheduleAnalysisText = 'Completed exactly on statutory target date.';
    }
  } else if ((status === 'in_progress' || status === 'blocked') && expectedEndDate) {
    if (todayStr > expectedEndDate) {
      const overdue = calculateDaysBetween(expectedEndDate, todayStr);
      scheduleAnalysisType = 'delayed';
      scheduleAnalysisText = `Currently overdue by ${overdue} days past target completion date (${expectedEndDate}).`;
    } else {
      const remaining = calculateDaysBetween(todayStr, expectedEndDate);
      scheduleAnalysisType = 'ontrack';
      scheduleAnalysisText = `On schedule: ${remaining} days remaining until target completion deadline (${expectedEndDate}).`;
    }
  }

  const handleAdjustEndDate = (days: number) => {
    if (expectedStartDate) {
      const newEnd = addDaysToDate(expectedStartDate, days);
      setExpectedEndDate(newEnd);
    } else {
      const base = expectedEndDate || todayStr;
      const newEnd = addDaysToDate(base, days);
      setExpectedEndDate(newEnd);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expectedEndDate) {
      setError('Please provide a target completion date.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await updateCaseStageSchedule(caseId, stageInstance.id, {
        expected_start_date: expectedStartDate,
        expected_end_date: expectedEndDate,
        actual_start_date: actualStartDate || undefined,
        actual_end_date: actualEndDate || undefined,
        status,
        notes: notes.trim() || undefined,
      });

      onScheduleUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update schedule');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Configure Stage Schedule & Mentioned Target Date"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Stage Header Summary */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-gov-slate text-sm">
              {stageInstance.stage?.title || 'Workflow Task'}
            </h4>
            <span className="font-mono text-[10px] text-slate-500 bg-white px-2 py-0.5 rounded border">
              {stageInstance.stage?.code || 'STAGE'}
            </span>
          </div>
          {stageInstance.stage?.description && (
            <p className="text-slate-500 text-[11px] mt-1">
              {stageInstance.stage.description}
            </p>
          )}
        </div>

        {/* Live Early / Delayed Status Indicator */}
        {scheduleAnalysisText && (
          <div
            className={`p-3 rounded-lg border flex items-center gap-2 text-xs font-semibold ${
              scheduleAnalysisType === 'early'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : scheduleAnalysisType === 'delayed'
                ? 'bg-red-50 text-red-900 border-red-300'
                : scheduleAnalysisType === 'ontrack'
                ? 'bg-blue-50 text-blue-900 border-blue-300'
                : 'bg-slate-50 text-slate-700 border-slate-300'
            }`}
          >
            {scheduleAnalysisType === 'early' ? (
              <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : scheduleAnalysisType === 'delayed' ? (
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            ) : (
              <CalendarCheck className="h-4 w-4 text-blue-600 shrink-0" />
            )}
            <span>{scheduleAnalysisText}</span>
          </div>
        )}

        {/* Target Completion Dates Section */}
        <div className="space-y-3 p-3 bg-blue-50/40 border border-blue-200/80 rounded-lg">
          <div className="flex items-center justify-between">
            <label className="font-bold text-gov-navy text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-blue-700" />
              <span>Mentioned Target &amp; SLA Schedule</span>
            </label>
            <span className="text-[10px] text-blue-700 font-mono">
              Planned Duration: <strong>{plannedDuration} Days</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Planned Start Date
              </label>
              <input
                type="date"
                value={expectedStartDate}
                onChange={(e) => setExpectedStartDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:ring-1 focus:ring-gov-navy focus:border-gov-navy"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gov-navy mb-1 flex items-center justify-between">
                <span>Mentioned Target Completion Date</span>
                <span className="text-[10px] text-slate-400 font-normal">SLA Deadline</span>
              </label>
              <input
                type="date"
                value={expectedEndDate}
                onChange={(e) => setExpectedEndDate(e.target.value)}
                className="w-full bg-white border-2 border-blue-400 rounded px-2.5 py-1.5 text-xs text-slate-900 font-mono font-bold focus:ring-2 focus:ring-gov-navy focus:border-gov-navy"
                required
              />
            </div>
          </div>

          {/* Quick SLA adjustments */}
          <div className="flex items-center gap-1.5 pt-1 text-[10px] text-slate-500">
            <span>Quick Target SLA:</span>
            <button
              type="button"
              onClick={() => handleAdjustEndDate(15)}
              className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 font-medium"
            >
              +15 Days
            </button>
            <button
              type="button"
              onClick={() => handleAdjustEndDate(30)}
              className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 font-medium"
            >
              +30 Days
            </button>
            <button
              type="button"
              onClick={() => handleAdjustEndDate(60)}
              className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 font-medium"
            >
              +60 Days
            </button>
          </div>
        </div>

        {/* Execution Status & Actual Dates */}
        <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <label className="font-bold text-gov-slate text-[11px] uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-slate-600" />
            <span>Execution Status &amp; Actual Recorded Dates</span>
          </label>

          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">
              Current Stage Status
            </label>
            <select
              value={status}
              onChange={(e) => {
                const newStatus = e.target.value as StageInstanceStatus;
                setStatus(newStatus);
                if (newStatus === 'completed' && !actualEndDate) {
                  setActualEndDate(todayStr);
                }
                if (newStatus === 'in_progress' && !actualStartDate) {
                  setActualStartDate(todayStr);
                }
              }}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-1 focus:ring-gov-navy focus:border-gov-navy"
            >
              <option value="not_started">Not Started (Pending Prior Stages)</option>
              <option value="in_progress">In Progress (Active Execution)</option>
              <option value="completed">Completed (Officially Concluded)</option>
              <option value="blocked">Blocked (Litigation / Stay Order)</option>
              <option value="pending_approval">Pending Approval (Competent Authority)</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Actual Initiation Date
              </label>
              <input
                type="date"
                value={actualStartDate}
                onChange={(e) => setActualStartDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:ring-1 focus:ring-gov-navy focus:border-gov-navy"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Actual Completion Date
              </label>
              <input
                type="date"
                value={actualEndDate}
                onChange={(e) => setActualEndDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:ring-1 focus:ring-gov-navy focus:border-gov-navy"
              />
            </div>
          </div>
        </div>

        {/* Official Notes & Statutory Justification */}
        <div>
          <label className="block text-[11px] font-medium text-slate-700 mb-1 flex items-center gap-1">
            <FileText className="h-3 w-3 text-slate-400" />
            <span>Official Record Notes / Rescheduling Justification</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g., Extension granted under Section 19(2) or expedited joint survey."
            className="w-full bg-white border border-slate-300 rounded p-2 text-xs text-slate-800 placeholder-slate-400 focus:ring-1 focus:ring-gov-navy focus:border-gov-navy"
          />
        </div>

        {error && (
          <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isSubmitting}
            className="bg-gov-navy hover:bg-gov-blue text-white font-semibold"
            leftIcon={<Check className="h-3.5 w-3.5" />}
          >
            {isSubmitting ? 'Saving...' : 'Apply Schedule & Target Date'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
