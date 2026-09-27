// ============================================================================
// BhoomiSetu - Frontend Route Registry (SINGLE SOURCE OF TRUTH)
// ----------------------------------------------------------------------------
// Every navigable surface in the application is declared exactly once here.
// The registry owns: the URL pattern, the module grouping used by the sidebar,
// the display title / breadcrumb label, the lazy-loading boundary, and the
// frontend role visibility metadata.
//
// The registry covers three experience areas (RouteDef.area):
//   'public' - the public marketing / informational website (world-readable)
//   'auth'   - sign-in and account-access surfaces (no fabricated sessions)
//   'app'    - the authenticated BhoomiSetu application (default)
//
// AUTHORISATION NOTE (deliberate):
//   `roles` below governs NAVIGATION VISIBILITY ONLY. It is not, and must
//   never be treated as, a security control. The Express API is the single
//   authority for authorisation (`requireAuth` / `requireRole` in
//   server/middleware/auth.middleware.ts). A user who deep-links to a surface
//   outside their role will still be refused by the backend.
// ============================================================================

import React from 'react';
import type { UserRole } from '../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModuleId =
  | 'dashboard'
  | 'cases'
  | 'projects'
  | 'gis'
  | 'intelligence'
  | 'analytics'
  | 'notifications'
  | 'governance'
  | 'admin';

/** Serialisable icon identifier - resolved to a lucide component inside the sidebar. */
export type IconKey =
  | 'dashboard'
  | 'cases'
  | 'projects'
  | 'gis'
  | 'intelligence'
  | 'analytics'
  | 'notifications'
  | 'governance'
  | 'admin';

export type BadgeSource = 'caseCount' | 'unreadNotifications';
export type WorkspaceEntityType = 'case' | 'project';

/**
 * Experience area a route belongs to: the public website, the authentication /
 * account area, or the authenticated application shell. Omitted means 'app'
 * so the pre-existing operational routes stay untouched.
 */
export type RouteArea = 'public' | 'auth' | 'app';

export type LazyPage = React.LazyExoticComponent<React.ComponentType<any>>;

export interface RouteDef {
  /** Stable identity, also used by the shell to supply page props. */
  id: string;
  /** URL pattern. Supports `:param`, optional `:param?` and a trailing `*`. */
  path: string;
  /** Experience area; omitted means the authenticated application ('app'). */
  area?: RouteArea;
  /** Sidebar grouping. `null` for routes reached from within a module. */
  module: ModuleId | null;
  /** Human label used by navigation. */
  title: string;
  /** Hindi label, shown by the sidebar when expanded. */
  hindiLabel?: string;
  /** Static breadcrumb label. Dynamic entity titles come from page data, never the registry. */
  breadcrumb: string;
  /** One-line description used in navigation tooltips. */
  description?: string;
  iconKey: IconKey;
  /** Frontend navigation visibility only. NOT an authorisation control. */
  roles: UserRole[];
  /** Whether this route appears as a sidebar destination. */
  nav: boolean;
  /** Whether this route appears in the public website header navigation. */
  publicNav?: boolean;
  /** Optional runtime badge binding, resolved by the shell. */
  badgeSource?: BadgeSource;
  /** Workspace identity metadata; URL remains the source of truth. */
  workspace?: {
    entityType?: WorkspaceEntityType;
    param?: string;
    label?: string;
  };
  /**
   * Phase 3 metadata only. Nothing in Phase 0 keeps these views mounted; the
   * flag records which surfaces are worth preserving once the workspace tab
   * system (KeepAliveHost) lands.
   */
  keepAlive: boolean;
  element: LazyPage;
}

// ---------------------------------------------------------------------------
// Role sets - preserved verbatim from the previous Sidebar implementation so
// that navigation visibility is unchanged for the existing eight surfaces.
// ---------------------------------------------------------------------------

const ALL_ROLES: UserRole[] = [
  'admin',
  'project_officer',
  'lao',
  'revenue_inspector',
  'legal_officer',
  'approver',
  'viewer',
];

