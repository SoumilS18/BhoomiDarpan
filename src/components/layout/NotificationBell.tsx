import React, { useState, useEffect } from 'react';
import {
  Bell,
  Check,
  Clock,
  AlertTriangle,
  AlertOctagon,
  Info,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { fetchNotifications, acknowledgeNotification } from '../../lib/api';
import { CaseNotification } from '../../../shared/types';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { NotificationCenterModal } from '../governance/NotificationCenterModal';

interface NotificationBellProps {
  onSelectCase?: (caseId: string) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ onSelectCase }) => {
  const { activePersona } = useAuth();
  const [notifications, setNotifications] = useState<CaseNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetchNotifications({ limit: 15 });
      setNotifications(res.notifications || []);
      setUnreadCount(res.unread_count || 0);
    } catch (err) {
      console.warn('Could not load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();

    // 1. Polling fallback (every 30s)
    const interval = setInterval(loadNotifications, 30_000);

    // 2. Authoritative Realtime event invalidation bus (Supabase Realtime)
    let channel: any = null;
    if (supabase) {
      try {
        channel = supabase
          .channel('public:case_notifications')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'case_notifications' },
            () => {
              // Realtime signal received: fetch authoritative data from server API
              loadNotifications();
            }
          )
          .subscribe();
      } catch (err) {
        console.warn('[NotificationBell] Supabase Realtime subscription error:', err);
      }
    }

    return () => {
      clearInterval(interval);
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [activePersona.role]);

  const handleAcknowledge = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await acknowledgeNotification(id, activePersona.name);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status: 'acknowledged' } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const getSeverityIcon = (severity: string) => {
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

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'critical':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'warning':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const hasUrgentAlert = notifications.some(
    (n) => n.status === 'unread' && (n.severity === 'urgent' || n.severity === 'critical')
  );

  return (
    <>
      <div className="relative">
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) loadNotifications();
          }}
          className={`relative p-2 rounded-lg border bg-[#FFFDF9] hover:bg-sand-100/60 transition-colors shadow-2xs cursor-pointer ${
            hasUrgentAlert
              ? 'border-sienna-300 text-sienna-700 animate-pulse'
              : 'border-sand-200 text-mocha-600 hover:text-mocha-900'
          }`}
          title="Institutional Notifications & Operational Alerts"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className={`absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-[#FFFDF9] ${
                hasUrgentAlert ? 'bg-sienna-500' : 'bg-terra-700'
              }`}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-[#FFFDF9] border border-sand-200 shadow-2xl z-40 py-2 divide-y divide-sand-100 animate-in fade-in zoom-in-95 duration-150 text-mocha-900">
              {/* Header */}
              <div className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-mocha-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-terra-700" />
                    <span>Operational Alerts</span>
                  </h4>
                  <p className="text-[11px] text-mocha-500">
                    Role: <span className="font-semibold text-terra-800">{activePersona.label}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadNotifications}
                    disabled={loading}
                    className="text-[11px] text-terra-700 hover:underline disabled:opacity-50 cursor-pointer"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setIsModalOpen(true);
                    }}
                    className="text-[11px] font-semibold text-terra-800 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Full View</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-2">
                      <Check className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-semibold text-slate-700">No active alerts</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      All statutory milestones and workflows are operating within configured tolerances.
                    </p>
                  </div>
                ) : (
                  notifications.map((n) => {
                    const isUnread = n.status === 'unread';
                    return (
                      <div
                        key={n.id}
                        className={`px-4 py-3 hover:bg-slate-50/80 transition-colors ${
                          isUnread ? 'bg-amber-50/20' : 'opacity-80'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5">{getSeverityIcon(n.severity)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${getSeverityBadge(
                                  n.severity
                                )}`}
                              >
                                {n.severity}
                              </span>
                              {n.case_number && (
                                <span className="text-[10px] font-semibold text-gov-navy bg-slate-100 px-1.5 py-0.2 rounded">
                                  {n.case_number}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 flex items-center gap-0.5 ml-auto">
                                <Clock className="h-2.5 w-2.5" />
                                {new Date(n.created_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>

                            <p className="text-xs font-semibold text-gov-slate mt-1 leading-snug">
                              {n.title}
                            </p>
                            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                              {n.message}
                            </p>

                            {/* Acknowledge button */}
                            <div className="mt-2 flex items-center justify-between">
                              {n.case_id && onSelectCase ? (
                                <button
                                  onClick={() => {
                                    setIsOpen(false);
                                    onSelectCase(n.case_id);
                                  }}
                                  className="text-[10px] text-gov-navy font-semibold hover:underline flex items-center gap-0.5"
                                >
                                  <span>Inspect</span>
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </button>
                              ) : <span />}

                              {isUnread && (
                                <button
                                  onClick={(e) => handleAcknowledge(n.id, e)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs transition-colors cursor-pointer"
                                >
                                  <Check className="h-3 w-3 text-emerald-600" />
                                  <span>Acknowledge</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 bg-slate-50 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Realtime &amp; Policy Monitored</span>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setIsModalOpen(true);
                  }}
                  className="font-bold text-gov-navy hover:underline flex items-center gap-1"
                >
                  <span>Open Governance Center</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Full Governance Modal */}
      <NotificationCenterModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectCase={onSelectCase}
      />
    </>
  );
};
