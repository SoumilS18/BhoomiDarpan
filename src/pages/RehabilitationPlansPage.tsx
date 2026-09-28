import React, { useState, useEffect } from 'react';
import {
  Home,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Building2,
  Users,
  IndianRupee,
  ChevronRight,
  Sparkles,
  RefreshCw,
  FileCheck,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { RehabilitationPlan, RehabPlanStatus } from '../../shared/types';
import { fetchRehabilitationPlans, fetchRehabilitationSummary, updateRehabilitationPlanStatus, createRehabilitationPlan } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const STATUS_BADGES: Record<RehabPlanStatus, { label: string; bg: string; text: string; border: string }> = {
  draft: { label: 'Draft Scheme', bg: 'bg-sand-100', text: 'text-sand-800', border: 'border-sand-300' },
  sia_reviewed: { label: 'SIA Reviewed', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  public_hearing: { label: 'Public Hearing Held', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  approved: { label: 'Statutory Approved', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300' },
  executing: { label: 'In Execution', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200' },
  completed: { label: 'Fully Disbursed', bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-300' },
};

export const RehabilitationPlansPage: React.FC = () => {
  const { activePersona } = useAuth();
  const [plans, setPlans] = useState<RehabilitationPlan[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPlan, setSelectedPlan] = useState<RehabilitationPlan | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canManage = ['admin', 'lao', 'project_officer'].includes(activePersona.role);

  const loadData = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const [plansData, summaryData] = await Promise.all([
        fetchRehabilitationPlans(),
        fetchRehabilitationSummary(),
      ]);
      setPlans(plansData);
      setSummary(summaryData);
      if (plansData.length > 0 && !selectedPlan) {
        setSelectedPlan(plansData[0]);
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to load rehabilitation plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatusChange = async (planId: string, newStatus: RehabPlanStatus) => {
    try {
      const updated = await updateRehabilitationPlanStatus(planId, newStatus);
      setPlans((prev) => prev.map((p) => (p.id === planId ? updated : p)));
      if (selectedPlan?.id === planId) setSelectedPlan(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to update plan status');
    }
  };

  const filteredPlans = plans.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.plan_number.toLowerCase().includes(search.toLowerCase()) ||
      (p.project_name && p.project_name.toLowerCase().includes(search.toLowerCase())) ||
      (p.case_number && p.case_number.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Rehabilitation & Resettlement Plans
            <span className="rounded bg-sand-200/80 px-2 py-0.5 text-xs font-normal text-mocha-700">पुनर्वास एवं पुनर्स्थापन योजनाएं</span>
          </span>
        }
        subtitle="Statutory R&R schemes, resettlement colony infrastructure & entitlement execution under RFCTLARR Act 2013 (Chapter V)"
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-sand-300 bg-white text-mocha-800 hover:bg-sand-50 transition-colors shadow-2xs cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5 text-sand-500" />
              Refresh
            </button>
            {canManage && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-terra-700 text-white hover:bg-terra-800 transition-colors shadow-2xs cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Draft New R&R Scheme
              </button>
            )}
          </div>
        }
      />

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 border-l-4 border-l-emerald-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-mocha-500">Statutory Schemes</p>
                <p className="text-2xl font-bold text-mocha-900 mt-1">{summary.total_plans}</p>
                <p className="text-[11px] text-emerald-700 font-medium mt-0.5">{summary.approved_plans} Approved / Executing</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Home className="h-5 w-5" />
              </div>
            </div>
          </Card>

          <Card className="p-4 border-l-4 border-l-indigo-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-mocha-500">Affected Families (PAFs)</p>
                <p className="text-2xl font-bold text-mocha-900 mt-1">{summary.total_affected_families}</p>
                <p className="text-[11px] text-indigo-700 font-medium mt-0.5">{summary.total_displaced_families} Displaced Families</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </Card>

          <Card className="p-4 border-l-4 border-l-amber-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-mocha-500">R&R Budget Allocation</p>
                <p className="text-2xl font-bold text-mocha-900 mt-1">₹{(summary.total_budget_allocated_inr / 10000000).toFixed(2)} Cr</p>
                <p className="text-[11px] text-amber-800 font-medium mt-0.5">₹{(summary.total_budget_disbursed_inr / 10000000).toFixed(2)} Cr Disbursed</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                <IndianRupee className="h-5 w-5" />
              </div>
            </div>
          </Card>

          <Card className="p-4 border-l-4 border-l-teal-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-mocha-500">Resettlement Colonies</p>
                <p className="text-2xl font-bold text-mocha-900 mt-1">{summary.resettlement_colonies_count}</p>
                <p className="text-[11px] text-teal-700 font-medium mt-0.5">{summary.housing_units_completed} Housing Units Allotted</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                <Building2 className="h-5 w-5" />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-sand-200 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search schemes, cases, projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-sand-300 focus:outline-none focus:ring-2 focus:ring-terra-600 text-mocha-900 bg-sand-50/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-3.5 w-3.5 text-mocha-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs rounded-lg border border-sand-300 px-2.5 py-1.5 bg-white text-mocha-800 focus:outline-none focus:ring-2 focus:ring-terra-600"
          >
            <option value="all">All Approval States</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="executing">In Execution</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Main Content Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Schemes List */}
        <div className="lg:col-span-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-mocha-600 px-1">
            Statutory Schemes ({filteredPlans.length})
          </h3>

          {loading ? (
            <div className="p-8 text-center bg-white rounded-xl border border-sand-200 text-mocha-500 text-xs">
              Loading R&R schemes...
            </div>
          ) : filteredPlans.length === 0 ? (
            <EmptyState
              title="No Rehabilitation Schemes Found"
              description="No schemes match the selected search or filter criteria."
            />
          ) : (
            filteredPlans.map((plan) => {
              const isSelected = selectedPlan?.id === plan.id;
              const badge = STATUS_BADGES[plan.status];
              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-sand-50/90 border-terra-600 shadow-xs ring-1 ring-terra-600/30'
                      : 'bg-white border-sand-200 hover:border-sand-300 hover:shadow-2xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold font-mono text-sand-500 uppercase">
                        {plan.plan_number}
                      </span>
                      <h4 className="text-sm font-bold text-mocha-900 mt-0.5 leading-snug">
                        {plan.title}
                      </h4>
                      <p className="text-xs text-mocha-600 mt-1 line-clamp-1">{plan.project_name}</p>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 pt-3 border-t border-sand-200/80 text-center">
                    <div>
                      <p className="text-[10px] text-mocha-500 font-medium">Families</p>
                      <p className="text-xs font-bold text-mocha-900 mt-0.5">{plan.affected_families_count}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-mocha-500 font-medium">Displaced</p>
                      <p className="text-xs font-bold text-terra-700 mt-0.5">{plan.displaced_families_count}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-mocha-500 font-medium">Budget</p>
                      <p className="text-xs font-bold text-mocha-900 mt-0.5">₹{(plan.budget_allocated_inr / 10000000).toFixed(1)} Cr</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Scheme Detail Workspace */}
        <div className="lg:col-span-7">
          {selectedPlan ? (
            <Card className="p-6 space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-sand-200 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-terra-700">{selectedPlan.plan_number}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        STATUS_BADGES[selectedPlan.status].bg
                      } ${STATUS_BADGES[selectedPlan.status].text} ${STATUS_BADGES[selectedPlan.status].border}`}
                    >
                      {STATUS_BADGES[selectedPlan.status].label}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-mocha-900 mt-1">{selectedPlan.title}</h2>
                  <p className="text-xs text-mocha-600 mt-0.5">
                    Case: <span className="font-semibold text-mocha-800">{selectedPlan.case_number}</span> • Project:{' '}
                    <span className="font-semibold text-mocha-800">{selectedPlan.project_name}</span>
                  </p>
                </div>

                {canManage && (
                  <div className="flex items-center gap-2">
                    {selectedPlan.status === 'draft' && (
                      <button
                        onClick={() => handleStatusChange(selectedPlan.id, 'approved')}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-2xs"
                      >
                        Grant Statutory Approval
                      </button>
                    )}
                    {selectedPlan.status === 'approved' && (
                      <button
                        onClick={() => handleStatusChange(selectedPlan.id, 'executing')}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-2xs"
                      >
                        Begin Execution
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Administrator & Statutory Citations */}
              <div className="bg-sand-50/70 p-3.5 rounded-xl border border-sand-200 text-xs text-mocha-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-mocha-700">Designated R&R Administrator:</span>
                  <span className="font-bold text-mocha-900">{selectedPlan.administrator_name}</span>
                </div>
                <div className="pt-2 border-t border-sand-200/60">
                  <span className="text-[11px] font-semibold text-mocha-600 block mb-1">Statutory Provisions:</span>
                  <ul className="space-y-1 text-[11px] text-mocha-700 list-disc list-inside">
                    {selectedPlan.statutory_provisions.map((prov, i) => (
                      <li key={i}>{prov}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Entitlement Execution Summary */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-mocha-700 mb-3">
                  Entitlements & Package Summary (Second Schedule)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-white rounded-lg border border-sand-200 shadow-2xs">
                    <p className="text-[11px] text-mocha-500 font-medium">Housing Units Allotted</p>
                    <p className="text-lg font-bold text-mocha-900 mt-1">
                      {selectedPlan.entitlements_summary.housing_units_allocated} / {selectedPlan.displaced_families_count}
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-sand-200 shadow-2xs">
                    <p className="text-[11px] text-mocha-500 font-medium">Subsistence Grants</p>
                    <p className="text-lg font-bold text-emerald-700 mt-1">
                      {selectedPlan.entitlements_summary.subsistence_grants_disbursed}
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-sand-200 shadow-2xs">
                    <p className="text-[11px] text-mocha-500 font-medium">Annuity Pension Enrolled</p>
                    <p className="text-lg font-bold text-indigo-700 mt-1">
                      {selectedPlan.entitlements_summary.annuity_pension_count}
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-sand-200 shadow-2xs">
                    <p className="text-[11px] text-mocha-500 font-medium">Jobs Provided</p>
                    <p className="text-lg font-bold text-mocha-900 mt-1">
                      {selectedPlan.entitlements_summary.employment_provided_count}
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-sand-200 shadow-2xs">
                    <p className="text-[11px] text-mocha-500 font-medium">Skill Trained</p>
                    <p className="text-lg font-bold text-teal-700 mt-1">
                      {selectedPlan.entitlements_summary.skill_development_trained}
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-sand-200 shadow-2xs">
                    <p className="text-[11px] text-mocha-500 font-medium">Disbursed Ratio</p>
                    <p className="text-lg font-bold text-amber-700 mt-1">
                      {((selectedPlan.budget_disbursed_inr / selectedPlan.budget_allocated_inr) * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Resettlement Colonies & Amenities */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-mocha-700 mb-3">
                  Resettlement Colonies & Civic Infrastructure (Third Schedule)
                </h4>
                <div className="space-y-3">
                  {selectedPlan.resettlement_colonies.map((colony) => (
                    <div key={colony.id} className="p-4 bg-white rounded-xl border border-sand-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="text-xs font-bold text-mocha-900">{colony.name}</h5>
                          <p className="text-[11px] text-mocha-500 mt-0.5">{colony.location}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-terra-800">
                            {colony.plots_allotted} / {colony.plots_planned} Plots Allotted
                          </span>
                          <div className="w-24 bg-sand-200 h-1.5 rounded-full mt-1 overflow-hidden">
                            <div
                              className="bg-emerald-600 h-full rounded-full"
                              style={{ width: `${colony.completion_pct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-sand-100 grid grid-cols-3 sm:grid-cols-6 gap-2 text-[10px]">
                        <span className={`px-2 py-1 rounded text-center font-medium ${colony.civic_amenities.schools ? 'bg-emerald-50 text-emerald-800' : 'bg-sand-100 text-mocha-400'}`}>
                          Schools
                        </span>
                        <span className={`px-2 py-1 rounded text-center font-medium ${colony.civic_amenities.health_centers ? 'bg-emerald-50 text-emerald-800' : 'bg-sand-100 text-mocha-400'}`}>
                          Health
                        </span>
                        <span className={`px-2 py-1 rounded text-center font-medium ${colony.civic_amenities.drinking_water ? 'bg-emerald-50 text-emerald-800' : 'bg-sand-100 text-mocha-400'}`}>
                          Water
                        </span>
                        <span className={`px-2 py-1 rounded text-center font-medium ${colony.civic_amenities.electricity ? 'bg-emerald-50 text-emerald-800' : 'bg-sand-100 text-mocha-400'}`}>
                          Power
                        </span>
                        <span className={`px-2 py-1 rounded text-center font-medium ${colony.civic_amenities.roads ? 'bg-emerald-50 text-emerald-800' : 'bg-sand-100 text-mocha-400'}`}>
                          Roads
                        </span>
                        <span className={`px-2 py-1 rounded text-center font-medium ${colony.civic_amenities.community_hall ? 'bg-emerald-50 text-emerald-800' : 'bg-sand-100 text-mocha-400'}`}>
                          Hall
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-8 text-center text-mocha-500 text-xs">
              Select a scheme from the left list to review its entitlement workspace.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
