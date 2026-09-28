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
  X,
  UserPlus,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { AffectedFamily, EntitlementStatus, VulnerabilityCategory } from '../../shared/types';
import { fetchAffectedFamilies, updateAffectedFamilyDisbursement, createAffectedFamily } from '../lib/api';
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

  // Add Family Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    case_number: 'MH-PUN-2026-0089',
    project_name: 'Pune Outer Ring Road - Western Alignment',
    family_head_name: '',
    aadhaar_masked: '',
    bhu_aadhaar_ulpin: '',
    survey_number: '',
    village_name: 'Manjri Khurd',
    subdistrict: 'Haveli',
    district: 'Pune',
    state: 'Maharashtra',
    family_members_count: 4,
    vulnerability_category: 'general' as VulnerabilityCategory,
    land_acquired_hectares: 0.85,
    is_displaced: false,
    resettlement_house_allotted: false,
    house_unit_no: '',
    subsistence_grant_amount: 36000,
    transportation_allowance: 50000,
    cattle_shed_grant: 25000,
    one_time_resettlement_allowance: 50000,
    annuity_monthly_amount: 2500,
    mandatory_job_offered: false,
    total_package_inr: 550000,
    disbursement_status: 'verified' as EntitlementStatus,
    bank_account_verified: true,
  });

  const canDisburse = ['admin', 'lao', 'approver', 'revenue_inspector'].includes(activePersona.role);
  const canAddFamily = ['admin', 'lao', 'revenue_inspector', 'project_officer'].includes(activePersona.role);

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

  const handleAddFamilySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.family_head_name.trim()) {
      setFormError('Family Head Name is required');
      return;
    }
    if (!formData.survey_number.trim()) {
      setFormError('Survey Number is required');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const newFamily = await createAffectedFamily({
        case_number: formData.case_number,
        project_name: formData.project_name,
        family_head_name: formData.family_head_name,
        aadhaar_masked: formData.aadhaar_masked || 'XXXX-XXXX-8921',
        bhu_aadhaar_ulpin: formData.bhu_aadhaar_ulpin || undefined,
        survey_number: formData.survey_number,
        village_name: formData.village_name,
        subdistrict: formData.subdistrict,
        district: formData.district,
        state: formData.state,
        family_members_count: Number(formData.family_members_count),
        vulnerability_category: formData.vulnerability_category,
        land_acquired_hectares: Number(formData.land_acquired_hectares),
        is_displaced: formData.is_displaced,
        entitlements: {
          resettlement_house_allotted: formData.resettlement_house_allotted,
          house_unit_no: formData.resettlement_house_allotted ? formData.house_unit_no || 'Plot A-14' : undefined,
          subsistence_grant_amount: Number(formData.subsistence_grant_amount),
          transportation_allowance: Number(formData.transportation_allowance),
          cattle_shed_grant: Number(formData.cattle_shed_grant),
          one_time_resettlement_allowance: Number(formData.one_time_resettlement_allowance),
          annuity_monthly_amount: Number(formData.annuity_monthly_amount),
          mandatory_job_offered: formData.mandatory_job_offered,
        },
        total_package_inr: Number(formData.total_package_inr),
        disbursement_status: formData.disbursement_status,
        disbursed_amount_inr: formData.disbursement_status === 'disbursed' ? Number(formData.total_package_inr) : 0,
        bank_account_verified: formData.bank_account_verified,
      });

      setFamilies((prev) => [newFamily, ...prev]);
      setSelectedFamily(newFamily);
      setShowAddModal(false);
      // Reset form
      setFormData({
        case_number: 'MH-PUN-2026-0089',
        project_name: 'Pune Outer Ring Road - Western Alignment',
        family_head_name: '',
        aadhaar_masked: '',
        bhu_aadhaar_ulpin: '',
        survey_number: '',
        village_name: 'Manjri Khurd',
        subdistrict: 'Haveli',
        district: 'Pune',
        state: 'Maharashtra',
        family_members_count: 4,
        vulnerability_category: 'general',
        land_acquired_hectares: 0.85,
        is_displaced: false,
        resettlement_house_allotted: false,
        house_unit_no: '',
        subsistence_grant_amount: 36000,
        transportation_allowance: 50000,
        cattle_shed_grant: 25000,
        one_time_resettlement_allowance: 50000,
        annuity_monthly_amount: 2500,
        mandatory_job_offered: false,
        total_package_inr: 550000,
        disbursement_status: 'verified',
        bank_account_verified: true,
      });
    } catch (err: any) {
      setFormError(err.message || 'Failed to add affected family record');
    } finally {
      setIsSubmitting(false);
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
            {canAddFamily && (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-terra-700 text-white hover:bg-terra-800 transition-colors shadow-2xs cursor-pointer"
              >
                <UserPlus className="h-4 w-4" />
                Add Affected Family
              </button>
            )}
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
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-sand-300 bg-white text-mocha-800 hover:bg-sand-50 transition-colors shadow-2xs cursor-pointer"
            >
              <Download className="h-4 w-4 text-mocha-600" />
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
          <p className="text-[11px] text-mocha-500 mt-0.5">SIA baseline validated</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-600">
          <p className="text-xs font-semibold uppercase tracking-wider text-mocha-500">Physically Displaced</p>
          <p className="text-2xl font-bold text-mocha-900 mt-1">{families.filter((f) => f.is_displaced).length}</p>
          <p className="text-[11px] text-amber-800 font-medium mt-0.5">Eligible for colony housing</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-terra-700">
          <p className="text-xs font-semibold uppercase tracking-wider text-mocha-500">Total R&R Entitlements</p>
          <p className="text-2xl font-bold text-mocha-900 mt-1">₹{(totalPackageAmount / 10000000).toFixed(2)} Cr</p>
          <p className="text-[11px] text-mocha-500 mt-0.5">Second Schedule package</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-600">
          <p className="text-xs font-semibold uppercase tracking-wider text-mocha-500">Disbursed via PFMS</p>
          <p className="text-2xl font-bold text-emerald-800 mt-1">₹{(totalDisbursedAmount / 10000000).toFixed(2)} Cr</p>
          <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
            {totalPackageAmount > 0 ? `${((totalDisbursedAmount / totalPackageAmount) * 100).toFixed(1)}% disbursed` : '0%'}
          </p>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 bg-white border border-sand-200 rounded-xl shadow-2xs">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-sand-400" />
            <input
              type="text"
              placeholder="Search by family head, survey number, village or ULPIN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadData()}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-sand-300 bg-sand-50/50 text-mocha-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-terra-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-mocha-500" />
            <select
              value={vulnerabilityFilter}
              onChange={(e) => setVulnerabilityFilter(e.target.value)}
              className="text-xs rounded-lg border border-sand-300 px-2.5 py-1.5 bg-white text-mocha-800 focus:ring-2 focus:ring-terra-600"
            >
              <option value="all">All Vulnerability Classes</option>
              <option value="sc">Scheduled Caste (SC)</option>
              <option value="st">Scheduled Tribe (ST)</option>
              <option value="bpl">Below Poverty Line (BPL)</option>
              <option value="landless_laborer">Landless Laborer</option>
              <option value="artisan">Artisan / Tenant</option>
              <option value="women_headed">Women-Headed</option>
              <option value="general">General Landowner</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs rounded-lg border border-sand-300 px-2.5 py-1.5 bg-white text-mocha-800 focus:ring-2 focus:ring-terra-600"
            >
              <option value="all">All Disbursement States</option>
              <option value="identified">Identified</option>
              <option value="verified">Aadhaar Verified</option>
              <option value="approved">Award Approved</option>
              <option value="disbursed">PFMS Disbursed</option>
              <option value="appealed">Under Grievance</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Split Layout: PAF Registry Table & Entitlement Dossier */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Table View (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-sand-200 bg-sand-100 text-mocha-800 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3.5">Family Head / PAF</th>
                    <th className="py-3 px-3">Survey & Village</th>
                    <th className="py-3 px-3">Vulnerability</th>
                    <th className="py-3 px-3 text-right">Package</th>
                    <th className="py-3 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {families.length > 0 ? (
                    families.map((fam) => {
                      const isSelected = selectedFamily?.id === fam.id;
                      const statusMeta = STATUS_BADGES[fam.disbursement_status] || STATUS_BADGES.identified;
                      const vulnMeta = VULNERABILITY_LABELS[fam.vulnerability_category] || VULNERABILITY_LABELS.general;

                      return (
                        <tr
                          key={fam.id}
                          onClick={() => setSelectedFamily(fam)}
                          className={`hover:bg-sand-50/80 cursor-pointer transition-colors ${
                            isSelected ? 'bg-terra-50/60 font-semibold' : ''
                          }`}
                        >
                          <td className="py-3 px-3.5">
                            <div className="font-bold text-mocha-900">{fam.family_head_name}</div>
                            <div className="text-[11px] text-mocha-500 flex items-center gap-1.5 mt-0.5">
                              <span>{fam.aadhaar_masked}</span>
                              {fam.family_members_count && (
                                <span className="text-[10px] bg-sand-200/70 px-1 rounded text-mocha-700">
                                  {fam.family_members_count} members
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-mono text-terra-900 font-medium">Survey #{fam.survey_number}</div>
                            <div className="text-[11px] text-mocha-600 truncate max-w-[150px]">
                              {fam.village_name}, {fam.district}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border ${vulnMeta.badge}`}
                            >
                              {vulnMeta.label}
                            </span>
                            {fam.is_displaced && (
                              <div className="text-[10px] text-amber-700 font-medium mt-0.5">Displaced</div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums">
                            <div className="font-bold text-mocha-900">₹{fam.total_package_inr.toLocaleString('en-IN')}</div>
                            <div className="text-[10px] text-emerald-700">
                              Disbursed: ₹{fam.disbursed_amount_inr.toLocaleString('en-IN')}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${statusMeta.bg} ${statusMeta.text}`}
                            >
                              {statusMeta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-12">
                        <EmptyState
                          title="No Affected Family Records"
                          description="No families match the search criteria. Click 'Add Affected Family' above to record a new census entry."
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Selected PAF Detail Card (1 Col) */}
        <div className="lg:col-span-1">
          {selectedFamily ? (
            <Card className="p-5 space-y-4 border-terra-200">
              <div className="border-b border-sand-200 pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-bold text-mocha-900">{selectedFamily.family_head_name}</h3>
                    <p className="text-[11px] text-mocha-500 font-mono mt-0.5">ID: {selectedFamily.id}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      STATUS_BADGES[selectedFamily.disbursement_status]?.bg
                    } ${STATUS_BADGES[selectedFamily.disbursement_status]?.text}`}
                  >
                    {STATUS_BADGES[selectedFamily.disbursement_status]?.label}
                  </span>
                </div>
                <p className="text-xs text-mocha-600 mt-2 font-medium">
                  {selectedFamily.village_name}, {selectedFamily.subdistrict}, {selectedFamily.district}
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

      {/* Add Affected Family Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-mocha-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-sand-200 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-sand-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-mocha-900 flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-terra-700" />
                  Add Project Affected Family (PAF) Record
                </h3>
                <p className="text-xs text-mocha-500 mt-0.5">
                  Record socio-economic census details and statutory Second Schedule entitlements.
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-sand-500 hover:bg-sand-100 hover:text-mocha-900 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                {formError}
              </div>
            )}

            <form onSubmit={handleAddFamilySubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-mocha-800 block mb-1">Family Head Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Shankar Patil"
                    value={formData.family_head_name}
                    onChange={(e) => setFormData({ ...formData, family_head_name: e.target.value })}
                    className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-sand-50/50 text-mocha-900 focus:bg-white focus:ring-2 focus:ring-terra-600"
                  />
                </div>

                <div>
                  <label className="font-semibold text-mocha-800 block mb-1">Aadhaar (Masked / Real)</label>
                  <input
                    type="text"
                    placeholder="e.g. XXXX-XXXX-4819"
                    value={formData.aadhaar_masked}
                    onChange={(e) => setFormData({ ...formData, aadhaar_masked: e.target.value })}
                    className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-sand-50/50 text-mocha-900 focus:bg-white focus:ring-2 focus:ring-terra-600"
                  />
                </div>

                <div>
                  <label className="font-semibold text-mocha-800 block mb-1">Survey / Khasra No. *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 142/1B"
                    value={formData.survey_number}
                    onChange={(e) => setFormData({ ...formData, survey_number: e.target.value })}
                    className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-sand-50/50 text-mocha-900 focus:bg-white focus:ring-2 focus:ring-terra-600"
                  />
                </div>

                <div>
                  <label className="font-semibold text-mocha-800 block mb-1">Bhu-Aadhaar (ULPIN)</label>
                  <input
                    type="text"
                    placeholder="e.g. 27-26-004-1421-B091"
                    value={formData.bhu_aadhaar_ulpin}
                    onChange={(e) => setFormData({ ...formData, bhu_aadhaar_ulpin: e.target.value })}
                    className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-sand-50/50 text-mocha-900 focus:bg-white focus:ring-2 focus:ring-terra-600"
                  />
                </div>

                <div>
                  <label className="font-semibold text-mocha-800 block mb-1">Village Name</label>
                  <input
                    type="text"
                    value={formData.village_name}
                    onChange={(e) => setFormData({ ...formData, village_name: e.target.value })}
                    className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-sand-50/50 text-mocha-900 focus:bg-white focus:ring-2 focus:ring-terra-600"
                  />
                </div>

                <div>
                  <label className="font-semibold text-mocha-800 block mb-1">District & State</label>
                  <input
                    type="text"
                    value={`${formData.district}, ${formData.state}`}
                    onChange={(e) => {
                      const parts = e.target.value.split(',');
                      setFormData({
                        ...formData,
                        district: parts[0]?.trim() || formData.district,
                        state: parts[1]?.trim() || formData.state,
                      });
                    }}
                    className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-sand-50/50 text-mocha-900 focus:bg-white focus:ring-2 focus:ring-terra-600"
                  />
                </div>

                <div>
                  <label className="font-semibold text-mocha-800 block mb-1">Vulnerability Category</label>
                  <select
                    value={formData.vulnerability_category}
                    onChange={(e) => setFormData({ ...formData, vulnerability_category: e.target.value as any })}
                    className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-white text-mocha-900 focus:ring-2 focus:ring-terra-600"
                  >
                    <option value="general">General Landowner</option>
                    <option value="sc">Scheduled Caste (SC)</option>
                    <option value="st">Scheduled Tribe (ST)</option>
                    <option value="bpl">Below Poverty Line (BPL)</option>
                    <option value="landless_laborer">Landless Agricultural Laborer</option>
                    <option value="artisan">Village Artisan / Tenant</option>
                    <option value="women_headed">Women-Headed Household</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-mocha-800 block mb-1">Land Acquired (Hectares)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.land_acquired_hectares}
                    onChange={(e) => setFormData({ ...formData, land_acquired_hectares: Number(e.target.value) })}
                    className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-sand-50/50 text-mocha-900 focus:bg-white focus:ring-2 focus:ring-terra-600"
                  />
                </div>

                <div>
                  <label className="font-semibold text-mocha-800 block mb-1">Total Entitlement Package (₹)</label>
                  <input
                    type="number"
                    step="1000"
                    value={formData.total_package_inr}
                    onChange={(e) => setFormData({ ...formData, total_package_inr: Number(e.target.value) })}
                    className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-sand-50/50 text-mocha-900 focus:bg-white focus:ring-2 focus:ring-terra-600 font-bold"
                  />
                </div>

                <div>
                  <label className="font-semibold text-mocha-800 block mb-1">Disbursement Status</label>
                  <select
                    value={formData.disbursement_status}
                    onChange={(e) => setFormData({ ...formData, disbursement_status: e.target.value as any })}
                    className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-white text-mocha-900 focus:ring-2 focus:ring-terra-600"
                  >
                    <option value="identified">SIA Census Identified</option>
                    <option value="verified">Aadhaar / Land Verified</option>
                    <option value="approved">Award Approved</option>
                    <option value="disbursed">PFMS Disbursed</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-sand-200 flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_displaced}
                    onChange={(e) => setFormData({ ...formData, is_displaced: e.target.checked })}
                    className="h-4 w-4 text-terra-700 rounded border-sand-300 focus:ring-terra-600"
                  />
                  <span className="text-xs font-semibold text-mocha-800">Physically Displaced Family</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.resettlement_house_allotted}
                    onChange={(e) => setFormData({ ...formData, resettlement_house_allotted: e.target.checked })}
                    className="h-4 w-4 text-terra-700 rounded border-sand-300 focus:ring-terra-600"
                  />
                  <span className="text-xs font-semibold text-mocha-800">Colony House Allotted</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-sand-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-sand-300 bg-white text-mocha-800 hover:bg-sand-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-terra-700 text-white hover:bg-terra-800 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmitting ? 'Recording...' : 'Save PAF Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
