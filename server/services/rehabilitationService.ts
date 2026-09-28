import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { RehabilitationPlan, AffectedFamily, RehabilitationSummary, RehabPlanStatus, EntitlementStatus } from '../../shared/types';

// In-memory fallback dataset for seamless offline and mock operation
let mockRehabPlans: RehabilitationPlan[] = [
  {
    id: 'rp-pune-ring-001',
    case_id: 'case-harden-pune-001',
    case_number: 'MH-PUN-2026-0089',
    project_id: 'proj-pune-ring-01',
    project_name: 'Pune Outer Ring Road - Western Alignment',
    plan_number: 'RR/MH/PUN/2026/04',
    title: 'Wagholi-Manjri Resettlement & Economic Rehabilitation Scheme',
    status: 'approved',
    affected_families_count: 142,
    displaced_families_count: 68,
    budget_allocated_inr: 85000000,
    budget_disbursed_inr: 54200000,
    administrator_name: 'Dr. Suresh Patil, Additional Collector (R&R)',
    approval_date: '2026-03-15T10:00:00Z',
    resettlement_colonies: [
      {
        id: 'rc-manjri-01',
        name: 'Manjri Green Resettlement Enclave',
        location: 'Manjri Khurd, Haveli Taluka, Pune',
        lgd_village_code: '556102',
        plots_planned: 80,
        plots_allotted: 68,
        civic_amenities: {
          schools: true,
          health_centers: true,
          drinking_water: true,
          electricity: true,
          roads: true,
          community_hall: true,
        },
        completion_pct: 92,
      },
      {
        id: 'rc-wagholi-02',
        name: 'Wagholi Urban Rehabilitation Colony',
        location: 'Wagholi Sector 4, Pune',
        lgd_village_code: '556103',
        plots_planned: 70,
        plots_allotted: 45,
        civic_amenities: {
          schools: true,
          health_centers: false,
          drinking_water: true,
          electricity: true,
          roads: true,
          community_hall: false,
        },
        completion_pct: 78,
      },
    ],
    entitlements_summary: {
      housing_units_allocated: 68,
      subsistence_grants_disbursed: 135,
      annuity_pension_count: 42,
      employment_provided_count: 28,
      skill_development_trained: 64,
    },
    statutory_provisions: [
      'RFCTLARR Act 2013 Section 16 (Preparation of R&R Scheme)',
      'RFCTLARR Act 2013 Section 19 (Publication of Declaration & R&R Summary)',
      'Second Schedule (Mandatory Resettlement & Civic Infrastructure Elements)',
    ],
    created_at: '2026-01-10T08:30:00Z',
    updated_at: '2026-03-20T14:45:00Z',
  },
  {
    id: 'rp-aur-dmic-002',
    case_id: 'case-aur-002',
    case_number: 'MH-AUR-2026-0042',
    project_id: 'proj-dmic-aur-02',
    project_name: 'Aurangabad Industrial City (AURIC) Node 2 Expansion',
    plan_number: 'RR/MH/AUR/2026/09',
    title: 'Shendra-Bidkin Agro-Industrial Resettlement & Skill Transition Plan',
    status: 'executing',
    affected_families_count: 215,
    displaced_families_count: 94,
    budget_allocated_inr: 142000000,
    budget_disbursed_inr: 98000000,
    administrator_name: 'K. M. Kulkarni, IAS (Special LAO & R&R)',
    approval_date: '2026-02-28T11:30:00Z',
    resettlement_colonies: [
      {
        id: 'rc-bidkin-01',
        name: 'Bidkin Model Village R&R Township',
        location: 'Bidkin, Paithan Taluka, Chhatrapati Sambhajinagar',
        lgd_village_code: '548201',
        plots_planned: 120,
        plots_allotted: 94,
        civic_amenities: {
          schools: true,
          health_centers: true,
          drinking_water: true,
          electricity: true,
          roads: true,
          community_hall: true,
        },
        completion_pct: 85,
      },
    ],
    entitlements_summary: {
      housing_units_allocated: 94,
      subsistence_grants_disbursed: 200,
      annuity_pension_count: 58,
      employment_provided_count: 45,
      skill_development_trained: 110,
    },
    statutory_provisions: [
      'RFCTLARR Act 2013 Section 16 & 17',
      'RFCTLARR Third Schedule (Provision of 25 Minimum Infrastructural Facilities)',
    ],
    created_at: '2026-01-18T09:15:00Z',
    updated_at: '2026-03-24T16:20:00Z',
  },
];

