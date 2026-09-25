import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { CaseStageInstance, StageInstanceStatus, StageAdvancementEvaluation } from '../../../shared/types';
import { advanceStage, evaluateStage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  CheckCircle2,
  AlertTriangle,
  Play,
  PauseCircle,
  XCircle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  FileText,
  ListChecks,
  Info,
} from 'lucide-react';

interface StageAdvanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  stageInstance: CaseStageInstance | null;
  onStageUpdated: () => void;
}

export const StageAdvanceModal: React.FC<StageAdvanceModalProps> = ({
  isOpen,
  onClose,
  caseId,
  stageInstance,
  onStageUpdated,
}) => {
  const { activePersona } = useAuth();
  const [targetStatus, setTargetStatus] = useState<StageInstanceStatus>('completed');
  const [actualDate, setActualDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [allowOverride, setAllowOverride] = useState(false);
  const [overrideJustification, setOverrideJustification] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<StageAdvancementEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch server-side authoritative guard evaluation whenever modal opens or targetStatus changes
  useEffect(() => {
    if (!isOpen || !stageInstance) {
      setEvaluation(null);
      return;
    }

    let isMounted = true;
    setIsEvaluating(true);
    setError(null);

    evaluateStage(caseId, stageInstance.id, targetStatus)
      .then((evalResult) => {
        if (isMounted) {
          setEvaluation(evalResult);
          setIsEvaluating(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn('[StageEvaluation] Server evaluation notice:', err.message);
          setIsEvaluating(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, caseId, stageInstance, targetStatus]);

  if (!stageInstance) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await advanceStage(caseId, stageInstance.id, {
        targetStatus,
        actualDate,
        notes,
        actorName: `${activePersona.name} (${activePersona.label})`,
        allowOverride,
        overrideJustification: allowOverride ? overrideJustification : undefined,
      });

      setIsLoading(false);
      onStageUpdated();
      onClose();
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || 'Failed to update stage');
    }
  };

  const isAdvanceBlocked = evaluation ? !evaluation.allowed && !allowOverride : false;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Statutory Stage Advancement: ${stageInstance.stage?.title}`}
      subtitle={`Stage #${stageInstance.stage?.stage_number} | Code: ${stageInstance.stage?.code || 'N/A'}`}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-red-50 p-3 border border-red-200 text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Current Info */}
        <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Current Status:</span>
            <span className="font-semibold text-gov-slate uppercase">{stageInstance.status.replace('_', ' ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Expected Timeline:</span>
            <span className="font-mono text-gov-slate">
              {stageInstance.expected_start_date} to {stageInstance.expected_end_date}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Default Duration:</span>
            <span className="font-medium text-gov-slate">{stageInstance.stage?.default_duration_days} days</span>
          </div>
        </div>

        {/* Target Action */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">Desired Stage Action</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setTargetStatus('in_progress')}
              className={`p-2.5 rounded-lg border text-center font-medium transition-all ${
                targetStatus === 'in_progress'
                  ? 'border-gov-navy bg-blue-50 text-gov-navy ring-1 ring-gov-navy'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Play className="h-4 w-4 mx-auto mb-1 text-blue-600" />
              <span>Start Stage</span>
            </button>

            <button
              type="button"
              onClick={() => setTargetStatus('completed')}
              className={`p-2.5 rounded-lg border text-center font-medium transition-all ${
                targetStatus === 'completed'
                  ? 'border-gov-emerald bg-emerald-50 text-emerald-800 ring-1 ring-gov-emerald'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <CheckCircle2 className="h-4 w-4 mx-auto mb-1 text-emerald-600" />
              <span>Complete Stage</span>
            </button>

            <button
              type="button"
              onClick={() => setTargetStatus('blocked')}
              className={`p-2.5 rounded-lg border text-center font-medium transition-all ${
                targetStatus === 'blocked'
                  ? 'border-gov-red bg-red-50 text-gov-red ring-1 ring-gov-red'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <PauseCircle className="h-4 w-4 mx-auto mb-1 text-red-600" />
              <span>Report Blocked</span>
            </button>
          </div>
        </div>

        {/* Authoritative Server-Side Statutory Advancement Checklist */}
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
          <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <ListChecks className="h-4 w-4 text-gov-navy" />
              <span>Statutory Advancement Verification Checklist</span>
            </div>
            {isEvaluating ? (
              <span className="text-[11px] text-slate-500 animate-pulse">Evaluating server guards...</span>
            ) : evaluation ? (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  evaluation.allowed
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {evaluation.allowed ? (
                  <>
                    <ShieldCheck className="h-3 w-3" />
                    <span>Statutory Guards Satisfied</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-3 w-3" />
                    <span>Statutory Preconditions Unmet</span>
                  </>
                )}
              </span>
            ) : null}
          </div>

          <div className="p-3 space-y-3">
            {/* 1. Authorization Status */}
            <div>
              <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                1. Authorization & Role Verification
              </div>
              {evaluation?.checklist.authorization ? (
                <div
                  className={`p-2 rounded-md flex items-center justify-between text-xs ${
                    evaluation.checklist.authorization.is_authorized
                      ? 'bg-emerald-50/70 border border-emerald-200 text-emerald-900'
                      : 'bg-red-50/70 border border-red-200 text-red-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {evaluation.checklist.authorization.is_authorized ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                    )}
                    <span>
                      Actor Role: <strong className="font-mono">{activePersona.role}</strong>
                      {stageInstance.stage?.required_role && (
                        <span>
                          {' '}| Required Role: <strong className="font-mono">{stageInstance.stage.required_role}</strong>
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="font-medium text-[11px]">
                    {evaluation.checklist.authorization.is_authorized ? 'Authorized' : 'Unauthorized'}
                  </span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">
                  Role: <strong className="font-mono">{activePersona.role}</strong>
                </div>
              )}
            </div>

            {/* 2. Prerequisite Dependencies */}
            {evaluation?.checklist.dependencies && evaluation.checklist.dependencies.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  2. Workflow Dependencies (DAG Prerequisites)
                </div>
                <div className="space-y-1">
                  {evaluation.checklist.dependencies.map((dep, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded-md flex items-center justify-between text-xs ${
                        dep.is_satisfied
                          ? 'bg-emerald-50/70 border border-emerald-200 text-emerald-900'
                          : 'bg-red-50/70 border border-red-200 text-red-900'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {dep.is_satisfied ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                        )}
                        <span>{dep.stage_title}</span>
                      </div>
                      <span className="font-mono text-[11px] uppercase">{dep.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Mandatory Statutory Documents */}
            <div>
              <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                3. Mandatory Statutory Documents
              </div>
              {evaluation?.checklist.documents && evaluation.checklist.documents.length > 0 ? (
                <div className="space-y-1">
                  {evaluation.checklist.documents.map((doc, idx) => {
                    const isVerified = doc.status === 'verified';
                    const isPending = doc.status === 'pending_verification';
                    const isRejected = doc.status === 'rejected';
                    const isMissing = doc.status === 'missing';

                    return (
                      <div
                        key={idx}
                        className={`p-2 rounded-md flex items-center justify-between text-xs border ${
                          isVerified
                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                            : isPending
                            ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                            : 'bg-red-50/70 border-red-200 text-red-900'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {isVerified && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                          {isPending && <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                          {(isRejected || isMissing) && <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                          <div>
                            <span className="font-mono font-medium">{doc.document_type}</span>
                            {doc.detail && <p className="text-[10px] opacity-80">{doc.detail}</p>}
                          </div>
                        </div>
                        <span
                          className={`font-semibold text-[10px] px-1.5 py-0.5 rounded uppercase ${
                            isVerified
                              ? 'bg-emerald-100 text-emerald-800'
                              : isPending
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {isVerified ? '✓ Verified' : isPending ? '○ Pending' : isRejected ? '✕ Rejected' : '✕ Missing'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 italic p-1">
                  No mandatory statutory documents configured for this stage.
                </div>
              )}
            </div>

            {/* 4. Completion Criteria */}
            {evaluation?.checklist.completion_criteria && evaluation.checklist.completion_criteria.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  4. Statutory Completion Criteria
                </div>
                <div className="space-y-1">
                  {evaluation.checklist.completion_criteria.map((crit, idx) => {
                    const isSat = crit.status === 'satisfied';
                    const isConfirm = crit.status === 'requires_officer_confirmation';
                    const isUnsat = crit.status === 'unsatisfied';

                    return (
                      <div
                        key={idx}
                        className={`p-2 rounded-md flex items-center justify-between text-xs border ${
                          isSat
                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                            : isConfirm
                            ? 'bg-blue-50/70 border-blue-200 text-blue-900'
                            : 'bg-red-50/70 border-red-200 text-red-900'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {isSat && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                          {isConfirm && <Info className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                          {isUnsat && <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                          <div>
                            <span className="font-medium">{crit.criterion}</span>
                            <p className="text-[10px] opacity-80">{crit.description}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-semibold uppercase">
                          {isSat ? 'Satisfied' : isConfirm ? 'Officer Confirmation' : 'Unsatisfied'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Blocking Reasons Summary if blocked */}
            {evaluation && !evaluation.allowed && (
              <div className="rounded-md bg-amber-50 p-2.5 border border-amber-200 text-amber-900">
                <div className="flex items-center gap-1.5 font-semibold text-amber-950 mb-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span>Advancement Preconditions Blocking Completion:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                  {evaluation.blockingRequirements.map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Statutory Waiver / Administrative Override Section */}
          <div className="p-3 border-t border-slate-200 bg-slate-50/60">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
              <input
                type="checkbox"
                checked={allowOverride}
                onChange={(e) => setAllowOverride(e.target.checked)}
                className="rounded text-gov-navy focus:ring-gov-navy"
              />
              <span>Apply Authorized Statutory Waiver / Administrative Override</span>
            </label>

            {allowOverride && (
              <div className="mt-2.5 space-y-1">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Substantive Statutory Justification & Legal Reference <span className="text-red-500">* (minimum 10 characters)</span>
                </label>
                <input
                  type="text"
                  value={overrideJustification}
                  onChange={(e) => setOverrideJustification(e.target.value)}
                  required={allowOverride}
                  placeholder="e.g. Statutory exemption granted under Collector Order No. 2026/LAO/EX-04 citing urgency clause Section 40"
                  className="w-full rounded-md border border-slate-300 p-2 text-xs bg-white focus:outline-none focus:border-gov-navy"
                />
                <p className="text-[10px] text-slate-500">
                  Supervisory waiver will be permanently recorded in the immutable audit ledger with your identity and timestamp.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Execution Date */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Action / Execution Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={actualDate}
            onChange={(e) => setActualDate(e.target.value)}
            required
            className="w-full rounded-md border border-slate-200 p-2 text-xs focus:border-gov-navy focus:outline-none"
          />
        </div>

        {/* Notes / Reason */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Official Notes / Gazette Reference / Reason</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Gazette notification published under No. 442/LAO; hearing schedule gazetted for next Monday."
            className="w-full rounded-md border border-slate-200 p-2 text-xs focus:border-gov-navy focus:outline-none"
          />
        </div>

        {/* Signer Identity */}
        <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between items-center">
          <div>
            Action will be recorded in audit ledger by:
            <strong className="text-gov-slate block mt-0.5">{activePersona.name} ({activePersona.label})</strong>
          </div>
          <span className="font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600">
            Role: {activePersona.role}
          </span>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={isLoading}
            disabled={isAdvanceBlocked && !allowOverride}
          >
            Commit Stage Transition
          </Button>
        </div>
      </form>
    </Modal>
  );
};

