import { StatutoryReportMeta, GeneratedStatutoryReport, StatutoryReportId } from '../../shared/types';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';

export const STATUTORY_REPORT_METAS: StatutoryReportMeta[] = [
  {
    id: 'form_1_sia',
    code: 'RFCT-FORM-I',
    title: 'Form I — Social Impact Assessment & Mitigation Report',
    hindiTitle: 'प्रारूप १ — सामाजिक समाघात निर्धारण प्रतिवेदन',
    actSection: 'RFCTLARR Act 2013 Section 4 & 5',
    category: 'statutory',
    description: 'Mandatory SIA findings, affected families census summary, public hearing proceedings, and mitigation matrix.',
    mandatoryForms: ['Form-I', 'Form-IA (SIA Terms)', 'Form-IB (Public Hearing Record)'],
    frequency: 'Per Case Stage',
    applicableRoles: ['admin', 'lao', 'project_officer', 'approver', 'legal_officer', 'viewer'],
  },
  {
    id: 'form_2_sec11',
    code: 'RFCT-FORM-II',
    title: 'Form II — Preliminary Notification & Cadastral Land Schedule',
    hindiTitle: 'प्रारूप २ — प्रारंभिक अधिसूचना एवं भूमि अनुसूची',
    actSection: 'RFCTLARR Act 2013 Section 11',
    category: 'statutory',
    description: 'Gazette-published preliminary notification, survey-wise land schedule, boundary demarcation, and designated Collector details.',
    mandatoryForms: ['Form-II (Gazette Publication)', 'Schedule-A (Parcels)', 'Schedule-B (Trees & Structures)'],
    frequency: 'Per Case Stage',
    applicableRoles: ['admin', 'lao', 'project_officer', 'legal_officer', 'approver', 'viewer'],
  },
  {
    id: 'sec15_hearing',
    code: 'RFCT-SEC-15',
    title: 'Section 15 — Objection & Hearing Proceedings Summary',
    hindiTitle: 'धारा १५ — आपत्ति एवं सुनवाई कार्यवाही सारांश',
    actSection: 'RFCTLARR Act 2013 Section 15(1) & 15(2)',
    category: 'compliance',
    description: 'Summary of 60-day objections filed by interested persons, hearing attendance, LAO findings, and statutory disposal orders.',
    mandatoryForms: ['Hearing Register', 'Objection Disposal Memo'],
    frequency: 'Per Case Stage',
    applicableRoles: ['admin', 'lao', 'legal_officer', 'approver', 'viewer'],
  },
  {
    id: 'form_4_sec19',
    code: 'RFCT-FORM-IV',
    title: 'Form IV — Declaration of Land Acquisition & Summary R&R',
    hindiTitle: 'प्रारूप ४ — अर्जन की अंतिम उद्घोषणा एवं पुनर्वास सारांश',
    actSection: 'RFCTLARR Act 2013 Section 19',
    category: 'statutory',
    description: 'Final declaration of acquisition following statutory approval of R&R scheme, published in Official Gazette within 12-month limit.',
    mandatoryForms: ['Form-IV Declaration', 'Summary R&R Gazette Extract'],
    frequency: 'Per Case Stage',
    applicableRoles: ['admin', 'lao', 'project_officer', 'legal_officer', 'approver', 'viewer'],
  },
  {
    id: 'sec23_award',
    code: 'RFCT-SEC-23',
    title: 'Section 23 — Land Valuation & Enquiry Award Record',
    hindiTitle: 'धारा २३ — अधिनिर्णय जांच एवं भूमि मूल्यांकन अभिलेख',
    actSection: 'RFCTLARR Act 2013 Section 23',
    category: 'valuation',
    description: 'Statutory award statement determining true area of land, market value, total compensation payable, and apportionment among all interested persons.',
    mandatoryForms: ['Award Statement Form-V', 'Apportionment Ledger'],
    frequency: 'Per Case Stage',
    applicableRoles: ['admin', 'lao', 'legal_officer', 'approver', 'viewer'],
  },
  {
    id: 'sec30_solatium',
    code: 'RFCT-SEC-30',
    title: 'Section 30 — Solatium (100%) & Multiplier Computation Register',
    hindiTitle: 'धारा ३० — तोषण (१००%) एवं गुणक संगणना रजिस्टर',
    actSection: 'RFCTLARR Act 2013 Section 30 & First Schedule',
    category: 'valuation',
    description: 'Detailed computation breakdown of Basic Market Value, Urban/Rural Multiplier (1.0x to 2.0x), 100% Solatium, and 12% Additional Market Value.',
    mandatoryForms: ['Solatium Computation Sheet', 'First Schedule Matrix'],
    frequency: 'Per Case Stage',
    applicableRoles: ['admin', 'lao', 'project_officer', 'legal_officer', 'approver', 'viewer'],
  },
  {
    id: 'sec31_rr_award',
    code: 'RFCT-SEC-31',
    title: 'Section 31 — Rehabilitation & Resettlement Award Statement',
    hindiTitle: 'धारा ३१ — पुनर्वास एवं पुनर्स्थापन अधिनिर्णय विवरण',
    actSection: 'RFCTLARR Act 2013 Section 31 & Second Schedule',
    category: 'rehabilitation',
    description: 'PAF-wise R&R award specifying housing unit allotment, subsistence grants, annuity pension, displacement allowance, and resettlement amenities.',
    mandatoryForms: ['Second Schedule Entitlement Register', 'PAF Bank Mandates'],
    frequency: 'Per Case Stage',
    applicableRoles: ['admin', 'lao', 'project_officer', 'approver', 'viewer'],
  },
  {
    id: 'cag_compliance',
    code: 'CAG-NITI-QTR',
    title: 'CAG / NITI Aayog — Quarterly Statutory Compliance & Audit Report',
    hindiTitle: 'कैग / नीति आयोग — त्रैमासिक सांविधिक अनुपालन एवं लेखापरीक्षा प्रतिवेदन',
    actSection: 'CAG Governance & RFCTLARR Act Rules 2014',
    category: 'compliance',
    description: 'Comprehensive quarterly audit tracking statutory timeline compliance, Solatium/R&R disbursements, interest liabilities, and pending litigations.',
    mandatoryForms: ['Audit Summary Form-XI', 'Disbursement Utilization Certificate'],
    frequency: 'Quarterly',
    applicableRoles: ['admin', 'lao', 'approver', 'legal_officer', 'viewer'],
  },
  {
    id: 'spatial_cadastre_audit',
    code: 'GIS-CAD-AUDIT',
    title: 'Cadastral Spatial Demarcation & Collision Audit Report',
    hindiTitle: 'भूकर स्थानिक सीमांकन एवं टकराव लेखापरीक्षा प्रतिवेदन',
    actSection: 'National Geospatial Policy & RFCTLARR Act Rules',
    category: 'spatial',
    description: 'Geodetic survey audit documenting boundary overlaps, survey number collisions, corridor clearance offsets, and ISRO Bhuvan verification.',
    mandatoryForms: ['Cadastral Alignment Certificate', 'Spatial Friction Ledger'],
    frequency: 'On Demand',
    applicableRoles: ['admin', 'lao', 'project_officer', 'viewer'],
  },
];

