import React, { useState, useEffect } from 'react';
import { useAuth, AVAILABLE_PERSONAS } from '../context/AuthContext';
import { fetchPolicies, updatePolicyByKey } from '../lib/api';
import { SystemPolicy } from '../../shared/types';
import { WorkflowConfigPage } from './WorkflowConfigPage';
import { IntegrationsPage } from './IntegrationsPage';
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
  Shield,
  Save,
} from 'lucide-react';
import { clsx } from 'clsx';

/** Addressable sections of the administration console (`/admin/:section`). */
export type AdminSection = 'users' | 'workflows' | 'policies' | 'integrations' | 'audit';

type AdminSubTab = AdminSection;

const ADMIN_SECTIONS: AdminSection[] = ['users', 'workflows', 'policies', 'integrations', 'audit'];

interface AdministrationPageProps {
  /** Section requested by the current URL. */
  section?: string;
  onSectionChange: (section: AdminSection) => void;
}

export const AdministrationPage: React.FC<AdministrationPageProps> = ({
  section,
  onSectionChange,
}) => {
  const { activePersona, setActivePersona } = useAuth();

  // Derived from the URL, so each console section is deep-linkable.
  const activeSubTab: AdminSubTab = ADMIN_SECTIONS.includes(section as AdminSection)
    ? (section as AdminSection)
    : 'users';
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

  useEffect(() => {
    if (activeSubTab === 'policies') {
      loadPolicies();
    }
  }, [activeSubTab]);

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
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gov-navy bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
              Institutional Governance
            </span>
            <span className="text-xs text-slate-300">•</span>
            <span className="text-[11px] text-slate-500">
              System Configuration Console
            </span>
          </div>
          <h1 className="text-xl font-bold text-gov-slate tracking-tight">
            Administration &amp; System Governance
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Role-based access control, statutory workflow templates, dynamic policy thresholds, external registry integrations, and immutable audit logs.
          </p>
        </div>
      </div>

      {/* Sub-Navigation Switcher (Section 22 Structure) */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 gap-6 text-xs font-medium overflow-x-auto shadow-xs">
        <button
          type="button"
          onClick={() => setActiveSubTab('users')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeSubTab === 'users'
              ? 'border-gov-navy text-gov-navy font-bold'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <Users className="h-4 w-4 text-gov-navy" />
          <span>1. Users &amp; Roles</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('workflows')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeSubTab === 'workflows'
              ? 'border-gov-navy text-gov-navy font-bold'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <GitBranch className="h-4 w-4 text-teal-600" />
          <span>2. Workflow Configuration</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('policies')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeSubTab === 'policies'
              ? 'border-gov-navy text-gov-navy font-bold'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <span>3. Policies &amp; Thresholds</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('integrations')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeSubTab === 'integrations'
              ? 'border-gov-navy text-gov-navy font-bold'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <Database className="h-4 w-4 text-blue-600" />
          <span>4. External Integrations</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('audit')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeSubTab === 'audit'
              ? 'border-gov-navy text-gov-navy font-bold'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <History className="h-4 w-4 text-purple-600" />
          <span>5. System Audit Ledger</span>
        </button>
      </div>

      {/* Sub-Tab Content Viewports */}
      <div className="space-y-6">
        {/* SUBTAB 1: USERS & ROLES */}
        {activeSubTab === 'users' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
              <div>
                <h3 className="font-bold text-gov-slate text-sm">
                  Role-Based Access Control (RBAC) &amp; Officer Directory
                </h3>
                <p className="text-[11px] text-slate-500">
                  Switch the active administrative persona to simulate authorized workflows, territorial boundaries, and statutory decision scopes.
                </p>
              </div>

              {/* Persona Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                {AVAILABLE_PERSONAS.map((p) => {
                  const isActive = activePersona.role === p.role;
                  return (
                    <div
                      key={p.role}
                      onClick={() => setActivePersona(p)}
                      className={clsx(
                        'p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between',
                        isActive
                          ? 'border-gov-navy ring-2 ring-gov-navy/20 bg-blue-50/20 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span
                            className={clsx(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                              p.badgeColor
                            )}
                          >
                            {p.role.toUpperCase()}
                          </span>
                          {isActive && (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-gov-navy">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Active
                            </span>
                          )}
                        </div>

                        <h4 className="font-bold text-gov-slate text-xs mt-2">{p.name}</h4>
                        <div className="text-[11px] text-gov-navy font-medium mt-0.5">{p.label}</div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                        {p.department}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Statutory Permission Matrix */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-xs">
              <h3 className="font-bold text-gov-slate text-sm">
                Institutional Statutory Permission Matrix
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Territorial Scope</th>
                      <th className="py-2.5 px-3">Initiate Cases</th>
                      <th className="py-2.5 px-3">Advance Stages</th>
                      <th className="py-2.5 px-3">Verify Documents</th>
                      <th className="py-2.5 px-3">Advisory Actions</th>
                      <th className="py-2.5 px-3">System Policies</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-gov-slate">System Administrator (NIC)</td>
                      <td className="py-2.5 px-3">National Portfolio</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Yes</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Yes (Override)</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Yes</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Yes</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Full Access</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-gov-slate">Land Acquisition Officer (LAO)</td>
                      <td className="py-2.5 px-3">District Authority</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Yes</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Yes</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Yes</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Yes</td>
                      <td className="py-2.5 px-3 text-slate-400">Read Only</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-gov-slate">State Competent Authority</td>
                      <td className="py-2.5 px-3">State / Ministry</td>
                      <td className="py-2.5 px-3 text-slate-400">No</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Approval Stages</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Audit View</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Yes</td>
                      <td className="py-2.5 px-3 text-slate-400">Read Only</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-gov-slate">Project Nodal Officer</td>
                      <td className="py-2.5 px-3">Corridor Bound</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Yes</td>
                      <td className="py-2.5 px-3 text-slate-400">Designated Only</td>
                      <td className="py-2.5 px-3 text-slate-400">View Only</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Yes</td>
                      <td className="py-2.5 px-3 text-slate-400">No</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-gov-slate">Revenue Inspector / Surveyor</td>
                      <td className="py-2.5 px-3">Tehsil Cadastre</td>
                      <td className="py-2.5 px-3 text-slate-400">No</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Survey Only</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">Upload &amp; Extract</td>
                      <td className="py-2.5 px-3 text-slate-400">No</td>
                      <td className="py-2.5 px-3 text-slate-400">No</td>
                    </tr>
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
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs space-y-3 shadow-xs">
            <History className="h-10 w-10 text-slate-400 mx-auto" />
            <h3 className="font-bold text-gov-slate text-sm">System Audit &amp; Outcome Ledger</h3>
            <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
              Audit events are recorded continuously with actor provenance, statutory justifications, and timestamp immutability.
              Per-case chronological audit records can be inspected in the History &amp; Audit tab of each case workspace.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