/** Mirrors the previous `ROLE_AUTHORIZED_DESTINATIONS` entry for `projects`. */
const ALL_ROLES_EXCEPT_REVENUE_INSPECTOR: UserRole[] = ALL_ROLES.filter(
  (role) => role !== 'revenue_inspector'
);

/** Mirrors the previous `ROLE_AUTHORIZED_DESTINATIONS` entry for `intelligence`. */
const INTELLIGENCE_ROLES: UserRole[] = ['admin', 'lao', 'approver', 'project_officer'];

/** Mirrors the previous `ROLE_AUTHORIZED_DESTINATIONS` entry for `analytics`. */
const ANALYTICS_ROLES: UserRole[] = ['admin', 'lao', 'approver'];

/** Mirrors the previous `ROLE_AUTHORIZED_DESTINATIONS` entry for `admin`. */
const ADMIN_ROLES: UserRole[] = ['admin'];

// ---------------------------------------------------------------------------
// Lazy page boundaries (one per page component - not one per in-page tab, so
// that switching a tab does not re-download a chunk)
// ---------------------------------------------------------------------------

const DashboardPage = React.lazy(() =>
  import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const CasesListPage = React.lazy(() =>
  import('../pages/CasesListPage').then((m) => ({ default: m.CasesListPage }))
);
const CaseDetailPage = React.lazy(() =>
  import('../pages/CaseDetailPage').then((m) => ({ default: m.CaseDetailPage }))
);
const ProjectsPage = React.lazy(() =>
  import('../pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage }))
);
const GISSpatialIntelligencePage = React.lazy(() =>
  import('../pages/GISSpatialIntelligencePage').then((m) => ({
    default: m.GISSpatialIntelligencePage,
  }))
);
const IntelligencePage = React.lazy(() =>
  import('../pages/IntelligencePage').then((m) => ({ default: m.IntelligencePage }))
);
const AnalyticsPage = React.lazy(() =>
  import('../pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }))
);
const NotificationsPage = React.lazy(() =>
  import('../pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
);
const GovernancePage = React.lazy(() =>
  import('../pages/GovernancePage').then((m) => ({ default: m.GovernancePage }))
);
const AdministrationPage = React.lazy(() =>
  import('../pages/AdministrationPage').then((m) => ({ default: m.AdministrationPage }))
);
const NotFoundPage = React.lazy(() =>
  import('../pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage }))
);

// Public website pages
const LandingPage = React.lazy(() =>
  import('../pages/public/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const AboutPage = React.lazy(() =>
  import('../pages/public/AboutPage').then((m) => ({ default: m.AboutPage }))
);
const FeaturesPage = React.lazy(() =>
  import('../pages/public/FeaturesPage').then((m) => ({ default: m.FeaturesPage }))
);
const HowItWorksPage = React.lazy(() =>
  import('../pages/public/HowItWorksPage').then((m) => ({ default: m.HowItWorksPage }))
);
const GisIntelligencePage = React.lazy(() =>
  import('../pages/public/GisIntelligencePage').then((m) => ({ default: m.GisIntelligencePage }))
);
const DecisionSupportPage = React.lazy(() =>
  import('../pages/public/DecisionSupportPage').then((m) => ({ default: m.DecisionSupportPage }))
);
const SecurityPage = React.lazy(() =>
  import('../pages/public/SecurityPage').then((m) => ({ default: m.SecurityPage }))
);
const ContactPage = React.lazy(() =>
  import('../pages/public/ContactPage').then((m) => ({ default: m.ContactPage }))
);
const PrivacyPage = React.lazy(() =>
  import('../pages/public/PrivacyPage').then((m) => ({ default: m.PrivacyPage }))
);
const TermsPage = React.lazy(() =>
  import('../pages/public/TermsPage').then((m) => ({ default: m.TermsPage }))
);
const AccessibilityPage = React.lazy(() =>
  import('../pages/public/AccessibilityPage').then((m) => ({ default: m.AccessibilityPage }))
);

// Authentication / account-access pages
const LoginPage = React.lazy(() =>
  import('../pages/auth/LoginPage').then((m) => ({ default: m.LoginPage }))
);
const ForgotPasswordPage = React.lazy(() =>
  import('../pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage }))
);
const ResetPasswordPage = React.lazy(() =>
  import('../pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage }))
);
const ActivateAccountPage = React.lazy(() =>
  import('../pages/auth/ActivateAccountPage').then((m) => ({ default: m.ActivateAccountPage }))
);
const RequestAccessPage = React.lazy(() =>
  import('../pages/auth/RequestAccessPage').then((m) => ({ default: m.RequestAccessPage }))
);

// ---------------------------------------------------------------------------
// Canonical route table
// ---------------------------------------------------------------------------

export const ROUTES: RouteDef[] = [
  // -------------------------------------------------------------------------
  // Public website area. These pages are world-readable: `roles` carries the
  // full set only because the registry contract requires a non-empty role
  // list — it grants no application capability. `module: null` + `nav: false`
  // keeps every public route out of the application sidebar.
  // -------------------------------------------------------------------------
  {
    id: 'public.landing',
    path: '/',
    area: 'public',
    module: null,
    title: 'Home',
    breadcrumb: 'Home',
    description: 'BhoomiSetu — National Land Acquisition Intelligence & Decision-Support',
    iconKey: 'dashboard',
    roles: ALL_ROLES,
    nav: false,
    publicNav: true,
    keepAlive: false,
    element: LandingPage,
  },
  {
    id: 'public.about',
    path: '/about',
    area: 'public',
    module: null,
    title: 'About',
    breadcrumb: 'About',
    description: 'What BhoomiSetu is and the problem it addresses',
    iconKey: 'governance',
    roles: ALL_ROLES,
    nav: false,
    publicNav: true,
    keepAlive: false,
    element: AboutPage,
  },
  {
    id: 'public.features',
    path: '/features',
    area: 'public',
    module: null,
    title: 'Features',
    breadcrumb: 'Features',
    description: 'Platform capabilities by module',
    iconKey: 'cases',
    roles: ALL_ROLES,
    nav: false,
    publicNav: true,
    keepAlive: false,
    element: FeaturesPage,
  },
  {
    id: 'public.howItWorks',
    path: '/how-it-works',
    area: 'public',
    module: null,
    title: 'How It Works',
    breadcrumb: 'How It Works',
    description: 'The land acquisition workflow, end to end',
    iconKey: 'projects',
    roles: ALL_ROLES,
    nav: false,
    publicNav: true,
    keepAlive: false,
    element: HowItWorksPage,
  },
  {
    id: 'public.gisIntelligence',
    path: '/gis-intelligence',
    area: 'public',
    module: null,
    title: 'GIS Intelligence',
    breadcrumb: 'GIS Intelligence',
    description: 'Spatial intelligence and map-based workflows',
    iconKey: 'gis',
    roles: ALL_ROLES,
    nav: false,
    publicNav: true,
    keepAlive: false,
    element: GisIntelligencePage,
  },
  {
    id: 'public.security',
    path: '/security',
    area: 'public',
    module: null,
    title: 'Security',
    breadcrumb: 'Security',
    description: 'How access, data and audit trails are protected',
    iconKey: 'admin',
    roles: ALL_ROLES,
    nav: false,
    publicNav: true,
    keepAlive: false,
    element: SecurityPage,
  },
  {
    id: 'public.decisionSupport',
    path: '/decision-support',
    area: 'public',
    module: null,
    title: 'Decision Support',
    breadcrumb: 'Decision Support',
    description: 'How intelligence supports — never replaces — official decisions',
    iconKey: 'intelligence',
    roles: ALL_ROLES,
    nav: false,
    keepAlive: false,
    element: DecisionSupportPage,
  },
  {
    id: 'public.contact',
    path: '/contact',
    area: 'public',
    module: null,
    title: 'Contact',
    breadcrumb: 'Contact',
    description: 'Contact and support channels',
    iconKey: 'notifications',
    roles: ALL_ROLES,
    nav: false,
    keepAlive: false,
    element: ContactPage,
  },
  {
    id: 'public.privacy',
    path: '/privacy',
    area: 'public',
    module: null,
    title: 'Privacy Policy',
    breadcrumb: 'Privacy',
    description: 'How BhoomiSetu handles personal data',
    iconKey: 'governance',
    roles: ALL_ROLES,
    nav: false,
    keepAlive: false,
    element: PrivacyPage,
  },
  {
    id: 'public.terms',
    path: '/terms',
    area: 'public',
    module: null,
    title: 'Terms of Use',
    breadcrumb: 'Terms',
    description: 'Conditions for using BhoomiSetu',
    iconKey: 'governance',
    roles: ALL_ROLES,
    nav: false,
    keepAlive: false,
    element: TermsPage,
  },
  {
    id: 'public.accessibility',
    path: '/accessibility',
    area: 'public',
    module: null,
    title: 'Accessibility',
    breadcrumb: 'Accessibility',
    description: 'Accessibility statement for this website',
    iconKey: 'dashboard',
    roles: ALL_ROLES,
    nav: false,
    keepAlive: false,
    element: AccessibilityPage,
  },

  // -------------------------------------------------------------------------
  // Authentication / account-access area. No fabricated sessions: these
  // surfaces render the real capability state (Supabase auth when configured,
  // evaluation mode otherwise) and never fake success.
  // -------------------------------------------------------------------------
  {
    id: 'auth.login',
    path: '/login',
    area: 'auth',
    module: null,
    title: 'Sign In',
    breadcrumb: 'Sign In',
    description: 'Sign in to the BhoomiSetu application',
    iconKey: 'admin',
    roles: ALL_ROLES,
    nav: false,
    keepAlive: false,
    element: LoginPage,
  },
  {
    id: 'auth.forgotPassword',
    path: '/forgot-password',
    area: 'auth',
    module: null,
    title: 'Forgot Password',
    breadcrumb: 'Forgot Password',
    description: 'Request a password reset',
    iconKey: 'admin',
    roles: ALL_ROLES,
    nav: false,
    keepAlive: false,
    element: ForgotPasswordPage,
  },
  {
    id: 'auth.resetPassword',
    path: '/reset-password',
    area: 'auth',
    module: null,
    title: 'Reset Password',
    breadcrumb: 'Reset Password',
    description: 'Set a new password using a reset token',
    iconKey: 'admin',
    roles: ALL_ROLES,
    nav: false,
    keepAlive: false,
    element: ResetPasswordPage,
  },
  {
    id: 'auth.activateAccount',
    path: '/activate-account',
    area: 'auth',
    module: null,
    title: 'Activate Account',
    breadcrumb: 'Activate Account',
    description: 'Activate a provisioned BhoomiSetu account',
    iconKey: 'admin',
    roles: ALL_ROLES,
    nav: false,
    keepAlive: false,
    element: ActivateAccountPage,
  },
  {
    id: 'auth.requestAccess',
    path: '/request-access',
    area: 'auth',
    module: null,
    title: 'Request Access',
    breadcrumb: 'Request Access',
    description: 'Request a BhoomiSetu account for your department',
    iconKey: 'admin',
    roles: ALL_ROLES,
    nav: false,
    keepAlive: false,
    element: RequestAccessPage,
  },

  // -------------------------------------------------------------------------
  // Authenticated application area (unchanged operational surfaces)
  // -------------------------------------------------------------------------
  {
    id: 'module.dashboard',
    path: '/dashboard',
    module: 'dashboard',
    title: 'Operational Dashboard',
    hindiLabel: 'डैशबोर्ड',
    breadcrumb: 'Operational Dashboard',
    description: 'National overview, Attention Queue & Workflow Health',
    iconKey: 'dashboard',
    roles: ALL_ROLES,
    nav: true,
    keepAlive: true,
    element: DashboardPage,
  },
  {
    id: 'module.cases',
    path: '/cases',
    module: 'cases',
    title: 'Acquisition Cases',
    hindiLabel: 'भू-अर्जन मामले',
    breadcrumb: 'Case Registry',
    description: 'Registry workspace, high-density case tracking',
    iconKey: 'cases',
    roles: ALL_ROLES,
    nav: true,
    badgeSource: 'caseCount',
    keepAlive: true,
    element: CasesListPage,
  },
  {
    // Reached from the registry (row click / row actions). Not a sidebar item.
    id: 'case.detail',
    path: '/cases/:caseId/:tab?',
    module: 'cases',
    title: 'Case Workspace',
    breadcrumb: 'Acquisition Case',
    description: 'Statutory case workspace with milestone, GIS and document tabs',
    iconKey: 'cases',
    roles: ALL_ROLES,
    nav: false,
    workspace: { entityType: 'case', param: 'caseId', label: 'Case' },
    keepAlive: true,
    element: CaseDetailPage,
  },
  {
    id: 'module.projects',
    path: '/projects',
    module: 'projects',
    title: 'Projects Portfolio',
    hindiLabel: 'परियोजनाएं',
    breadcrumb: 'Projects Portfolio',
    description: 'Corridors, budgets, and aggregated case health',
    iconKey: 'projects',
    roles: ALL_ROLES_EXCEPT_REVENUE_INSPECTOR,
    nav: true,
    keepAlive: false,
    element: ProjectsPage,
  },
  {
    id: 'project.detail',
    path: '/projects/:projectId/:view?',
    module: 'projects',
    title: 'Project Workspace',
    breadcrumb: 'Project Workspace',
    description: 'Project-specific cases, geography, timeline and outcomes',
    iconKey: 'projects',
    roles: ALL_ROLES_EXCEPT_REVENUE_INSPECTOR,
    nav: false,
    workspace: { entityType: 'project', param: 'projectId', label: 'Project' },
    keepAlive: false,
    element: ProjectsPage,
  },
  {
    id: 'module.gis',
    path: '/gis',
    module: 'gis',
    title: 'GIS & Spatial Cadastre',
    hindiLabel: 'स्थानिक नक्शा',
    breadcrumb: 'GIS & Spatial Cadastre',
    description: 'Interactive maps, Bhuvan overlays & parcel boundaries',
    iconKey: 'gis',
    roles: ALL_ROLES,
    nav: true,
    keepAlive: true,
    element: GISSpatialIntelligencePage,
  },
  {
    // `:view` is optional, so bare `/intelligence` resolves to the default sub-tab.
    id: 'module.intelligence',
    path: '/intelligence/:view?',
    module: 'intelligence',
    title: 'Cross-Case Intelligence',
    hindiLabel: 'विश्लेषण केंद्र',
    breadcrumb: 'Cross-Case Intelligence',
    description: 'Systemic bottlenecks, root causes & DAG impact',
    iconKey: 'intelligence',
    roles: INTELLIGENCE_ROLES,
    nav: true,
    keepAlive: true,
    element: IntelligencePage,
  },
  {
    id: 'module.analytics',
    path: '/analytics/:view?',
    module: 'analytics',
    title: 'Portfolio Analytics',
    hindiLabel: 'सांख्यिकी',
    breadcrumb: 'Portfolio Analytics',
    description: 'Trends, geography, SLAs & observed outcomes',
    iconKey: 'analytics',
    roles: ANALYTICS_ROLES,
    nav: true,
    keepAlive: true,
    element: AnalyticsPage,
  },
  {
    id: 'module.notifications',
    path: '/notifications',
    module: 'notifications',
    title: 'Notification Center',
    hindiLabel: 'अधिसूचनाएं',
    breadcrumb: 'Notification Center',
    description: 'SLA triggers, escalation workflow & audit logs',
    iconKey: 'notifications',
    roles: ALL_ROLES,
    nav: true,
    badgeSource: 'unreadNotifications',
    keepAlive: false,
    element: NotificationsPage,
  },
  {
    // Previously implemented but unreachable (imported by nothing). Registered
    // here so the surface becomes deep-linkable. Visibility is deliberately
    // limited to the role that can actually action policy changes, because
    // `PUT /api/policies/:key` is guarded by requireRole(['admin']) server-side.
    id: 'module.governance',
    path: '/governance/:view?',
    module: 'governance',
    title: 'Governance & Policies',
    hindiLabel: 'शासन',
    breadcrumb: 'Governance & Policies',
    description: 'Operational alerts, escalation actions & configurable policies',
    iconKey: 'governance',
    roles: ADMIN_ROLES,
    nav: true,
    keepAlive: false,
    element: GovernancePage,
  },
  {
    id: 'module.admin',
    path: '/admin/:section?',
    module: 'admin',
    title: 'Administration',
    hindiLabel: 'प्रशासन',
    breadcrumb: 'Administration & System Governance',
    description: 'Users, policies, workflow engines & integration registry',
    iconKey: 'admin',
    roles: ADMIN_ROLES,
    nav: true,
    keepAlive: false,
    element: AdministrationPage,
  },
  {
    // Terminal catch-all. `comparePatternScore` always ranks a wildcard below
    // any specific pattern, so table position is belt-and-braces only.
    id: 'system.notFound',
    path: '*',
    module: null,
    title: 'Page Not Found',
    breadcrumb: 'Not Found',
    iconKey: 'dashboard',
    roles: ALL_ROLES,
    nav: false,
    keepAlive: false,
    element: NotFoundPage,
  },
];

// ---------------------------------------------------------------------------
// Canonical entry redirects
// ---------------------------------------------------------------------------

/** Paths that immediately resolve to another path. */
export const ROUTE_REDIRECTS: Record<string, string> = {
  // The empty entry path resolves to the public landing page (front door).
  '': '/',
  // Spec'd aliases for the authentication surfaces.
  '/sign-in': '/login',
  '/account-activation': '/activate-account',
};

/** Returns the canonical target for a redirect path, or `null` when none applies. */
export function resolveRedirect(pathname: string): string | null {
  return ROUTE_REDIRECTS[pathname] ?? null;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export const ROUTE_BY_ID: Record<string, RouteDef> = ROUTES.reduce<Record<string, RouteDef>>(
  (acc, route) => {
    acc[route.id] = route;
    return acc;
  },
  {}
);

export function getRouteById(id: string): RouteDef {
  const route = ROUTE_BY_ID[id];
  if (!route) {
    throw new Error(`Unknown route id: "${id}"`);
  }
  return route;
}

/**
 * Concrete navigation path for a route pattern: strips parameter segments
 * (e.g. `/intelligence/:view?` -> `/intelligence`) so sidebar hrefs never
 * contain raw pattern syntax.
 */
export function navPathForPattern(pattern: string): string {
  const paramIdx = pattern.indexOf('/:');
  const base = paramIdx >= 0 ? pattern.slice(0, paramIdx) : pattern.replace(/\/\*$/, '');
  return base || '/';
}

/** Sidebar destinations available to a role, in registry order. */
export function navRoutesForRole(role: UserRole): RouteDef[] {
  return ROUTES.filter((route) => route.nav && route.roles.includes(role)).map((route) => ({
    ...route,
    path: navPathForPattern(route.path),
  }));
}

/** Header destinations for the public website, in registry order. */
export function publicNavRoutes(): RouteDef[] {
  return ROUTES.filter((route) => route.area === 'public' && route.publicNav === true).map(
    (route) => ({
      ...route,
      path: navPathForPattern(route.path),
    })
  );
}

/** Experience area a route belongs to; routes without an explicit area are application routes. */
export function routeArea(route: RouteDef): RouteArea {
  return route.area ?? 'app';
}

/**
 * Whether a role should be OFFERED a route in navigation.
 * This is presentation metadata, not an authorisation decision.
 */
export function isRouteVisibleToRole(route: RouteDef, role: UserRole): boolean {
  return route.roles.includes(role);
}


