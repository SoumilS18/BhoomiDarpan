import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  IndianRupee,
  RefreshCw,
  Plus,
  ShieldCheck,
  FileCheck,
  Building,
  CreditCard,
  Download,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { AffectedFamily, EntitlementStatus, VulnerabilityCategory } from '../../shared/types';
import { fetchAffectedFamilies, updateAffectedFamilyDisbursement } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const VULNERABILITY_LABELS: Record<VulnerabilityCategory, { label: string; badge: string }> = {
  general: { label: 'General Landowner', badge: 'bg-sand-100 text-mocha-800 border-sand-300' },
  sc: { label: 'Scheduled Caste (SC)', badge: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  st: { label: 'Scheduled Tribe (ST)', badge: 'bg-purple-50 text-purple-800 border-purple-200' },
  bpl: { label: 'Below Poverty Line (BPL)', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  landless_laborer: { label: 'Landless Agricultural Laborer', badge: 'bg-rose-50 text-rose-800 border-rose-200' },
  artisan: { label: 'Village Artisan / Tenant', badge: 'bg-cyan-50 text-cyan-800 border-cyan-200' },
  women_headed: { label: 'Women-Headed Household', badge: 'bg-pink-50 text-pink-800 border-pink-200' },
};

const STATUS_BADGES: Record<EntitlementStatus, { label: string; bg: string; text: string }> = {
  identified: { label: 'SIA Census Identified', bg: 'bg-sand-100', text: 'text-sand-700' },
  verified: { label: 'Aadhaar / Land Verified', bg: 'bg-blue-50', text: 'text-blue-700' },
  approved: { label: 'Award Approved', bg: 'bg-amber-50', text: 'text-amber-800' },
  disbursed: { label: 'PFMS Disbursed', bg: 'bg-emerald-50', text: 'text-emerald-800' },
  appealed: { label: 'Grievance Under Review', bg: 'bg-rose-50', text: 'text-rose-800' },
};

export const AffectedFamiliesPage: React.FC = () => {
  const { activePersona } = useAuth();
  const [families, setFamilies] = useState<AffectedFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vulnerabilityFilter, setVulnerabilityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedFamily, setSelectedFamily] = useState<AffectedFamily | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canDisburse = ['admin', 'lao', 'approver', 'revenue_inspector'].includes(activePersona.role);

  const loadData = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const data = await fetchAffectedFamilies({
        vulnerability: vulnerabilityFilter,
        status: statusFilter,
        search,
      });
      setFamilies(data);
      if (data.length > 0 && !selectedFamily) {
        setSelectedFamily(data[0]);
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to load affected family records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [vulnerabilityFilter, statusFilter]);

  const handleDisbursement = async (familyId: string, newStatus: EntitlementStatus) => {
    try {
      const updated = await updateAffectedFamilyDisbursement(familyId, newStatus);
      setFamilies((prev) => prev.map((f) => (f.id === familyId ? updated : f)));
      if (selectedFamily?.id === familyId) setSelectedFamily(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to update disbursement status');
    }
  };

  const totalPackageAmount = families.reduce((sum, f) => sum + f.total_package_inr, 0);
  const totalDisbursedAmount = families.reduce((sum, f) => sum + f.disbursed_amount_inr, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Project Affected Families (PAFs) Census
            <span className="rounded bg-sand-200/80 px-2 py-0.5 text-xs font-normal text-mocha-700">परियोजना प्रभावित परिवार पंजी</span>
          </span>
        }
        subtitle="Socio-economic baseline, vulnerability categorization, entitlement packages & Direct Benefit Transfer tracking under RFCTLARR 2013"
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-sand-300 bg-white text-mocha-800 hover:bg-sand-50 transition-colors shadow-2xs cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5 text-sand-500" />
              Refresh
            </button>
            <button
              onClick={() => {
                const csvHeader = 'Family Head,Aadhaar,ULPIN,Survey No,Village,Vulnerability,Total Package,Disbursed,Status\n';
                const csvRows = families
                  .map(
                    (f) =>
                      `"${f.family_head_name}","${f.aadhaar_masked}","${f.bhu_aadhaar_ulpin || ''}","${f.survey_number}","${f.village_name}","${f.vulnerability_category}",${f.total_package_inr},${f.disbursed_amount_inr},"${f.disbursement_status}"`
                  )
                  .join('\n');
                const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Affected_Families_PAF_Census_${Date.now()}.csv`;
                a.click();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-terra-700 text-white hover:bg-terra-800 transition-colors shadow-2xs cursor-pointer"
            >
              <Download className="h-4 w-4" />
              Export Census CSV
            </button>
          </div>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-indigo-600">
          <p className="text-xs font-semibold uppercase tracking-wider text-mocha-500">Registered PAFs</p>
          <p className="text-2xl font-bold text-mocha-900 mt-1">{families.length}</p>
          <p className="text-[11px] text-indigo-700 font-medium mt-0.5">
            {families.filter((f) => f.is_displaced).length} Displaced from Homestead
          </p>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-600">
          <p className="text-xs font-semibold uppercase tracking-wider text-mocha-500">Total Entitlement Package</p>
          <p className="text-2xl font-bold text-mocha-900 mt-1">₹{(totalPackageAmount / 100000).toFixed(2)} Lakh</p>
          <p className="text-[11px] text-amber-800 font-medium mt-0.5">Mandatory statutory entitlement</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-600">
          <p className="text-xs font-semibold uppercase tracking-wider text-mocha-500">Disbursed Amount (DBT)</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">₹{(totalDisbursedAmount / 100000).toFixed(2)} Lakh</p>
          <p className="text-[11px] text-emerald-800 font-medium mt-0.5">
            {totalPackageAmount > 0 ? ((totalDisbursedAmount / totalPackageAmount) * 100).toFixed(0) : 0}% Realized
          </p>
        </Card>

        <Card className="p-4 border-l-4 border-l-purple-600">
          <p className="text-xs font-semibold uppercase tracking-wider text-mocha-500">Vulnerable Families</p>
          <p className="text-2xl font-bold text-purple-700 mt-1">
            {families.filter((f) => ['sc', 'st', 'bpl', 'women_headed', 'landless_laborer'].includes(f.vulnerability_category)).length}
          </p>
          <p className="text-[11px] text-purple-800 font-medium mt-0.5">Priority housing & pension</p>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-sand-200 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, survey #, ULPIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadData()}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-sand-300 focus:outline-none focus:ring-2 focus:ring-terra-600 text-mocha-900 bg-sand-50/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Filter className="h-3.5 w-3.5 text-mocha-500" />
          <select
            value={vulnerabilityFilter}
            onChange={(e) => setVulnerabilityFilter(e.target.value)}
            className="text-xs rounded-lg border border-sand-300 px-2.5 py-1.5 bg-white text-mocha-800 focus:outline-none focus:ring-2 focus:ring-terra-600"
          >
            <option value="all">All Vulnerability Categories</option>
            <option value="sc">SC (Scheduled Caste)</option>
            <option value="st">ST (Scheduled Tribe)</option>
            <option value="bpl">BPL (Below Poverty Line)</option>
            <option value="women_headed">Women-Headed</option>
            <option value="landless_laborer">Landless Laborer</option>
            <option value="general">General</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs rounded-lg border border-sand-300 px-2.5 py-1.5 bg-white text-mocha-800 focus:outline-none focus:ring-2 focus:ring-terra-600"
          >
            <option value="all">All Disbursement States</option>
            <option value="identified">Identified</option>
            <option value="verified">Verified</option>
            <option value="approved">Approved</option>
            <option value="disbursed">Disbursed</option>
          </select>
        </div>
      </div>

      {/* Main Table / Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Families List Table */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-sand-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-sand-200 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-mocha-800">
              PAF Master Census Registry ({families.length})
            </h3>
          </div>

          {loading ? (
            <div className="p-8 text-center text-mocha-500 text-xs">Loading census records...</div>
          ) : families.length === 0 ? (
            <EmptyState
              title="No Affected Family Records"
              description="No families match your current filter settings."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-sand-50/80 text-mocha-600 font-semibold uppercase text-[10px] tracking-wider border-b border-sand-200">
                  <tr>
                    <th className="py-3 px-4">Family Head</th>
                    <th className="py-3 px-4">Cadastral Location</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Package (₹)</th>
                    <th className="py-3 px-4">Disbursement Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-200/70">
                  {families.map((fam) => {
                    const isSelected = selectedFamily?.id === fam.id;
                    const vuln = VULNERABILITY_LABELS[fam.vulnerability_category] || VULNERABILITY_LABELS.general;
                    const status = STATUS_BADGES[fam.disbursement_status] || STATUS_BADGES.identified;

                    return (
                      <tr
                        key={fam.id}
                        onClick={() => setSelectedFamily(fam)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-terra-50/60 font-medium' : 'hover:bg-sand-50/50'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-bold text-mocha-900">{fam.family_head_name}</div>
                          <div className="text-[11px] text-mocha-500">
                            Aadhaar: {fam.aadhaar_masked} • {fam.family_members_count} Members
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-mocha-800 font-medium">Survey #{fam.survey_number}</div>
                          <div className="text-[11px] text-mocha-500">{fam.village_name}, {fam.district}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${vuln.badge}`}>
                            {vuln.label}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-mocha-900">₹{(fam.total_package_inr / 1000).toLocaleString('en-IN')} K</div>
                          <div className="text-[10px] text-emerald-700 font-medium">
                            ₹{(fam.disbursed_amount_inr / 1000).toLocaleString('en-IN')} K Paid
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${status.bg} ${status.text}`}>
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected Family Detail Drawer */}
        <div className="lg:col-span-4">
          {selectedFamily ? (
            <Card className="p-5 space-y-5">
              <div className="border-b border-sand-200 pb-3">
                <span className="text-[10px] font-bold font-mono text-sand-500 uppercase">{selectedFamily.id}</span>
                <h3 className="text-base font-bold text-mocha-900 mt-0.5">{selectedFamily.family_head_name}</h3>
                <p className="text-xs text-mocha-600 mt-0.5">
                  Survey #{selectedFamily.survey_number}, {selectedFamily.village_name}
                </p>
              </div>

              {/* Identity & Cadastre */}
              <div className="bg-sand-50/70 p-3 rounded-lg border border-sand-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-mocha-500">Masked Aadhaar:</span>
                  <span className="font-mono font-bold text-mocha-900">{selectedFamily.aadhaar_masked}</span>
                </div>
                {selectedFamily.bhu_aadhaar_ulpin && (
                  <div className="flex justify-between">
                    <span className="text-mocha-500">Bhu-Aadhaar (ULPIN):</span>
                    <span className="font-mono font-semibold text-terra-800">{selectedFamily.bhu_aadhaar_ulpin}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-mocha-500">Acquired Land:</span>
                  <span className="font-bold text-mocha-900">{selectedFamily.land_acquired_hectares} Ha</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mocha-500">Bank Account Verified:</span>
                  <span className={`font-semibold ${selectedFamily.bank_account_verified ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {selectedFamily.bank_account_verified ? 'Verified (PFMS Ready)' : 'Pending Bank Proof'}
                  </span>
                </div>
              </div>

              {/* Entitlement Breakdown */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-mocha-700">Entitlements Package</h4>
                <div className="space-y-1.5 text-xs">
                  {selectedFamily.entitlements.resettlement_house_allotted && (
                    <div className="p-2 bg-emerald-50/60 rounded border border-emerald-200/60 flex items-center justify-between">
                      <span className="text-emerald-900 font-medium">Resettlement House:</span>
                      <span className="font-bold text-emerald-800">{selectedFamily.entitlements.house_unit_no}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1 border-b border-sand-100">
                    <span className="text-mocha-600">Subsistence Grant:</span>
                    <span className="font-semibold text-mocha-900">₹{selectedFamily.entitlements.subsistence_grant_amount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-sand-100">
                    <span className="text-mocha-600">Transportation Grant:</span>
                    <span className="font-semibold text-mocha-900">₹{selectedFamily.entitlements.transportation_allowance.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-sand-100">
                    <span className="text-mocha-600">Resettlement Allowance:</span>
                    <span className="font-semibold text-mocha-900">₹{selectedFamily.entitlements.one_time_resettlement_allowance.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-sand-100">
                    <span className="text-mocha-600">Monthly Annuity:</span>
                    <span className="font-semibold text-indigo-700">₹{selectedFamily.entitlements.annuity_monthly_amount.toLocaleString('en-IN')} / mo</span>
                  </div>
                </div>
              </div>

              {/* Disbursement Action Bar */}
              {canDisburse && (
                <div className="pt-3 border-t border-sand-200 space-y-2">
                  <p className="text-[11px] font-bold text-mocha-700 uppercase tracking-wider">Direct Disbursement Action</p>
                  {selectedFamily.disbursement_status !== 'disbursed' ? (
                    <button
                      onClick={() => handleDisbursement(selectedFamily.id, 'disbursed')}
                      className="w-full py-2 px-3 text-xs font-bold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <CreditCard className="h-4 w-4" />
                      Disburse ₹{(selectedFamily.total_package_inr).toLocaleString('en-IN')} via PFMS
                    </button>
                  ) : (
                    <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      Direct Benefit Transfer Complete
                    </div>
                  )}
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-8 text-center text-mocha-500 text-xs">
              Select an affected family record from the table to inspect entitlement details.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