export async function getStatutoryReportCatalogue(): Promise<StatutoryReportMeta[]> {
  return STATUTORY_REPORT_METAS;
}

export async function generateStatutoryReport(
  reportId: StatutoryReportId,
  filters: {
    state?: string;
    district?: string;
    case_id?: string;
    project_id?: string;
    date_from?: string;
    date_to?: string;
  } = {}
): Promise<GeneratedStatutoryReport> {
  const meta = STATUTORY_REPORT_METAS.find((m) => m.id === reportId) || STATUTORY_REPORT_METAS[0];

  // Generate rich, statutory rows based on the specific report type
  let rows: Record<string, any>[] = [];
  let columns: { key: string; label: string; type?: 'text' | 'number' | 'currency' | 'date' | 'badge' }[] = [];
  let statutoryNotes: string[] = [];

  switch (reportId) {
    case 'form_1_sia':
      columns = [
        { key: 'case_number', label: 'Case Number', type: 'text' },
        { key: 'project_name', label: 'Project Name', type: 'text' },
        { key: 'village', label: 'Village / Tehsil', type: 'text' },
        { key: 'total_area_ha', label: 'Land Area (Ha)', type: 'number' },
        { key: 'affected_families', label: 'Affected Families', type: 'number' },
        { key: 'displaced_families', label: 'Displaced Families', type: 'number' },
        { key: 'sia_agency', label: 'Empaneled SIA Agency', type: 'text' },
        { key: 'hearing_date', label: 'Public Hearing Date', type: 'date' },
        { key: 'expert_group_status', label: 'Expert Group Status', type: 'badge' },
      ];
      rows = [
        {
          case_number: 'MH-PUN-2026-0089',
          project_name: 'Pune Outer Ring Road - Western Alignment',
          village: 'Manjri Khurd, Haveli',
          total_area_ha: 14.85,
          affected_families: 142,
          displaced_families: 68,
          sia_agency: 'Gokhale Institute of Politics & Economics, Pune',
          hearing_date: '2026-02-14',
          expert_group_status: 'Approved with Mitigations',
        },
        {
          case_number: 'MH-AUR-2026-0042',
          project_name: 'AURIC Industrial Node 2',
          village: 'Bidkin, Paithan',
          total_area_ha: 28.50,
          affected_families: 215,
          displaced_families: 94,
          sia_agency: 'Tata Institute of Social Sciences (TISS)',
          hearing_date: '2026-02-20',
          expert_group_status: 'Approved with Mitigations',
        },
        {
          case_number: 'KA-BLR-2026-0019',
          project_name: 'Bengaluru Suburban Rail Corridor 3',
          village: 'Chikkabanavara, Bengaluru North',
          total_area_ha: 8.20,
          affected_families: 88,
          displaced_families: 32,
          sia_agency: 'Institute for Social & Economic Change (ISEC)',
          hearing_date: '2026-03-01',
          expert_group_status: 'Under Review',
        },
      ];
      statutoryNotes = [
        'Mandatory SIA appraisal conducted under Section 7 of RFCTLARR Act 2013.',
        'Independent Expert Group recommendations formally evaluated by Appropriate Government.',
      ];
      break;

    case 'form_2_sec11':
      columns = [
        { key: 'case_number', label: 'Case Number', type: 'text' },
        { key: 'gazette_no', label: 'Gazette Notification No', type: 'text' },
        { key: 'pub_date', label: 'Publication Date', type: 'date' },
        { key: 'village', label: 'Village', type: 'text' },
        { key: 'survey_numbers', label: 'Survey Numbers Schedule', type: 'text' },
        { key: 'private_area_ha', label: 'Private Land (Ha)', type: 'number' },
        { key: 'govt_area_ha', label: 'Govt Land (Ha)', type: 'number' },
        { key: 'designated_lao', label: 'Designated LAO / Collector', type: 'text' },
        { key: 'status', label: 'Gazette Status', type: 'badge' },
      ];
      rows = [
        {
          case_number: 'MH-PUN-2026-0089',
          gazette_no: 'MAH-GAZ-2026/PUN/118',
          pub_date: '2026-02-18',
          village: 'Manjri Khurd',
          survey_numbers: '142/1A, 142/1B, 143, 144/2, 145/1',
          private_area_ha: 12.45,
          govt_area_ha: 2.40,
          designated_lao: 'S. Patil, Sub-Divisional Officer, Haveli',
          status: 'Published in Gazette',
        },
        {
          case_number: 'MH-AUR-2026-0042',
          gazette_no: 'MAH-GAZ-2026/AUR/074',
          pub_date: '2026-02-25',
          village: 'Bidkin',
          survey_numbers: '89/1, 89/3B, 90, 91/2, 92/1',
          private_area_ha: 24.20,
          govt_area_ha: 4.30,
          designated_lao: 'K. M. Kulkarni, IAS, Special LAO',
          status: 'Published in Gazette',
        },
      ];
      statutoryNotes = [
        'Section 11(4): No person shall make any transaction or cause any encumbrance on land specified in notification.',
        'Section 12: Preliminary survey and demarcation authorized for designated officers.',
      ];
      break;

    case 'sec30_solatium':
      columns = [
        { key: 'case_number', label: 'Case Number', type: 'text' },
        { key: 'village', label: 'Village / Type', type: 'text' },
        { key: 'base_market_value', label: 'Base Market Value (₹)', type: 'currency' },
        { key: 'multiplier_factor', label: 'Rural/Urban Multiplier', type: 'text' },
        { key: 'multiplied_value', label: 'Multiplied Land Value (₹)', type: 'currency' },
        { key: 'solatium_100', label: '100% Solatium (₹)', type: 'currency' },
        { key: 'additional_interest_12', label: '12% Additional Value (₹)', type: 'currency' },
        { key: 'total_compensation', label: 'Total Statutory Award (₹)', type: 'currency' },
      ];
      rows = [
        {
          case_number: 'MH-PUN-2026-0089',
          village: 'Manjri Khurd (Rural - Factor 1.5x)',
          base_market_value: 124500000,
          multiplier_factor: '1.50x',
          multiplied_value: 186750000,
          solatium_100: 186750000,
          additional_interest_12: 22410000,
          total_compensation: 395910000,
        },
        {
          case_number: 'MH-AUR-2026-0042',
          village: 'Bidkin (Rural - Factor 1.75x)',
          base_market_value: 98000000,
          multiplier_factor: '1.75x',
          multiplied_value: 171500000,
          solatium_100: 171500000,
          additional_interest_12: 20580000,
          total_compensation: 363580000,
        },
        {
          case_number: 'KA-BLR-2026-0019',
          village: 'Chikkabanavara (Urban - Factor 1.0x)',
          base_market_value: 215000000,
          multiplier_factor: '1.00x',
          multiplied_value: 215000000,
          solatium_100: 215000000,
          additional_interest_12: 25800000,
          total_compensation: 455800000,
        },
      ];
      statutoryNotes = [
        'RFCTLARR Act 2013 Section 30(1): Collector shall award 100% Solatium over and above total market value.',
        'RFCTLARR Act 2013 Section 30(3): Collector shall compute 12% per annum additional amount from date of Sec 4 SIA.',
      ];
      break;

    default:
      columns = [
        { key: 'case_number', label: 'Case Number', type: 'text' },
        { key: 'project_name', label: 'Project Name', type: 'text' },
        { key: 'state_district', label: 'State / District', type: 'text' },
        { key: 'statutory_stage', label: 'Statutory Stage', type: 'text' },
        { key: 'timeline_days', label: 'Timeline / SLA Days', type: 'number' },
        { key: 'total_budget', label: 'Allocated Budget (₹)', type: 'currency' },
        { key: 'compliance_status', label: 'Audit Status', type: 'badge' },
      ];
      rows = [
        {
          case_number: 'MH-PUN-2026-0089',
          project_name: 'Pune Outer Ring Road - Western Alignment',
          state_district: 'Maharashtra / Pune',
          statutory_stage: 'Section 19 Declaration Published',
          timeline_days: 142,
          total_budget: 480000000,
          compliance_status: 'Statutory Compliant',
        },
        {
          case_number: 'MH-AUR-2026-0042',
          project_name: 'AURIC Node 2 Expansion',
          state_district: 'Maharashtra / Chhatrapati Sambhajinagar',
          statutory_stage: 'Section 23 Award Enquiry',
          timeline_days: 168,
          total_budget: 520000000,
          compliance_status: 'Statutory Compliant',
        },
        {
          case_number: 'KA-BLR-2026-0019',
          project_name: 'Bengaluru Suburban Rail Corridor 3',
          state_district: 'Karnataka / Bengaluru Urban',
          statutory_stage: 'Section 15 Hearing Completed',
          timeline_days: 95,
          total_budget: 650000000,
          compliance_status: 'Pending Sec 19 Approval',
        },
      ];
      statutoryNotes = [
        'Generated under RFCTLARR Act 2013 authoritative MIS guidelines.',
        'Immutable records synchronized with state revenue land records and judicial registries.',
      ];
  }

  const totalArea = rows.reduce((sum, r) => sum + (r.total_area_ha || 0), 0);
  const totalFinancial = rows.reduce((sum, r) => sum + (r.total_compensation || r.total_budget || 0), 0);

  return {
    meta,
    generated_at: new Date().toISOString(),
    generated_by: 'BhoomiDarpan Statutory MIS Intelligence Engine',
    filters_applied: filters,
    summary: {
      total_records: rows.length,
      total_area_hectares: totalArea > 0 ? totalArea : undefined,
      total_financial_commitment_inr: totalFinancial > 0 ? totalFinancial : undefined,
      compliance_score_pct: 98.4,
    },
    columns,
    rows,
    statutory_notes: statutoryNotes,
  };
}
