import type { UserRole } from '../../shared/types';

export interface DemoRoleAccount {
  role: UserRole;
  email: string;
  password: string;
  name: string;
  roleLabel: string;
  badgeLabel: string;
  department: string;
  description: string;
  iconName: 'admin' | 'lao' | 'project' | 'revenue' | 'legal' | 'approver' | 'viewer';
  category: 'Administration' | 'Land Authority' | 'Project Execution' | 'Field & GIS' | 'Legal' | 'Public';
  highlights: string[];
}

export const DEMO_ROLE_ACCOUNTS: DemoRoleAccount[] = [
  {
    role: 'lao',
    email: 'demo-lao@example.org',
    password: 'CvulhOhb9lq-ESAOTMGYFQv3',
    name: 'Demo Land Acquisition Officer',
    roleLabel: 'Land Acquisition Officer (LAO)',
    badgeLabel: 'Competent Authority',
    department: 'Demonstration — Land Acquisition Office',
    description:
      'Statutory Competent Authority overseeing RFCTLARR Section 11–23 gazettes, valuation awards, public hearings, and compensation disbursement orders.',
    iconName: 'lao',
    category: 'Land Authority',
    highlights: [
      'Section 11/19/23 Gazettes',
      'Valuation Awards & Hearings',
      'Stage Advance Authorisation',
    ],
  },
  {
    role: 'project_officer',
    email: 'demo-project_officer@example.org',
    password: 'PEsgOYBw5UuBJystIijcEBGR',
    name: 'Demo Project Officer',
    roleLabel: 'Project Nodal Officer',
    badgeLabel: 'Requisitioning Agency',
    department: 'Demonstration — Project Execution Cell',
    description:
      'Requisitioning agency lead managing Detailed Project Reports (DPR), infrastructure alignment corridors, survey requisitions, and milestone tracking.',
    iconName: 'project',
    category: 'Project Execution',
    highlights: [
      'DPR Requisitions & Packages',
      'Corridor Alignments & 3D GIS',
      'Agency Timeline Milestones',
    ],
  },
  {
    role: 'revenue_inspector',
    email: 'demo-revenue_inspector@example.org',
    password: 'eCFGo6AuRM3PJgOMvHsbGFRk',
    name: 'Demo Revenue Inspector',
    roleLabel: 'Revenue Inspector / Surveyor',
    badgeLabel: 'Cadastral & PAF Surveys',
    department: 'Demonstration — Revenue Survey Cell',
    description:
      'Field ground-truthing specialist performing cadastral khasra parcel boundaries verification, land classification, and Project Affected Families (PAF) enumeration.',
    iconName: 'revenue',
    category: 'Field & GIS',
    highlights: [
      'Cadastral Ground-Truthing',
      'Khasra GIS Boundary Verification',
      'PAF Socio-Economic Surveys',
    ],
  },
  {
    role: 'approver',
    email: 'demo-approver@example.org',
    password: 'V4G1g3Qag_LGv6UtdPjlMMd-',
    name: 'Demo Approver',
    roleLabel: 'Competent Authority (Approver)',
    badgeLabel: 'District Sanctions',
    department: 'Demonstration — Approvals Committee',
    description:
      'High-level sanctioning authority / District Collector reviewing statutory compliance, approving SIA determinations, Section 19 declarations, and escrow releases.',
    iconName: 'approver',
    category: 'Land Authority',
    highlights: [
      'Statutory Section Approvals',
      'SIA Determination Sanctions',
      'Compensation Escrow Releases',
    ],
  },
  {
    role: 'legal_officer',
    email: 'demo-legal_officer@example.org',
    password: '8SgcKKYWJQDZCwTDkXDvHrex',
    name: 'Demo Legal Officer',
    roleLabel: 'Legal Officer',
    badgeLabel: 'Disputes & Claims',
    department: 'Demonstration — Legal & Claims Cell',
    description:
      'Legal counsel adjudicating land ownership disputes, title objections, Section 64 court references, encumbrance clearances, and compliance litigation.',
    iconName: 'legal',
    category: 'Legal',
    highlights: [
      'Title Claim Objections',
      'Section 64 Court References',
      'Encumbrance & Lien Clearances',
    ],
  },
  {
    role: 'admin',
    email: 'demo-admin@example.org',
    password: '0cCTpboMVderCG8mJmN4Xiv0',
    name: 'Demo Administrator',
    roleLabel: 'System Administrator',
    badgeLabel: 'Full Platform Access',
    department: 'Demonstration — System Administration',
    description:
      'System governance administrator configuring workflow policy thresholds, inspecting immutable audit logs, managing officer access, and tenant rules.',
    iconName: 'admin',
    category: 'Administration',
    highlights: [
      'Security Audit Log Trail',
      'Workflow Policy Engine Rules',
      'Officer Accounts & Access Scope',
    ],
  },
  {
    role: 'viewer',
    email: 'demo-viewer@example.org',
    password: '4ND8syrm_vfWQrTETTR_XQJb',
    name: 'Demo Viewer',
    roleLabel: 'Viewer / Public Citizen',
    badgeLabel: 'Public Transparency',
    department: 'Demonstration — Read-only Observers',
    description:
      'Public observer and citizen persona viewing transparent acquisition progress, published gazette notifications, rehabilitation status, and grievance portals.',
    iconName: 'viewer',
    category: 'Public',
    highlights: [
      'Published Gazette Notifications',
      'Rehabilitation Progress Tracking',
      'Read-Only Public Records',
    ],
  },
];

export const DEMO_ACCOUNTS_MAP: Record<UserRole, DemoRoleAccount> = DEMO_ROLE_ACCOUNTS.reduce(
  (acc, account) => {
    acc[account.role] = account;
    return acc;
  },
  {} as Record<UserRole, DemoRoleAccount>
);