let mockAffectedFamilies: AffectedFamily[] = [
  {
    id: 'paf-001',
    case_id: 'case-harden-pune-001',
    case_number: 'MH-PUN-2026-0089',
    project_id: 'proj-pune-ring-01',
    project_name: 'Pune Outer Ring Road - Western Alignment',
    family_head_name: 'Tukaram Pandurang Jadhav',
    aadhaar_masked: 'XXXX-XXXX-3829',
    bhu_aadhaar_ulpin: 'MH-PUN-HAV-556102-0045',
    survey_number: '142/1A',
    village_name: 'Manjri Khurd',
    subdistrict: 'Haveli',
    district: 'Pune',
    state: 'Maharashtra',
    family_members_count: 5,
    vulnerability_category: 'small_farmer' as any,
    land_acquired_hectares: 0.85,
    is_displaced: true,
    entitlements: {
      resettlement_house_allotted: true,
      house_unit_no: 'B-12, Manjri Green Colony',
      subsistence_grant_amount: 36000,
      transportation_allowance: 50000,
      cattle_shed_grant: 25000,
      one_time_resettlement_allowance: 50000,
      annuity_monthly_amount: 2000,
      mandatory_job_offered: true,
    },
    total_package_inr: 850000,
    disbursement_status: 'disbursed',
    disbursed_amount_inr: 850000,
    bank_account_verified: true,
    disbursement_date: '2026-03-10T12:00:00Z',
    grievance_status: 'none',
    created_at: '2026-01-15T10:00:00Z',
  },
  {
    id: 'paf-002',
    case_id: 'case-harden-pune-001',
    case_number: 'MH-PUN-2026-0089',
    project_id: 'proj-pune-ring-01',
    project_name: 'Pune Outer Ring Road - Western Alignment',
    family_head_name: 'Savita Ramchandra Gaikwad',
    aadhaar_masked: 'XXXX-XXXX-9142',
    bhu_aadhaar_ulpin: 'MH-PUN-HAV-556102-0088',
    survey_number: '144/2',
    village_name: 'Manjri Khurd',
    subdistrict: 'Haveli',
    district: 'Pune',
    state: 'Maharashtra',
    family_members_count: 4,
    vulnerability_category: 'women_headed',
    land_acquired_hectares: 0.42,
    is_displaced: true,
    entitlements: {
      resettlement_house_allotted: true,
      house_unit_no: 'A-08, Manjri Green Colony',
      subsistence_grant_amount: 36000,
      transportation_allowance: 50000,
      cattle_shed_grant: 0,
      one_time_resettlement_allowance: 50000,
      annuity_monthly_amount: 2500,
      mandatory_job_offered: false,
    },
    total_package_inr: 720000,
    disbursement_status: 'approved',
    disbursed_amount_inr: 450000,
    bank_account_verified: true,
    disbursement_date: '2026-03-18T14:30:00Z',
    grievance_status: 'none',
    created_at: '2026-01-15T10:30:00Z',
  },
  {
    id: 'paf-003',
    case_id: 'case-aur-002',
    case_number: 'MH-AUR-2026-0042',
    project_id: 'proj-dmic-aur-02',
    project_name: 'Aurangabad Industrial City (AURIC) Node 2 Expansion',
    family_head_name: 'Kashinath Bhimrao Kamble',
    aadhaar_masked: 'XXXX-XXXX-5512',
    bhu_aadhaar_ulpin: 'MH-AUR-PAI-548201-0112',
    survey_number: '89/3B',
    village_name: 'Bidkin',
    subdistrict: 'Paithan',
    district: 'Chhatrapati Sambhajinagar',
    state: 'Maharashtra',
    family_members_count: 6,
    vulnerability_category: 'sc',
    land_acquired_hectares: 1.10,
    is_displaced: true,
    entitlements: {
      resettlement_house_allotted: true,
      house_unit_no: 'C-04, Bidkin Model Township',
      subsistence_grant_amount: 50000,
      transportation_allowance: 50000,
      cattle_shed_grant: 25000,
      one_time_resettlement_allowance: 50000,
      annuity_monthly_amount: 3000,
      mandatory_job_offered: true,
    },
    total_package_inr: 960000,
    disbursement_status: 'verified',
    disbursed_amount_inr: 0,
    bank_account_verified: true,
    grievance_status: 'none',
    created_at: '2026-01-20T11:00:00Z',
  },
  {
    id: 'paf-004',
    case_id: 'case-aur-002',
    case_number: 'MH-AUR-2026-0042',
    project_id: 'proj-dmic-aur-02',
    project_name: 'Aurangabad Industrial City (AURIC) Node 2 Expansion',
    family_head_name: 'Gopal Mohan Rathod',
    aadhaar_masked: 'XXXX-XXXX-7721',
    bhu_aadhaar_ulpin: 'MH-AUR-PAI-548201-0164',
    survey_number: '92/1',
    village_name: 'Bidkin',
    subdistrict: 'Paithan',
    district: 'Chhatrapati Sambhajinagar',
    state: 'Maharashtra',
    family_members_count: 4,
    vulnerability_category: 'st',
    land_acquired_hectares: 0.65,
    is_displaced: false,
    entitlements: {
      resettlement_house_allotted: false,
      subsistence_grant_amount: 36000,
      transportation_allowance: 0,
      cattle_shed_grant: 25000,
      one_time_resettlement_allowance: 25000,
      annuity_monthly_amount: 2000,
      mandatory_job_offered: false,
    },
    total_package_inr: 450000,
    disbursement_status: 'identified',
    disbursed_amount_inr: 0,
    bank_account_verified: false,
    grievance_status: 'pending',
    created_at: '2026-01-22T14:15:00Z',
  },
];

