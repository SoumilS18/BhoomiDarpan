import React, { useState, useEffect } from 'react';
import {
  fetchNotifications,
  fetchNotificationCounts,
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
} from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import {
  Bell,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  ArrowUpRight,
  ShieldAlert,
  Send,
  X,
  ChevronDown,
  ChevronUp,
  FileCheck,
  UserCheck,
  Zap,
} from 'lucide-react';
import { clsx } from 'clsx';
import { formatDate } from '../lib/utils';

interface NotificationsPageProps {
  onSelectCase: (caseId: string, tab?: string) => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ onSelectCase }) => {
  const { activePersona } = useAuth();
  const [notifications, setNotifications] = useState<CaseNotification[]>([]);
  const [counts, setCounts] = useState<NotificationCounts | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>('active');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');

  // Progressive disclosure for evidence
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null);

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

      const [listRes, countsRes] = await Promise.all([
        fetchNotifications({
          status: statusParam,
          severity: severityParam,
          event_type: eventTypeParam,
          limit: 100,
        }),
        fetchNotificationCounts(),
      ]);

      let items = listRes.notifications || [];
      if (selectedStatus === 'active') {
        items = items.filter((n) => n.status === 'unread' || n.status === 'acknowledged');
      }

      setNotifications(items);
      setCounts(countsRes.counts);
    } catch (err: any) {
      setError(err.message || 'Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedStatus, selectedSeverity, selectedEventType]);

  const handleAcknowledge = async (notif: CaseNotification) => {
    try {
      await acknowledgeNotification(notif.id, activePersona.name);
      loadData();
    } catch (err: any) {
      alert(`Failed to acknowledge alert: ${err.message}`);
    }
  };

  const handleOpenActionDialog = (type: 'resolve' | 'dismiss' | 'escalate', notification: CaseNotification) => {
    setActionDialog({ type, notification });
    setActionInput('');
  };

  const handleExecuteAction = async () => {
    if (!actionDialog) return;
    const { type, notification } = actionDialog;
    setActionSubmitting(true);
    try {
      if (type === 'resolve') {
        await resolveNotification(notification.id, actionInput || 'Intervention recorded', activePersona.name);
      } else if (type === 'dismiss') {
        if (!actionInput.trim()) {
          alert('A mandatory justification note is required to dismiss statutory alerts.');
          setActionSubmitting(false);
          return;
        }
        await dismissNotification(notification.id, actionInput, activePersona.name);
      } else if (type === 'escalate') {
        await escalateNotification(notification.id, actionInput || 'Escalated by officer');
      }
      setActionDialog(null);
      loadData();
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleTriggerEvaluation = async () => {
    setIsEvaluating(true);
    try {
      const res = await triggerNotificationEvaluation();
      alert(`Evaluation complete: ${res.evaluated_cases} cases checked, ${res.generated_or_updated_count} signals updated.`);
      loadData();
    } catch (err: any) {
      alert(`Evaluation failed: ${err.message}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  const getSeverityBadge = (severity: NotificationSeverity) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="red">CRITICAL ACTION</Badge>;
      case 'urgent':
        return <Badge variant="amber">URGENT</Badge>;
      case 'warning':
        return <Badge variant="navy">WARNING</Badge>;
      case 'info':
      default:
        return <Badge variant="slate">INFORMATIONAL</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gov-navy bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
              Operational Triage
            </span>
            <span className="text-xs text-slate-300">•</span>
            <span className="text-[11px] text-slate-500">
              SLA Triggers &amp; Escalation Ledger
            </span>
          </div>
          <h1 className="text-xl font-bold text-gov-slate tracking-tight">
            Statutory Notification &amp; Escalation Center
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational triage desk for SLA breaches, missing statutory documents, disputed parcels, and multi-tier institutional escalations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleTriggerEvaluation}
            isLoading={isEvaluating}
            leftIcon={<Zap className="h-3.5 w-3.5 text-amber-300" />}
          >
            Evaluate Triggers
          </Button>
        </div>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => setSelectedStatus('active')}
          className={clsx(
            'p-4 rounded-xl border bg-white cursor-pointer transition-all shadow-xs',
            selectedStatus === 'active' ? 'ring-2 ring-gov-navy border-gov-navy' : 'border-slate-200'
          )}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Active Alerts</span>
            <Bell className="h-4 w-4 text-gov-navy" />
          </div>
          <div className="mt-2 text-2xl font-bold text-gov-slate tabular-nums">
            {(counts?.unread_count || 0) + (counts?.acknowledged_count || 0)}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Unread + Acknowledged</p>
        </div>

        <div
          onClick={() => setSelectedSeverity('critical')}
          className={clsx(
            'p-4 rounded-xl border bg-white cursor-pointer transition-all shadow-xs',
            selectedSeverity === 'critical' ? 'ring-2 ring-red-600 border-red-600' : 'border-slate-200'
          )}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span className="text-gov-red">Critical Severity</span>
            <AlertOctagon className="h-4 w-4 text-gov-red" />
          </div>
          <div className="mt-2 text-2xl font-bold text-gov-red tabular-nums">
            {counts?.critical_count || 0}
          </div>
          <p className="text-[10px] text-red-600 mt-0.5">Immediate intervention</p>
        </div>

        <div
          onClick={() => setSelectedSeverity('urgent')}
          className={clsx(
            'p-4 rounded-xl border bg-white cursor-pointer transition-all shadow-xs',
            selectedSeverity === 'urgent' ? 'ring-2 ring-amber-600 border-amber-600' : 'border-slate-200'
          )}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span className="text-amber-700">Urgent Priority</span>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
            {counts?.urgent_count || 0}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">SLA buffer warning</p>
        </div>

        <div
          onClick={() => setSelectedStatus('resolved')}
          className={clsx(
            'p-4 rounded-xl border bg-white cursor-pointer transition-all shadow-xs',
            selectedStatus === 'resolved' ? 'ring-2 ring-emerald-600 border-emerald-600' : 'border-slate-200'
          )}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span className="text-emerald-700">Resolved</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">
            {counts?.resolved_count || 0}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Intervention recorded</p>
        </div>

        <div
          onClick={() => setSelectedStatus('dismissed')}
          className={clsx(
            'p-4 rounded-xl border bg-white cursor-pointer transition-all shadow-xs',
            selectedStatus === 'dismissed' ? 'ring-2 ring-slate-600 border-slate-600' : 'border-slate-200'
          )}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Dismissed</span>
            <Clock className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-600 tabular-nums">
            {counts?.dismissed_count || 0}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Justified overrides</p>
        </div>
      </div>

      {/* Filter Ribbon */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px]">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-gov-slate"
            >
              <option value="active">Active (Unread + Ack)</option>
              <option value="unread">Unread Only</option>
              <option value="acknowledged">Acknowledged Only</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
              <option value="all">All Records</option>
            </select>
          </div>

          {/* Severity filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px]">Severity:</span>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-gov-slate"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Event type filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px]">Event Type:</span>
            <select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-gov-slate"
            >
              <option value="all">All Event Types</option>
              <option value="sla_breach">SLA Breach</option>
              <option value="sla_warning">SLA Warning</option>
              <option value="critical_risk">Critical Risk</option>
              <option value="unverified_docs">Unverified Documents</option>
              <option value="dispute_filed">Dispute Filed</option>
              <option value="bottleneck_detected">Bottleneck Detected</option>
            </select>
          </div>
        </div>

        <span className="text-[11px] text-slate-500">
          Showing <strong>{notifications.length}</strong> operational alerts
        </span>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {notifications.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-xs">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
            <h4 className="font-bold text-gov-slate text-sm">No Active Operational Alerts</h4>
            <p className="text-slate-500 mt-1 max-w-md mx-auto">
              All statutory proceedings are currently progressing within policy thresholds.
            </p>
          </div>
        ) : (
          notifications.map((notif) => {
            const isEvidenceExpanded = expandedEvidenceId === notif.id;

            return (
              <div
                key={notif.id}
                className={clsx(
                  'bg-white rounded-xl border p-4 shadow-xs transition-all hover:border-slate-300',
                  notif.severity === 'critical'
                    ? 'border-l-4 border-l-red-600'
                    : notif.severity === 'urgent'
                    ? 'border-l-4 border-l-amber-500'
                    : 'border-l-4 border-l-blue-500'
                )}
              >
                <div className="flex flex-col md:flex-row items-start justify-between gap-4 text-xs">
                  {/* Left: Metadata & Description */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getSeverityBadge(notif.severity)}
                      <span className="font-mono text-[10px] text-slate-500 uppercase bg-slate-50 px-2 py-0.5 rounded border">
                        {notif.event_type.replace(/_/g, ' ')}
                      </span>
                      {(notif.escalation_level ?? 0) > 0 && (
                        <span className="font-bold text-[10px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                          Tier {notif.escalation_level} Escalation
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">
                        {formatDate(notif.created_at)}
                      </span>
                    </div>

                    <h4 className="font-bold text-gov-slate text-sm">
                      {notif.title}
                    </h4>

                    <p className="text-slate-600 text-xs leading-relaxed max-w-3xl">
                      {notif.message}
                    </p>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
                      {notif.case_id && (
                        <button
                          type="button"
                          onClick={() => onSelectCase(notif.case_id!)}
                          className="font-semibold text-gov-navy hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Case Workspace</span>
                          <ArrowUpRight className="h-3 w-3" />
                        </button>
                      )}
                      <span>Assigned Role: <strong>{notif.recipient_role || 'LAO'}</strong></span>
                      {notif.status && (
                        <span className="capitalize text-[10px] font-mono text-slate-400">
                          State: {notif.status}
                        </span>
                      )}
                    </div>

                    {/* Trigger Evidence Drawer */}
                    {notif.evidence && notif.evidence.length > 0 && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedEvidenceId(isEvidenceExpanded ? null : notif.id)
                          }
                          className="text-[11px] font-semibold text-slate-500 hover:text-gov-slate inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Inspect Trigger Evidence</span>
                          {isEvidenceExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>

                        {isEvidenceExpanded && (
                          <pre className="mt-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-[10px] font-mono text-slate-700 overflow-x-auto max-h-48">
                            {JSON.stringify(notif.evidence, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: Operational Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    {notif.status === 'unread' && (
                      <button
                        type="button"
                        onClick={() => handleAcknowledge(notif)}
                        className="px-2.5 py-1.5 text-xs font-semibold text-gov-slate bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        Acknowledge
                      </button>
                    )}

                    {(notif.status === 'unread' || notif.status === 'acknowledged') && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenActionDialog('resolve', notif)}
                          className="px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition-colors cursor-pointer"
                        >
                          Resolve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenActionDialog('escalate', notif)}
                          className="px-2.5 py-1.5 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-lg shadow-xs transition-colors cursor-pointer"
                        >
                          Escalate
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenActionDialog('dismiss', notif)}
                          className="px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-red-700 transition-colors cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Action Dialog Modal */}
      {actionDialog && (
        <Modal
          isOpen={true}
          onClose={() => setActionDialog(null)}
          title={
            actionDialog.type === 'resolve'
              ? 'Resolve Operational Alert'
              : actionDialog.type === 'dismiss'
              ? 'Dismiss Alert (Mandatory Justification)'
              : 'Escalate Alert to Superior Authority'
          }
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-600">
              {actionDialog.type === 'resolve'
                ? 'Record the corrective operational action taken to resolve this friction.'
                : actionDialog.type === 'dismiss'
                ? 'Statutory compliance requires a valid reason before dismissing automated triggers.'
                : 'Escalates this alert to the next supervisory tier and notifies the Competent Authority.'}
            </p>

            <div>
              <label className="block font-semibold text-gov-slate mb-1">
                {actionDialog.type === 'dismiss' ? 'Mandatory Justification Note *' : 'Action Notes / Outcome'}
              </label>
              <textarea
                value={actionInput}
                onChange={(e) => setActionInput(e.target.value)}
                placeholder={
                  actionDialog.type === 'dismiss'
                    ? 'Enter reason for dismissal (e.g., High Court granted extension, surveyor verified boundary)...'
                    : 'Notes on intervention taken...'
                }
                rows={3}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-gov-navy"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setActionDialog(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                isLoading={actionSubmitting}
                onClick={handleExecuteAction}
              >
                Confirm {actionDialog.type.toUpperCase()}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
