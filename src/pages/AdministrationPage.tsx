import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchPolicies,
  updatePolicyByKey,
  fetchAdministrationAudit,
  fetchAdminUsers,
  revokeUserAccess,
} from '../lib/api';
import { SystemPolicy, CaseEvent, UserRole, UserProfile } from '../../shared/types';
import { ROLE_LABELS, ROLE_ORDER } from '../lib/domainLabels';
import { navRoutesForRole, ROUTES } from '../router';
import { WorkflowConfigPage } from './WorkflowConfigPage';
import { IntegrationsPage } from './IntegrationsPage';
import { AccessRequestsManager } from '../components/admin/AccessRequestsManager';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import {
  Settings,
  Users,
  GitBranch,
  ShieldAlert,
  Database,
  History,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronUp,
  UserCheck,
  UserX,
  Trash2,
  Search,
  Building2,
  MapPin,
  Mail,
  X,
  Shield,
  Save,
} from 'lucide-react';
import { clsx } from 'clsx';

/** Addressable sections of the administration console (`/admin/:section`). */
export type AdminSection = 'requests' | 'users' | 'workflows' | 'policies' | 'integrations' | 'audit';

type AdminSubTab = AdminSection;

const ADMIN_SECTIONS: AdminSection[] = ['requests', 'users', 'workflows', 'policies', 'integrations', 'audit'];


/**
 * Sidebar destinations, in registry order.
 *
 * The access matrix below is DERIVED from this list crossed with each role's
 * `roles` entry in the route registry. Nothing is transcribed by hand, so the
 * table can never drift from what the sidebar actually offers. The registry
 * governs navigation visibility only — API authorisation is enforced
 * server-side on every request and is not a UI concern.
 */
const NAV_ROUTES = ROUTES.filter((route) => route.nav && route.area !== 'public');

interface AdministrationPageProps {
  /** Section requested by the current URL. */
  section?: string;
  onSectionChange: (section: AdminSection) => void;
}