export async function getRehabilitationPlans(): Promise<RehabilitationPlan[]> {
  if (isSupabaseConfigured) {
    try {
      const client = getSupabase();
      const { data, error } = await client
        .from('rehabilitation_plans')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        return data as RehabilitationPlan[];
      }
    } catch {
      // Fall through to memory
    }
  }
  return mockRehabPlans;
}

export async function getRehabilitationPlanById(id: string): Promise<RehabilitationPlan | null> {
  const plans = await getRehabilitationPlans();
  return plans.find((p) => p.id === id) || null;
}

export async function createRehabilitationPlan(plan: Partial<RehabilitationPlan>): Promise<RehabilitationPlan> {
  const newPlan: RehabilitationPlan = {
    id: `rp-${Date.now()}`,
    case_id: plan.case_id,
    case_number: plan.case_number,
    project_id: plan.project_id,
    project_name: plan.project_name,
    plan_number: plan.plan_number || `RR/STAT/${new Date().getFullYear()}/${Math.floor(100 + Math.random() * 900)}`,
    title: plan.title || 'Statutory R&R Scheme',
    status: plan.status || 'draft',
    affected_families_count: plan.affected_families_count || 0,
    displaced_families_count: plan.displaced_families_count || 0,
    budget_allocated_inr: plan.budget_allocated_inr || 0,
    budget_disbursed_inr: plan.budget_disbursed_inr || 0,
    administrator_name: plan.administrator_name || 'Land Acquisition Officer',
    approval_date: plan.approval_date,
    resettlement_colonies: plan.resettlement_colonies || [],
    entitlements_summary: plan.entitlements_summary || {
      housing_units_allocated: 0,
      subsistence_grants_disbursed: 0,
      annuity_pension_count: 0,
      employment_provided_count: 0,
      skill_development_trained: 0,
    },
    statutory_provisions: plan.statutory_provisions || [
      'RFCTLARR Act 2013 Section 16',
      'RFCTLARR Act 2013 Second Schedule',
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  mockRehabPlans.unshift(newPlan);
  return newPlan;
}

export async function updateRehabilitationPlanStatus(id: string, status: RehabPlanStatus): Promise<RehabilitationPlan | null> {
  const plan = mockRehabPlans.find((p) => p.id === id);
  if (plan) {
    plan.status = status;
    plan.updated_at = new Date().toISOString();
    return plan;
  }
  return null;
}

export async function getAffectedFamilies(params?: {
  case_id?: string;
  project_id?: string;
  vulnerability?: string;
  status?: string;
  search?: string;
}): Promise<AffectedFamily[]> {
  let families = [...mockAffectedFamilies];

  if (params?.case_id) {
    families = families.filter((f) => f.case_id === params.case_id);
  }
  if (params?.project_id) {
    families = families.filter((f) => f.project_id === params.project_id);
  }
  if (params?.vulnerability && params.vulnerability !== 'all') {
    families = families.filter((f) => f.vulnerability_category === params.vulnerability);
  }
  if (params?.status && params.status !== 'all') {
    families = families.filter((f) => f.disbursement_status === params.status);
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    families = families.filter(
      (f) =>
        f.family_head_name.toLowerCase().includes(q) ||
        f.survey_number.toLowerCase().includes(q) ||
        f.village_name.toLowerCase().includes(q) ||
        (f.bhu_aadhaar_ulpin && f.bhu_aadhaar_ulpin.toLowerCase().includes(q))
    );
  }

  return families;
}

export async function getAffectedFamilyById(id: string): Promise<AffectedFamily | null> {
  return mockAffectedFamilies.find((f) => f.id === id) || null;
}

export async function createAffectedFamily(data: Partial<AffectedFamily>): Promise<AffectedFamily> {
  const newFamily: AffectedFamily = {
    id: `paf-${Date.now()}`,
    case_id: data.case_id,
    case_number: data.case_number,
    project_id: data.project_id,
    project_name: data.project_name,
    family_head_name: data.family_head_name || 'Family Head',
    aadhaar_masked: data.aadhaar_masked || 'XXXX-XXXX-0000',
    bhu_aadhaar_ulpin: data.bhu_aadhaar_ulpin,
    survey_number: data.survey_number || '0/0',
    village_name: data.village_name || 'Village',
    subdistrict: data.subdistrict || 'Taluka',
    district: data.district || 'District',
    state: data.state || 'State',
    family_members_count: data.family_members_count || 4,
    vulnerability_category: data.vulnerability_category || 'general',
    land_acquired_hectares: data.land_acquired_hectares || 0,
    is_displaced: Boolean(data.is_displaced),
    entitlements: data.entitlements || {
      resettlement_house_allotted: false,
      subsistence_grant_amount: 36000,
      transportation_allowance: 50000,
      cattle_shed_grant: 0,
      one_time_resettlement_allowance: 50000,
      annuity_monthly_amount: 2000,
      mandatory_job_offered: false,
    },
    total_package_inr: data.total_package_inr || 500000,
    disbursement_status: data.disbursement_status || 'identified',
    disbursed_amount_inr: data.disbursed_amount_inr || 0,
    bank_account_verified: Boolean(data.bank_account_verified),
    grievance_status: data.grievance_status || 'none',
    created_at: new Date().toISOString(),
  };

  mockAffectedFamilies.unshift(newFamily);
  return newFamily;
}

export async function updateAffectedFamilyDisbursement(
  id: string,
  status: EntitlementStatus,
  amountDisbursed?: number
): Promise<AffectedFamily | null> {
  const family = mockAffectedFamilies.find((f) => f.id === id);
  if (family) {
    family.disbursement_status = status;
    if (amountDisbursed !== undefined) {
      family.disbursed_amount_inr = amountDisbursed;
    } else if (status === 'disbursed') {
      family.disbursed_amount_inr = family.total_package_inr;
      family.disbursement_date = new Date().toISOString();
    }
    return family;
  }
  return null;
}

export async function getRehabilitationSummary(): Promise<RehabilitationSummary> {
  const plans = await getRehabilitationPlans();
  const families = await getAffectedFamilies();

  const vulnerability_breakdown = families.reduce((acc, f) => {
    acc[f.vulnerability_category] = (acc[f.vulnerability_category] || 0) + 1;
    return acc;
  }, {} as Record<any, number>);

  const disbursement_status_breakdown = families.reduce((acc, f) => {
    acc[f.disbursement_status] = (acc[f.disbursement_status] || 0) + 1;
    return acc;
  }, {} as Record<any, number>);

  const totalColonies = plans.reduce((sum, p) => sum + (p.resettlement_colonies?.length || 0), 0);
  const housingCompleted = plans.reduce(
    (sum, p) => sum + (p.entitlements_summary?.housing_units_allocated || 0),
    0
  );

  return {
    total_plans: plans.length,
    approved_plans: plans.filter((p) => p.status === 'approved' || p.status === 'executing' || p.status === 'completed').length,
    executing_plans: plans.filter((p) => p.status === 'executing').length,
    total_affected_families: families.length,
    total_displaced_families: families.filter((f) => f.is_displaced).length,
    total_budget_allocated_inr: plans.reduce((sum, p) => sum + p.budget_allocated_inr, 0),
    total_budget_disbursed_inr: plans.reduce((sum, p) => sum + p.budget_disbursed_inr, 0),
    resettlement_colonies_count: totalColonies,
    housing_units_completed: housingCompleted,
    vulnerability_breakdown: vulnerability_breakdown as any,
    disbursement_status_breakdown: disbursement_status_breakdown as any,
  };
}
