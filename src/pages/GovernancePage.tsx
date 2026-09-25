import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Sliders,
  Bell,
  RefreshCw,
  Check,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileCheck,
  TrendingUp,
  ArrowUpRight,
  Send,
  X,
} from 'lucide-react';
import {
  fetchNotifications,
  fetchNotificationCounts,
  fetchPolicies,
  acknowledgeNotification,
  resolveNotification,
  dismissNotification,
  escalateNotification,
  triggerNotificationEvaluation,
} from '../lib/api';
import {
  CaseNotification,
  NotificationCounts,
  NotificationSeverity,
  NotificationEventType,
  SystemPolicy,
} from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';

/** Addressable views of the governance surface (`/governance/:view`). */
export type GovernanceView = 'alerts' | 'policies';

const GOVERNANCE_VIEWS: GovernanceView[] = ['alerts', 'policies'];

interface GovernancePageProps {
  onSelectCase: (caseId: string) => void;
  /** View requested by the current URL. */
  view?: string;
  onViewChange: (view: GovernanceView) => void;
}

export const GovernancePage: React.FC<GovernancePageProps> = ({
  onSelectCase,
  view,
  onViewChange,
}) => {
  const { activePersona } = useAuth();
  const [notifications, setNotifications] = useState<CaseNotification[]>([]);
  const [counts, setCounts] = useState<NotificationCounts | null>(null);
  const [policies, setPolicies] = useState<SystemPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>('active');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  // Derived from the URL, so `/governance/alerts` and `/governance/policies`
  // are individually addressable.
  const activeTab: GovernanceView = GOVERNANCE_VIEWS.includes(view as GovernanceView)
    ? (view as GovernanceView)
    : 'alerts';
  const setActiveTab = (next: GovernanceView) => onViewChange(next);

  // Evidence expansion
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null);
  const [expandedPolicyId, setExpandedPolicyId] = useState<string | null>(null);

  // Action Dialog States
  const [actionDialog, setActionDialog] = useState<{
    type: 'resolve' | 'dismiss' | 'escalate';
    notification: CaseNotification;
  } | null>(null);
  const [actionInput, setActionInput] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const statusParam =
        selectedStatus === 'active' ? undefined : selectedStatus === 'all' ? undefined : selectedStatus;
      const severityParam = selectedSeverity === 'all' ? undefined : selectedSeverity;
      const eventTypeParam = selectedEventType === 'all' ? undefined : selectedEventType;

      const [listRes, countsRes, policiesRes] = await Promise.all([
        fetchNotifications({
          status: statusParam,
          severity: severityParam,
          event_type: eventTypeParam,
          limit: 100,
        }),
        fetchNotificationCounts(),
        fetchPolicies(),
      ]);

      let items = listRes.notifications || [];
      if (selectedStatus === 'active') {
        items = items.filter((n) => n.status === 'unread' || n.status === 'acknowledged');
      }

      setNotifications(items);
      setCounts(countsRes.counts);
      setPolicies(policiesRes.policies || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load governance data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedStatus, selectedSeverity, selectedEventType, activePersona.role]);

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledgeNotification(id, activePersona.name);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, status: 'acknowledged', acknowledged_at: new Date().toISOString(), acknowledged_by: activePersona.name }
            : n
        )
      );
      if (counts) {
        setCounts({
          ...counts,
          unread_count: Math.max(0, counts.unread_count - 1),
          acknowledged_count: counts.acknowledged_count + 1,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to acknowledge alert');
    }
  };

  const handleExecuteAction = async () => {
    if (!actionDialog) return;
    setActionSubmitting(true);
    try {
      const notif = actionDialog.notification;
      if (actionDialog.type === 'resolve') {
        await resolveNotification(notif.id, actionInput || 'Remediation completed by authorized officer.', activePersona.name);
      } else if (actionDialog.type === 'dismiss') {
        await dismissNotification(notif.id, actionInput || 'Dismissed as non-actionable upon institutional review.', activePersona.name);
      } else if (actionDialog.type === 'escalate') {
        await escalateNotification(notif.id, actionInput || 'Manual officer escalation to supervisory authority.');
      }
      setActionDialog(null);
      setActionInput('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Action execution failed');
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleTriggerEvaluation = async () => {
    setIsEvaluating(true);
    setError(null);
    try {
      await triggerNotificationEvaluation();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Trigger evaluation failed');
    } finally {
      setIsEvaluating(false);
    }
  };

  const getSeverityIcon = (severity: NotificationSeverity) => {
    switch (severity) {
      case 'urgent':
      case 'critical':
        return <AlertOctagon className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-600" />;
      default:
        return <Info className="h-4 w-4 text-blue-600" />;
    }
  };

  const getSeverityBadge = (severity: NotificationSeverity) => {
    switch (severity) {
      case 'urgent':
        return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-600 text-white shadow-2xs">URGENT</span>;
      case 'critical':
        return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">CRITICAL</span>;
      case 'warning':
        return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">WARNING</span>;
      default:
        return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">INFO</span>;
    }
  };

  const formatEventType = (type: string) => {
    return type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="space-y-5 text-gov-slate">
      {/* 1. Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gov-navy bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
              Institutional Governance
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-[11px] text-slate-500">Day 5 Policy &amp; Notification Engine</span>
          </div>
          <h2 className="text-xl font-bold text-gov-slate tracking-tight">
            Operational Governance &amp; Decision Support
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configurable institutional policy evaluation, multi-tier automated escalations, and explainable evidence verification.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTriggerEvaluation}
            disabled={isEvaluating}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isEvaluating ? 'animate-spin' : ''}`} />}
          >
            {isEvaluating ? 'Evaluating Triggers...' : 'Re-Evaluate Portfolio Triggers'}
          </Button>
        </div>
      </div>

      {/* 2. KPI Summary Ribbon */}
      {counts && (
        <div className="grid grid-cols-2 sm:grid-cols-6 divide-x divide-slate-100 rounded-xl border border-slate-200 bg-white text-center text-xs shadow-gov overflow-hidden">
          <div className="p-3.5">
            <span className="text-[10px] uppercase font-bold text-slate-400">Total Scoped</span>
            <p className="text-xl font-extrabold text-gov-slate mt-0.5">{counts.total_count}</p>
          </div>
          <div className="p-3.5 bg-red-50/40">
            <span className="text-[10px] uppercase font-bold text-red-600">Unread</span>
            <p className="text-xl font-extrabold text-red-700 mt-0.5">{counts.unread_count}</p>
          </div>
          <div className="p-3.5 bg-amber-50/30">
            <span className="text-[10px] uppercase font-bold text-amber-700">Urgent &amp; Critical</span>
            <p className="text-xl font-extrabold text-amber-800 mt-0.5">{counts.urgent_count + counts.critical_count}</p>
          </div>
          <div className="p-3.5">
            <span className="text-[10px] uppercase font-bold text-blue-600">Acknowledged</span>
            <p className="text-xl font-extrabold text-blue-700 mt-0.5">{counts.acknowledged_count}</p>
          </div>
          <div className="p-3.5">
            <span className="text-[10px] uppercase font-bold text-purple-600">Escalated</span>
            <p className="text-xl font-extrabold text-purple-700 mt-0.5">{counts.escalated_count}</p>
          </div>
          <div className="p-3.5 bg-emerald-50/40">
            <span className="text-[10px] uppercase font-bold text-emerald-600">Resolved</span>
            <p className="text-xl font-extrabold text-emerald-700 mt-0.5">{counts.resolved_count}</p>
          </div>
        </div>
      )}

      {/* 3. Section Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 gap-6 text-xs font-medium shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab('alerts')}
          className={`py-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'alerts'
              ? 'border-gov-navy text-gov-navy font-bold'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          }`}
        >
          <Bell className="h-4 w-4" />
          <span>Operational Notifications ({notifications.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('policies')}
          className={`py-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'policies'
              ? 'border-gov-navy text-gov-navy font-bold'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          }`}
        >
          <Sliders className="h-4 w-4" />
          <span>Configurable System Policies ({policies.length})</span>
        </button>
      </div>

      {/* 4. Tab 1: Operational Notifications */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedStatus('active')}
                  className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    selectedStatus === 'active' ? 'bg-white text-gov-slate font-bold shadow-2xs' : 'text-slate-600 hover:text-gov-slate'
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStatus('resolved')}
                  className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    selectedStatus === 'resolved' ? 'bg-white text-gov-slate font-bold shadow-2xs' : 'text-slate-600 hover:text-gov-slate'
                  }`}
                >
                  Resolved
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStatus('dismissed')}
                  className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    selectedStatus === 'dismissed' ? 'bg-white text-gov-slate font-bold shadow-2xs' : 'text-slate-600 hover:text-gov-slate'
                  }`}
                >
                  Dismissed
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStatus('all')}
                  className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    selectedStatus === 'all' ? 'bg-white text-gov-slate font-bold shadow-2xs' : 'text-slate-600 hover:text-gov-slate'
                  }`}
                >
                  All
                </button>
              </div>

              <select
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] text-slate-700 shadow-2xs"
              >
                <option value="all">All Severities</option>
                <option value="urgent">Urgent</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>

              <select
                value={selectedEventType}
                onChange={(e) => setSelectedEventType(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] text-slate-700 shadow-2xs"
              >
                <option value="all">All Categories</option>
                <option value="critical_risk">Critical Risk</option>
                <option value="stage_overdue">Milestone Overdue / Bottleneck</option>
                <option value="predicted_delay">Predicted Schedule Delay</option>
                <option value="blocked_dependency">Blocked Prerequisite</option>
                <option value="document_awaiting_verification">Document Awaiting Verification</option>
                <option value="cadastral_dispute">Cadastral Dispute</option>
                <option value="stale_external_data">Stale External Data</option>
                <option value="data_discrepancy">Cross-Source Discrepancy</option>
                <option value="downstream_impact">Downstream DAG Impact</option>
                <option value="unresolved_recommendation">Unimplemented Advisory</option>
              </select>
            </div>

            <div className="text-[11px] text-slate-500 font-medium">
              Scoped to role: <strong className="text-gov-navy">{activePersona.label}</strong>
            </div>
          </div>

          {/* List */}
          <div className="space-y-3">
            {isLoading ? (
              <div className="py-20 text-center space-y-3 bg-white rounded-xl border border-slate-200">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gov-navy mx-auto" />
                <p className="text-xs text-slate-500">Loading scoped operational notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-20 text-center space-y-3 bg-white rounded-xl border border-slate-200">
                <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-bold text-gov-slate">Action Queue Clear</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  No active notifications match the current filters. All statutory workflows, legal orders, and parcels are operating within policy tolerances.
                </p>
              </div>
            ) : (
              notifications.map((n) => {
                const isUnread = n.status === 'unread';
                const isAcknowledged = n.status === 'acknowledged';
                const isResolved = n.status === 'resolved';
                const isDismissed = n.status === 'dismissed';
                const isEscalated = (n.escalation_level || 0) > 0;
                const isExpanded = expandedEvidenceId === n.id;

                return (
                  <div
                    key={n.id}
                    className={`rounded-xl border transition-all p-5 shadow-xs ${
                      isUnread
                        ? 'bg-amber-50/15 border-amber-200'
                        : isResolved
                        ? 'bg-emerald-50/10 border-slate-200 opacity-90'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-1">{getSeverityIcon(n.severity)}</div>
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {getSeverityBadge(n.severity)}
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border">
                              {formatEventType(n.event_type)}
                            </span>
                            {isEscalated && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                Escalated L{n.escalation_level} ({n.escalated_to_role || n.recipient_role})
                              </span>
                            )}
                            {isAcknowledged && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                Acknowledged
                              </span>
                            )}
                            {isResolved && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                                Resolved
                              </span>
                            )}
                            {isDismissed && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                                Dismissed
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-gov-slate">{n.title}</h4>
                            {n.case_id && (
                              <button
                                onClick={() => onSelectCase(n.case_id)}
                                className="text-[11px] font-semibold text-gov-navy hover:underline flex items-center gap-0.5"
                              >
                                <span>{n.case_number || 'View Case'}</span>
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>

                          {/* Notes banners */}
                          {n.action_taken && (
                            <div className="mt-2 rounded-lg bg-emerald-50 p-2.5 border border-emerald-200 text-xs text-emerald-950">
                              <strong>Remediation Action:</strong> {n.action_taken}
                              {n.resolved_by && <span className="text-emerald-700 ml-1.5">• by {n.resolved_by}</span>}
                            </div>
                          )}
                          {n.dismissal_reason && (
                            <div className="mt-2 rounded-lg bg-slate-100 p-2.5 border border-slate-200 text-xs text-slate-700">
                              <strong>Dismissal Justification:</strong> {n.dismissal_reason}
                              {n.dismissed_by && <span className="text-slate-500 ml-1.5">• by {n.dismissed_by}</span>}
                            </div>
                          )}

                          {/* Explainability Accordion */}
                          {n.evidence && n.evidence.length > 0 && (
                            <div className="pt-2">
                              <button
                                onClick={() => setExpandedEvidenceId(isExpanded ? null : n.id)}
                                className="text-[11px] font-semibold text-gov-navy hover:text-gov-slate flex items-center gap-1 cursor-pointer"
                              >
                                <span>Why was this alert triggered? ({n.evidence.length} evidence items)</span>
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>

                              {isExpanded && (
                                <div className="mt-2 p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
                                  <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                                    Institutional Evidence &amp; Policy Ledger
                                  </div>
                                  <ul className="space-y-2 divide-y divide-slate-200/60">
                                    {n.evidence.map((ev, idx) => (
                                      <li key={ev.id || idx} className="pt-2 first:pt-0">
                                        <p className="font-medium text-slate-800">{ev.statement}</p>
                                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500">
                                          <span>Source: <strong>{ev.source}</strong></span>
                                          <span>•</span>
                                          <span>Classification: {ev.classification}</span>
                                          {ev.policy_key && (
                                            <>
                                              <span>•</span>
                                              <span className="font-mono bg-slate-200/80 px-1.5 py-0.2 rounded text-slate-700">
                                                Policy: {ev.policy_key}
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0 self-start">
                        {isUnread && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAcknowledge(n.id)}
                            leftIcon={<Check className="h-3.5 w-3.5 text-blue-600" />}
                          >
                            Acknowledge
                          </Button>
                        )}

                        {(isUnread || isAcknowledged) && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => setActionDialog({ type: 'resolve', notification: n })}
                              leftIcon={<FileCheck className="h-3.5 w-3.5 text-emerald-600" />}
                            >
                              Resolve
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setActionDialog({ type: 'escalate', notification: n })}
                              leftIcon={<ArrowUpRight className="h-3.5 w-3.5 text-purple-600" />}
                            >
                              Escalate
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setActionDialog({ type: 'dismiss', notification: n })}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              Dismiss
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Metadata Footer */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Generated: {new Date(n.created_at).toLocaleString()}
                        </span>
                        {n.acknowledged_at && (
                          <span>• Acknowledged by {n.acknowledged_by} ({new Date(n.acknowledged_at).toLocaleTimeString()})</span>
                        )}
                      </div>
                      <div>
                        Target Role Scope: <strong className="text-slate-600">{n.recipient_role}</strong>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 5. Tab 2: Configurable System Policies */}
      {activeTab === 'policies' && (
        <div className="space-y-4">
          <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 text-xs text-blue-900 leading-relaxed">
            <strong>Zero Hardcoding Architecture:</strong> All operational delay limits, composite risk weights, notification quotas, and escalation thresholds are loaded dynamically from the <code className="font-mono bg-blue-100 px-1 py-0.5 rounded">system_policies</code> database table.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {policies.map((p) => {
              const isExpanded = expandedPolicyId === p.id;
              return (
                <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="font-mono text-[10px] font-bold text-gov-navy bg-blue-50 px-2 py-0.5 rounded border border-blue-200 uppercase">
                        {p.category}
                      </span>
                      <h4 className="text-sm font-bold text-gov-slate mt-1.5">{p.title}</h4>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      v{new Date(p.updated_at).toLocaleDateString()}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed">{p.description}</p>

                  <div>
                    <button
                      onClick={() => setExpandedPolicyId(isExpanded ? null : p.id)}
                      className="text-[11px] font-semibold text-gov-navy hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>{isExpanded ? 'Hide Parameters' : 'Inspect Policy Thresholds'}</span>
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>

                    {isExpanded && (
                      <pre className="mt-2 p-3 bg-slate-900 text-amber-300 rounded-lg text-[11px] font-mono overflow-x-auto">
                        {JSON.stringify(p.config_value, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Dialog Modal */}
      {actionDialog && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="text-sm font-bold text-gov-slate">
                {actionDialog.type === 'resolve' && 'Resolve Operational Alert'}
                {actionDialog.type === 'dismiss' && 'Dismiss Operational Alert'}
                {actionDialog.type === 'escalate' && 'Escalate to Supervisory Authority'}
              </h4>
              <button
                onClick={() => setActionDialog(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold text-gov-slate">{actionDialog.notification.title}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                {actionDialog.type === 'resolve' && 'Please record the concrete administrative or operational remediation taken.'}
                {actionDialog.type === 'dismiss' && 'Provide statutory justification for dismissing this operational notification.'}
                {actionDialog.type === 'escalate' && 'Provide reason for elevating this alert to the next institutional tier.'}
              </p>
            </div>

            <textarea
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              placeholder={
                actionDialog.type === 'resolve'
                  ? 'e.g., Scheduled joint cadastral survey with revenue inspector on survey no. 142.'
                  : actionDialog.type === 'dismiss'
                  ? 'e.g., Non-critical buffer zone variance verified as within tolerance.'
                  : 'e.g., Milestone SLA breach exceeds 15 days without project officer response.'
              }
              rows={3}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-1 focus:ring-gov-navy focus:border-gov-navy"
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setActionDialog(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleExecuteAction}
                disabled={actionSubmitting}
                leftIcon={actionDialog.type === 'resolve' ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              >
                {actionSubmitting
                  ? 'Submitting...'
                  : actionDialog.type === 'resolve'
                  ? 'Confirm Resolution'
                  : actionDialog.type === 'dismiss'
                  ? 'Confirm Dismissal'
                  : 'Confirm Escalation'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