export const AdministrationPage: React.FC<AdministrationPageProps> = ({
  section,
  onSectionChange,
}) => {
  const { activePersona, session } = useAuth();

  // Derived from the URL, so each console section is deep-linkable.
  const resolvedSection: AdminSubTab =
    section === 'access-requests' || section === 'requests'
      ? 'requests'
      : ADMIN_SECTIONS.includes(section as AdminSection)
      ? (section as AdminSection)
      : 'requests';
  const activeSubTab: AdminSubTab = resolvedSection;
  const setActiveSubTab = (next: AdminSubTab) => onSectionChange(next);


  // Policy state
  const [policies, setPolicies] = useState<SystemPolicy[]>([]);
  const [expandedPolicyId, setExpandedPolicyId] = useState<string | null>(null);
  const [editingPolicyKey, setEditingPolicyKey] = useState<string | null>(null);
  const [editingPolicyJson, setEditingPolicyJson] = useState<string>('');
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);

  const loadPolicies = async () => {
    try {
      const res = await fetchPolicies();
      setPolicies(res.policies || []);
    } catch {
      // Degraded fallback
    }
  };

  // Global audit ledger — real records from `case_events`.
  const [auditEvents, setAuditEvents] = useState<CaseEvent[]>([]);
  const [auditSource, setAuditSource] = useState<'database' | 'memory' | null>(null);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const loadAudit = async () => {
    setIsAuditLoading(true);
    setAuditError(null);
    try {
      const res = await fetchAdministrationAudit({ limit: 100 });
      setAuditEvents(res.events || []);
      setAuditSource(res.source);
    } catch (err: any) {
      setAuditError(err.message || 'Failed to load the audit ledger.');
      setAuditEvents([]);
      setAuditSource(null);
    } finally {
      setIsAuditLoading(false);
    }
  };

  // Registered users state
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userToRevoke, setUserToRevoke] = useState<UserProfile | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const loadUsers = async () => {
    setIsUsersLoading(true);
    setUsersError(null);
    try {
      const res = await fetchAdminUsers();
      setUsersList(res.users || []);
    } catch (err: any) {
      setUsersError(err.message || 'Failed to load officer directory.');
    } finally {
      setIsUsersLoading(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!userToRevoke) return;
    setIsRevoking(true);
    setActionFeedback(null);
    try {
      const res = await revokeUserAccess(userToRevoke.id);
      setActionFeedback(res.message);
      setUserToRevoke(null);
      await loadUsers();
    } catch (err: any) {
      setUsersError(err.message || 'Failed to revoke user access.');
    } finally {
      setIsRevoking(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'users') {
      loadUsers();
    }
    if (activeSubTab === 'policies') {
      loadPolicies();
    }
    if (activeSubTab === 'audit') {
      loadAudit();
    }
  }, [activeSubTab, activePersona.role]);

  const handleStartEditPolicy = (p: SystemPolicy) => {
    setEditingPolicyKey(p.id);
    setEditingPolicyJson(JSON.stringify(p.config_value, null, 2));
    setPolicyMessage(null);
  };

  const handleSavePolicy = async (key: string) => {
    try {
      setIsSavingPolicy(true);
      setPolicyMessage(null);
      const parsed = JSON.parse(editingPolicyJson);
      await updatePolicyByKey(key, parsed);
      setPolicyMessage(`Policy "${key}" updated successfully. Changes applied to runtime engine.`);
      setEditingPolicyKey(null);
      await loadPolicies();
    } catch (err: any) {
      alert(`Invalid policy JSON or update failed: ${err.message}`);
    } finally {
      setIsSavingPolicy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#FFFDF9] p-5 rounded-xl border border-sand-200 shadow-gov">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-terra-800 bg-sand-100 border border-sand-300/80 px-2 py-0.5 rounded shadow-2xs">
              Institutional Governance
            </span>
          </div>
          <h1 className="text-xl font-bold text-mocha-900 tracking-tight font-sans">
            Administration &amp; System Governance
          </h1>
          <p className="text-xs text-mocha-500 mt-0.5">
            Role visibility, statutory workflow templates, dynamic policy thresholds, external
            registry integrations, and the cross-case audit ledger.
          </p>
        </div>
      </div>

      {/* Sub-Navigation Switcher */}
      <div className="flex border-b border-sand-200 bg-[#FFFDF9] rounded-t-xl px-4 gap-6 text-xs font-medium overflow-x-auto shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveSubTab('requests')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeSubTab === 'requests'
              ? 'border-terra-700 text-terra-900 font-bold'
              : 'border-transparent text-mocha-500 hover:text-mocha-900'
          )}
        >
          <UserCheck className="h-4 w-4 text-emerald-700" />
          <span>Access Requests &amp; Approvals</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('users')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeSubTab === 'users'
              ? 'border-terra-700 text-terra-900 font-bold'
              : 'border-transparent text-mocha-500 hover:text-mocha-900'
          )}
        >
          <Users className="h-4 w-4 text-terra-700" />
          <span>Officer Roles &amp; Directory</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('workflows')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeSubTab === 'workflows'
              ? 'border-terra-700 text-terra-900 font-bold'
              : 'border-transparent text-mocha-500 hover:text-mocha-900'
          )}
        >
          <GitBranch className="h-4 w-4 text-gold-600" />
          <span>Workflow Configuration</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('policies')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeSubTab === 'policies'
              ? 'border-terra-700 text-terra-900 font-bold'
              : 'border-transparent text-mocha-500 hover:text-mocha-900'
          )}
        >
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <span>Policies &amp; Thresholds</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('integrations')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeSubTab === 'integrations'
              ? 'border-terra-700 text-terra-900 font-bold'
              : 'border-transparent text-mocha-500 hover:text-mocha-900'
          )}
        >
          <Database className="h-4 w-4 text-terra-700" />
          <span>External Integrations</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('audit')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeSubTab === 'audit'
              ? 'border-terra-700 text-terra-900 font-bold'
              : 'border-transparent text-mocha-500 hover:text-mocha-900'
          )}
        >
          <History className="h-4 w-4 text-mocha-600" />
          <span>System Audit Ledger</span>
        </button>
      </div>

      {/* Sub-Tab Content Viewports */}
      <div className="space-y-6">
        {/* SUBTAB 1: ACCESS REQUESTS */}
        {activeSubTab === 'requests' && <AccessRequestsManager />}

        {/* SUBTAB 2: USERS & ROLES */}
        {activeSubTab === 'users' && (
          <div className="space-y-5">
            {/* Feedback alert */}
            {actionFeedback && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center justify-between text-xs text-emerald-800">
                <span className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  {actionFeedback}
                </span>
                <button type="button" onClick={() => setActionFeedback(null)} className="text-emerald-600 hover:text-emerald-900">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {usersError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-center justify-between text-xs text-rose-800">
                <span className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                  {usersError}
                </span>
                <button type="button" onClick={() => setUsersError(null)} className="text-rose-600 hover:text-rose-900">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Active Registered Officers Table */}
            <div className="bg-white rounded-xl border border-sand-200 p-5 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-gov-slate text-sm flex items-center gap-2">
                    <Users className="h-4 w-4 text-terra-700" />
                    Registered Officers &amp; Access Control
                  </h3>
                  <p className="text-[11px] text-mocha-500">
                    Administrators have full statutory power to manage registered accounts and permanently revoke officer access.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-mocha-400" />
                    <input
                      type="text"
                      placeholder="Search officers..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="input pl-8 py-1.5 text-xs w-48 rounded-lg"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadUsers}
                    isLoading={isUsersLoading}
                    leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                  >
                    Refresh
                  </Button>
                </div>
              </div>

              {isUsersLoading && usersList.length === 0 ? (
                <div className="py-8 text-center text-xs text-mocha-500">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-terra-600" />
                  Loading officer directory...
                </div>
              ) : (
                <div className="border border-sand-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <table className="w-full text-left text-xs divide-y divide-sand-200 table-fixed">
                    <thead>
                      <tr className="bg-sand-100/80 text-mocha-700 font-semibold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-3.5 w-[22%]">Officer Name</th>
                        <th className="py-3 px-3.5 w-[24%]">Email / Account</th>
                        <th className="py-3 px-3.5 w-[20%]">Department &amp; Org</th>
                        <th className="py-3 px-3.5 w-[14%]">Role Assigned</th>
                        <th className="py-3 px-3.5 w-[10%]">Jurisdiction</th>
                        <th className="py-3 px-3.5 w-[10%] text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sand-100 bg-white">
                      {usersList
                        .filter((u) => {
                          if (!userSearch.trim()) return true;
                          const q = userSearch.toLowerCase();
                          return (
                            u.full_name?.toLowerCase().includes(q) ||
                            u.email?.toLowerCase().includes(q) ||
                            u.department?.toLowerCase().includes(q) ||
                            u.role?.toLowerCase().includes(q)
                          );
                        })
                        .map((u) => {
                          const isCurrentUser = session && session.userId === u.id;
                          return (
                            <tr key={u.id} className="hover:bg-sand-50/70 transition-colors">
                              <td className="py-2.5 px-3.5 font-semibold text-mocha-900">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="h-6 w-6 rounded-full bg-terra-100 text-terra-800 font-bold flex items-center justify-center text-[10px] shrink-0">
                                    {u.full_name ? u.full_name.charAt(0).toUpperCase() : 'U'}
                                  </span>
                                  <span className="truncate max-w-[140px]" title={u.full_name || 'Unnamed Officer'}>
                                    {u.full_name || 'Unnamed Officer'}
                                  </span>
                                  {isCurrentUser && (
                                    <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-bold border border-emerald-200 shrink-0">
                                      You
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3.5 font-mono text-[11px] text-mocha-700">
                                <span className="truncate block" title={u.email}>
                                  {u.email}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 text-mocha-600">
                                <span className="truncate block text-[11px]" title={u.department || '—'}>
                                  {u.department || '—'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5">
                                <Badge variant={u.role === 'admin' ? 'red' : u.role === 'lao' ? 'amber' : 'navy'}>
                                  {ROLE_LABELS[u.role as UserRole] || u.role}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3.5 text-mocha-600 text-[11px]">
                                <span className="truncate block" title={u.jurisdiction_district_lgd_code ? `District: ${u.jurisdiction_district_lgd_code}` : u.jurisdiction_state_lgd_code ? `State: ${u.jurisdiction_state_lgd_code}` : 'National Scope'}>
                                  {u.jurisdiction_district_lgd_code
                                    ? `District: ${u.jurisdiction_district_lgd_code}`
                                    : u.jurisdiction_state_lgd_code
                                    ? `State: ${u.jurisdiction_state_lgd_code}`
                                    : 'National Scope'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                                {isCurrentUser ? (
                                  <span className="text-[10px] text-slate-400 italic">Self-protected</span>
                                ) : (
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => setUserToRevoke(u)}
                                    leftIcon={<UserX className="h-3 w-3" />}
                                  >
                                    Revoke Access
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      {usersList.length === 0 && !isUsersLoading && (
                        <tr>
                          <td colSpan={6} className="text-center py-6 text-mocha-400 italic">
                            No officer accounts found. Officers appear here after registration or access request approval.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Revoke Access Confirmation Modal */}
            {userToRevoke && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
                <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-sand-200 space-y-4 animate-in fade-in zoom-in duration-150">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                      <UserX className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gov-slate">Revoke Officer Access</h4>
                      <p className="text-xs text-mocha-500">Permanent security revocation</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 space-y-2 text-xs text-rose-900">
                    <p className="font-semibold">
                      Are you sure you want to permanently revoke access for this officer?
                    </p>
                    <div className="space-y-1 text-[11px] text-rose-800">
                      <p><strong>Name:</strong> {userToRevoke.full_name}</p>
                      <p><strong>Email:</strong> {userToRevoke.email}</p>
                      <p><strong>Assigned Role:</strong> {ROLE_LABELS[userToRevoke.role as UserRole] || userToRevoke.role}</p>
                      <p><strong>Department:</strong> {userToRevoke.department || 'N/A'}</p>
                    </div>
                    <p className="text-[10px] text-rose-700 pt-1">
                      This will delete the officer's authentication credentials and terminate their permissions across BhoomiDarpan immediately.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setUserToRevoke(null)}
                      disabled={isRevoking}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleConfirmRevoke}
                      isLoading={isRevoking}
                      leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                    >
                      Confirm Revoke Access
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Current Session Info */}
            <div className="bg-white rounded-xl border border-sand-200 p-5 space-y-4 shadow-xs">
              <div>
                <h3 className="font-bold text-gov-slate text-sm">
                  Active Session Context
                </h3>
                <p className="text-[11px] text-mocha-500">
                  {session
                    ? 'Signed-in officers act under their own authenticated profile.'
                    : 'No real session exists in this build.'}
                </p>
              </div>

              {/* Signed-in session: identity is fixed */}
              {session && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-emerald-700" />
                      <span className="text-xs font-bold text-emerald-900">
                        {activePersona.name}
                      </span>
                      <Badge variant="emerald">{ROLE_LABELS[activePersona.role]}</Badge>
                    </div>
                    <p className="text-[11px] text-emerald-800">
                      {session.email}
                      {activePersona.department ? ` • ${activePersona.department}` : ''}
                    </p>
                    <p className="text-[10px] text-emerald-700">
                      {session.jurisdiction
                        ? `Jurisdiction: ${session.jurisdiction}. `
                        : 'Jurisdiction: national scope. '}
                      Role authorisation is enforced server-side on every request.
                    </p>
                  </div>
                </div>
              )}

              {!session && (
                <div className="rounded-xl border border-sand-200 bg-sand-50 p-4">
                  <p className="text-xs font-bold text-gov-slate">No account is signed in</p>
                  <p className="mt-1 text-[11px] text-mocha-600">
                    Sign in to see your authenticated identity and territorial jurisdiction.
                  </p>
                </div>
              )}
            </div>

            {/* Role registry — one row per real backend role */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-xs">
              <div>
                <h3 className="font-bold text-gov-slate text-sm">Role Registry</h3>
                <p className="text-[11px] text-slate-500">
                  Every role the API recognises, rendered from the shared role definitions.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <th className="py-2.5 px-3">Role Key</th>
                      <th className="py-2.5 px-3">Display Label</th>
                      <th className="py-2.5 px-3">Currently Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ROLE_ORDER.map((role) => (
                      <tr key={role}>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">{role}</td>
                        <td className="py-2.5 px-3 font-semibold text-gov-slate">
                          {ROLE_LABELS[role]}
                        </td>
                        <td className="py-2.5 px-3">
                          {activePersona.role === role ? (
                            <span className="flex items-center gap-1 text-emerald-700 font-bold">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Active
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Navigation visibility, derived from the route registry */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-xs">
              <div>
                <h3 className="font-bold text-gov-slate text-sm">Navigation Visibility by Role</h3>
                <p className="text-[11px] text-slate-500">
                  Generated from the route registry — a destination is shown for a role when that
                  role is listed on the route. This governs the sidebar only: every API request is
                  authorised independently on the server, and the registry is not a permission
                  control.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <th className="py-2.5 px-3">Role</th>
                      {NAV_ROUTES.map((route) => (
                        <th key={route.id} className="py-2.5 px-3 text-center">
                          {route.title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ROLE_ORDER.map((role) => {
                      const visibleIds = new Set(navRoutesForRole(role).map((r) => r.id));
                      return (
                        <tr key={role}>
                          <td className="py-2.5 px-3 font-semibold text-gov-slate whitespace-nowrap">
                            {ROLE_LABELS[role as UserRole]}
                          </td>
                          {NAV_ROUTES.map((route) => (
                            <td
                              key={route.id}
                              className={clsx(
                                'py-2.5 px-3 text-center font-bold',
                                visibleIds.has(route.id)
                                  ? 'text-emerald-700'
                                  : 'text-slate-300 font-normal'
                              )}
                            >
                              {visibleIds.has(route.id) ? 'Yes' : '—'}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 2: WORKFLOW CONFIGURATION */}
        {activeSubTab === 'workflows' && (
          <WorkflowConfigPage />
        )}

        {/* SUBTAB 3: POLICIES & THRESHOLDS */}
        {activeSubTab === 'policies' && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 leading-relaxed shadow-xs">
              <div className="flex items-center gap-2 font-bold mb-1">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <span>Runtime Policy Configuration Warning</span>
              </div>
              <p>
                Zero hardcoding architecture: all operational delay thresholds, SLA warning limits, composite risk weights, and automated notification triggers are dynamically fetched from the database. Modifications made here directly alter runtime evaluation behavior for all officers across the nation.
              </p>
            </div>

            {policyMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>{policyMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {policies.map((p) => {
                const isExpanded = expandedPolicyId === p.id;
                const isEditing = editingPolicyKey === p.id;

                return (
                  <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-mono text-[10px] font-bold text-gov-navy bg-blue-50 px-2 py-0.5 rounded border border-blue-200 uppercase">
                          {p.category}
                        </span>
                        <h4 className="text-sm font-bold text-gov-slate mt-1.5">{p.title}</h4>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {p.id}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">{p.description}</p>

                    {isEditing ? (
                      <div className="space-y-2 pt-2">
                        <textarea
                          value={editingPolicyJson}
                          onChange={(e) => setEditingPolicyJson(e.target.value)}
                          rows={6}
                          className="w-full p-2.5 rounded-lg border border-slate-300 font-mono text-[11px] bg-slate-50 text-gov-slate focus:bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy"
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setEditingPolicyKey(null)}>
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            isLoading={isSavingPolicy}
                            onClick={() => handleSavePolicy(p.id)}
                            leftIcon={<Save className="h-3.5 w-3.5" />}
                          >
                            Save Runtime Policy
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-1">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setExpandedPolicyId(isExpanded ? null : p.id)}
                            className="text-[11px] font-semibold text-gov-navy hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>{isExpanded ? 'Hide Values' : 'Inspect Policy Values'}</span>
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartEditPolicy(p)}
                            className="text-[11px] font-semibold text-slate-600 hover:text-gov-navy hover:underline cursor-pointer"
                          >
                            Edit Thresholds
                          </button>
                        </div>

                        {isExpanded && (
                          <pre className="mt-2 p-3 bg-slate-900 text-amber-300 rounded-lg text-[11px] font-mono overflow-x-auto max-h-48">
                            {JSON.stringify(p.config_value, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SUBTAB 4: EXTERNAL INTEGRATIONS */}
        {activeSubTab === 'integrations' && (
          <IntegrationsPage />
        )}

        {/* SUBTAB 5: SYSTEM AUDIT LEDGER */}
        {activeSubTab === 'audit' && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-gov-slate text-sm">System Audit Ledger</h3>
                <p className="text-[11px] text-slate-500">
                  Most recent audit events across every case, read live from the audit log. Per-case
                  chronological detail remains available in each case's History &amp; Audit tab.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadAudit}
                disabled={isAuditLoading}
                leftIcon={
                  <RefreshCw className={clsx('h-3 w-3', isAuditLoading && 'animate-spin')} />
                }
              >
                Refresh
              </Button>
            </div>

            {/* Storage provenance — stated, never implied */}
            {auditSource === 'memory' && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                <span>
                  The persistent audit store is unavailable to this server process, so the entries
                  below come from the in-memory buffer and are not durable across restarts.
                </span>
              </div>
            )}

            {auditError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] text-red-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{auditError}</span>
              </div>
            )}

            {isAuditLoading && auditEvents.length === 0 && (
              <div className="py-10 text-center text-xs text-slate-500">Loading audit records…</div>
            )}

            {!isAuditLoading && !auditError && auditEvents.length === 0 && (
              <div className="py-10 text-center text-xs text-slate-500">
                No audit events recorded yet.
              </div>
            )}

            {auditEvents.length > 0 && (
              <div className="max-h-[32rem] overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Event</th>
                      <th className="py-2.5 px-3">Title</th>
                      <th className="py-2.5 px-3">Actor</th>
                      <th className="py-2.5 px-3">Case</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditEvents.map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                          {ev.created_at ? new Date(ev.created_at).toLocaleString('en-IN') : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono text-[10px] font-semibold text-gov-navy bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">
                            {ev.event_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-gov-slate font-medium">{ev.title}</td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          {ev.actor_name || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">
                          {ev.case_id || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[10px] text-slate-400">
              Showing {auditEvents.length} of the most recent records available to this session.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
