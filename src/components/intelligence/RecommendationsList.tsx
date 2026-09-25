import React, { useState } from 'react';
import { Recommendation } from '../../../shared/types';
import { Badge } from '../common/Badge';
import {
  Lightbulb,
  Check,
  X,
  CheckCheck,
  ShieldCheck,
  Sparkles,
  Cpu,
  User,
  ChevronDown,
  ChevronUp,
  Clock,
  Play,
} from 'lucide-react';
import { api } from '../../lib/api';

interface RecommendationsListProps {
  recommendations: Recommendation[];
  onRecommendationUpdated?: () => void;
}

export const RecommendationsList: React.FC<RecommendationsListProps> = ({
  recommendations,
  onRecommendationUpdated,
}) => {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [savedDays, setSavedDays] = useState<number>(0);
  const [completionNotes, setCompletionNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!recommendations || recommendations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs">
        <ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
        <h4 className="font-bold text-gov-slate text-sm">No Corrective Interventions Pending</h4>
        <p className="text-slate-500 mt-1 max-w-md mx-auto">
          Case operations are proceeding within statutory bounds. The advisory engine generates interventions when delays, documentation friction, or cadastral disputes are detected.
        </p>
      </div>
    );
  }

  const [postDelayDays, setPostDelayDays] = useState<number>(0);

  const handleStatusChange = async (
    recId: string,
    newStatus: 'proposed' | 'accepted' | 'rejected' | 'implemented' | 'completed',
    observedImpact?: { delay_reduction_days?: number; post_intervention_delay_days?: number; completion_notes?: string }
  ) => {
    try {
      setUpdatingId(recId);
      setErrorMsg(null);
      const rec = recommendations.find((r) => r.id === recId);
      await api.updateRecommendationStatus(rec?.case_id || '', recId, {
        status: newStatus,
        observed_impact: observedImpact
          ? {
              recorded_at: new Date().toISOString(),
              delay_reduction_days: Number(observedImpact.delay_reduction_days || 0),
              post_intervention_delay_days: Number(observedImpact.post_intervention_delay_days || 0),
              completion_notes: observedImpact.completion_notes,
            }
          : undefined,
      });
      if (onRecommendationUpdated) {
        onRecommendationUpdated();
      }
      setCompletingId(null);
    } catch (err: any) {
      console.error('Failed to update recommendation status:', err);
      setErrorMsg(err.message || 'Failed to update recommendation decision');
    } finally {
      setUpdatingId(null);
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return <Badge variant="red">CRITICAL ACTION</Badge>;
      case 'elevated':
        return <Badge variant="amber">ELEVATED PRIORITY</Badge>;
      default:
        return <Badge variant="navy">ROUTINE ADVISORY</Badge>;
    }
  };

  const getStatusBadge = (status?: string, isImplemented?: boolean) => {
    if (status === 'completed') {
      return (
        <span className="flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
          <CheckCheck className="h-3 w-3" /> Outcome Recorded
        </span>
      );
    }
    if (status === 'implemented') {
      return (
        <span className="flex items-center gap-1 font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-[11px]">
          <Play className="h-3 w-3" /> Implemented (In Progress)
        </span>
      );
    }
    if (status === 'accepted') {
      return (
        <span className="flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[11px]">
          <Check className="h-3 w-3" /> Accepted by Officer
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="flex items-center gap-1 font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px]">
          <X className="h-3 w-3" /> Dismissed
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px]">
        <Clock className="h-3 w-3" /> Proposed Advisory
      </span>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <h4 className="text-xs font-bold text-gov-slate uppercase tracking-wider">
            Corrective Interventions & Advisory Actions ({recommendations.length})
          </h4>
        </div>
        <span className="text-[11px] text-slate-500">
          Ranked by urgency • Closed-loop lifecycle: Proposed → Accepted → Implemented → Observed Outcome
        </span>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs">
          {errorMsg}
        </div>
      )}

      <div className="space-y-3">
        {recommendations.map((rec) => {
          const isExpanded = expandedId === rec.id;
          const isUpdating = updatingId === rec.id;
          const status = rec.status || 'proposed';

          return (
            <div
              key={rec.id}
              className={`bg-white rounded-xl border transition-all text-xs space-y-3 p-4.5 ${
                status === 'completed'
                  ? 'border-emerald-200 bg-emerald-50/20'
                  : status === 'implemented'
                  ? 'border-indigo-200 bg-indigo-50/10'
                  : status === 'rejected'
                  ? 'border-slate-200 opacity-60'
                  : status === 'accepted'
                  ? 'border-blue-300 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h5 className="font-bold text-gov-slate text-sm">{rec.title}</h5>
                    {getUrgencyBadge(rec.urgency)}
                    {getStatusBadge(rec.status, rec.is_implemented)}
                  </div>
                  <p className="text-slate-600 text-xs leading-relaxed">{rec.description}</p>
                </div>

                <div className="flex items-center gap-2 self-start">
                  {rec.source === 'ai' ? (
                    <span className="flex items-center gap-1 font-mono text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
                      <Sparkles className="h-3 w-3" /> AI Diagnostic
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 font-mono text-[10px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded">
                      <Cpu className="h-3 w-3" /> Statutory Rule
                    </span>
                  )}
                  <span className="font-mono text-[11px] font-bold text-gov-navy bg-slate-100 px-2 py-0.5 rounded">
                    {Math.round(rec.confidence * 100)}% Conf.
                  </span>
                </div>
              </div>

              {/* Impact and Stakeholder bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[11px]">
                <div>
                  <strong className="text-gov-slate">Projected Recovery:</strong>{' '}
                  <span className="text-emerald-700 font-medium">{rec.expected_impact}</span>
                </div>
                {rec.responsible_stakeholder && (
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    <span>
                      <strong className="text-gov-slate">Assigned Authority:</strong>{' '}
                      {rec.responsible_stakeholder}
                    </span>
                  </div>
                )}
              </div>

              {/* Observed Outcome Display (when completed) */}
              {status === 'completed' && rec.observed_impact && (
                <div className="bg-emerald-50/80 p-3 rounded-lg border border-emerald-200 space-y-1.5 text-[11px] text-emerald-950">
                  <div className="flex items-center justify-between font-semibold border-b border-emerald-200/60 pb-1">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                      Observed Post-Action Outcome
                    </span>
                    <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded uppercase">
                      Evidence: {rec.observed_impact.evidence_type || 'Observed'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="text-emerald-800">Observed Delay Reduction:</span>{' '}
                      <strong className="font-mono text-emerald-900">
                        {rec.observed_impact.delay_reduction_days !== undefined
                          ? `+${rec.observed_impact.delay_reduction_days} days`
                          : 'Unavailable'}
                      </strong>
                    </div>
                    {rec.observed_impact.post_intervention_delay_days !== undefined && (
                      <div>
                        <span className="text-emerald-800">Post-Intervention Residual Delay:</span>{' '}
                        <strong className="font-mono text-emerald-900">
                          {rec.observed_impact.post_intervention_delay_days} days
                        </strong>
                      </div>
                    )}
                  </div>
                  {rec.observed_impact.completion_notes && (
                    <div className="pt-1 text-slate-700">
                      <strong>Observation Notes:</strong> {rec.observed_impact.completion_notes}
                    </div>
                  )}
                  {rec.observed_impact.recorded_at && (
                    <div className="text-[10px] text-slate-500 pt-0.5">
                      Recorded: {new Date(rec.observed_impact.recorded_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              )}

              {/* Evidence expandable section */}
              {((rec.supporting_evidence && rec.supporting_evidence.length > 0) || rec.reason) && (
                <div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                    className="flex items-center gap-1 text-[11px] font-medium text-gov-navy hover:text-gov-navy-light"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" /> Hide Supporting Evidence & Rationale
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5" /> Show Supporting Evidence & Rationale
                      </>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 p-3 bg-slate-50/80 rounded-lg border border-slate-200 space-y-2 text-[11px]">
                      {rec.expected_benefit && (
                        <div>
                          <strong className="text-gov-slate">Projected Administrative Benefit:</strong>{' '}
                          <span className="text-emerald-800 font-medium">{rec.expected_benefit}</span>
                        </div>
                      )}
                      {rec.relevant_policy && (
                        <div>
                          <strong className="text-gov-slate">Statutory Policy Applied:</strong>{' '}
                          <span className="font-mono text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">{rec.relevant_policy}</span>
                        </div>
                      )}
                      {rec.reason && (
                        <div>
                          <strong className="text-gov-slate">Diagnostic Rationale:</strong>{' '}
                          <span className="text-slate-700">{rec.reason}</span>
                        </div>
                      )}
                      {rec.supporting_evidence && rec.supporting_evidence.length > 0 && (
                        <div>
                          <strong className="text-gov-slate">Evidence Points:</strong>
                          <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-600">
                            {rec.supporting_evidence.map((ev, i) => (
                              <li key={i}>{ev}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Officer Decision Action Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <span className="text-[10px] text-slate-400 font-mono">
                  ID: {rec.id.slice(0, 8)} • Action: {rec.action_type}
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  {status === 'proposed' && (
                    <>
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleStatusChange(rec.id, 'rejected')}
                        className="px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 transition-colors"
                      >
                        Dismiss / Reject
                      </button>
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleStatusChange(rec.id, 'accepted')}
                        className="px-3 py-1 text-[11px] font-medium text-white bg-gov-navy rounded hover:bg-gov-navy-light disabled:opacity-50 shadow-sm transition-colors flex items-center gap-1"
                      >
                        <Check className="h-3 w-3" /> Accept Intervention
                      </button>
                    </>
                  )}

                  {status === 'accepted' && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleStatusChange(rec.id, 'implemented')}
                      className="px-3 py-1 text-[11px] font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-colors flex items-center gap-1"
                    >
                      <Play className="h-3 w-3" /> Mark as Implemented
                    </button>
                  )}

                  {status === 'implemented' && (
                    <>
                      {completingId === rec.id ? (
                        <div className="flex flex-wrap items-center gap-2 bg-emerald-50 p-2.5 rounded border border-emerald-200">
                          <label className="text-[10px] font-semibold text-emerald-900">
                            Observed Days Saved:
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={savedDays || ''}
                              onChange={(e) => setSavedDays(Number(e.target.value))}
                              className="ml-1 w-16 rounded border border-emerald-300 p-1 text-xs bg-white focus:outline-none"
                            />
                          </label>
                          <label className="text-[10px] font-semibold text-emerald-900">
                            Post Delay (Days):
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={postDelayDays || ''}
                              onChange={(e) => setPostDelayDays(Number(e.target.value))}
                              className="ml-1 w-16 rounded border border-emerald-300 p-1 text-xs bg-white focus:outline-none"
                            />
                          </label>
                          <input
                            type="text"
                            placeholder="Observed outcome notes & evidence"
                            value={completionNotes}
                            onChange={(e) => setCompletionNotes(e.target.value)}
                            className="w-44 rounded border border-emerald-300 p-1 text-xs bg-white focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() =>
                              handleStatusChange(rec.id, 'completed', {
                                delay_reduction_days: savedDays,
                                post_intervention_delay_days: postDelayDays,
                                completion_notes: completionNotes,
                              })
                            }
                            className="px-2.5 py-1 text-[11px] font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 shadow-sm"
                          >
                            Save Observed Outcome
                          </button>
                          <button
                            type="button"
                            onClick={() => setCompletingId(null)}
                            className="text-[10px] text-slate-500 hover:text-slate-700 underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => {
                            setCompletingId(rec.id);
                            setSavedDays(0);
                            setPostDelayDays(0);
                            setCompletionNotes('');
                          }}
                          className="px-3 py-1 text-[11px] font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-colors flex items-center gap-1"
                        >
                          <CheckCheck className="h-3 w-3" /> Record Observed Outcome
                        </button>
                      )}
                    </>
                  )}

                  {status === 'completed' && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5" /> Outcome Verified
                      </span>
                      {rec.observed_impact?.delay_reduction_days !== undefined && (
                        <span className="text-[10px] text-emerald-800 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded font-mono font-bold">
                          +{rec.observed_impact.delay_reduction_days}d Observed Savings
                        </span>
                      )}
                    </div>
                  )}

                  {status === 'rejected' && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleStatusChange(rec.id, 'proposed')}
                      className="px-2.5 py-1 text-[11px] text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
                    >
                      Reopen Advisory
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

