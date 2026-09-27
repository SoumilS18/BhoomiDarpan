// ============================================================================
// BhoomiSetu - Public website content configuration
// ----------------------------------------------------------------------------
// Single, data-driven source for the marketing / informational copy shown on
// the public website and the account pages.
//
// WHY THIS EXISTS
//   The public pages must never invent organisations, ministries, contact
//   addresses, certifications or deployment numbers. Every value that a page
//   renders as *fact* is declared here once, so there is exactly one place to
//   audit and exactly one place to change when the deployment's real details
//   become known.
//
// NULLABLE MEANS "NOT CONFIGURED"
//   Optional fields are `null` when this deployment has no authoritative
//   value for them. Pages must render an honest "not configured" state in
//   that case - never a fabricated placeholder.
// ============================================================================

export interface PublicContactConfig {
  /** Operational / support mailbox, if the deployment has one. */
  email: string | null;
  /** Postal address, if the deployment has one. */
  postalAddress: string | null;
  /** Named point of contact, if the deployment has one. */
  pointOfContact: string | null;
  /**
   * Whether a contact-form submission endpoint exists. When `false` the
   * contact page must not render a form that pretends to deliver messages.
   */
  formSubmissionAvailable: boolean;
}

export interface PublicAccessConfig {
  /**
   * Build-time default for whether an access-request submission workflow is
   * believed to exist. The page does NOT trust this value: it asks the API
   * (`GET /api/auth/request-access/status`) and renders a real form only when
   * the backend confirms the workflow is present. Declared here so the default
   * is honest when the probe itself cannot be answered.
   */
  requestSubmissionAvailable: boolean;
  /**
   * Whether account activation (code verification) is wired to a backend
   * workflow. When `false` the activation page shows an honest unavailable
   * state rather than a form that verifies nothing.
   */
  accountActivationAvailable: boolean;
}

export interface PublicConfig {
  /** Product name. */
  name: string;
  /** Native-script wordmark. */
  nativeName: string;
  /** Full official product descriptor used in the hero and page titles. */
  descriptor: string;
  /** One-line positioning statement. */
  tagline: string;
  /** Four-step operating model, in order. */
  operatingModel: string[];
  /**
   * Standing decision-support notice. Rendered on AI-influenced surfaces and
   * referenced from the legal pages.
   */
  decisionSupportNotice: string;
  /**
   * Deployment status statement. Kept factual: it describes what the software
   * is, not who has adopted it.
   */
  deploymentStatement: string;
  contact: PublicContactConfig;
  access: PublicAccessConfig;
}

export const PUBLIC_CONFIG: PublicConfig = {
  name: 'BhoomiSetu',
  nativeName: 'भूमिसेतु',
  descriptor: 'National Land Acquisition Intelligence & Decision-Support System',
  tagline: 'Monitor → Predict → Decide → Act',
  operatingModel: ['Monitor', 'Predict', 'Decide', 'Act'],
  decisionSupportNotice:
    'BhoomiSetu is a decision-support system. Predictions, risk assessments and recommendations are estimates produced from the data available to the platform. They assist — but do not replace — authorised human, legal and administrative decisions.',
  deploymentStatement:
    'BhoomiSetu is software for authorised acquisition, revenue, project and legal officers. It is not an official Government of India website, and access is restricted to personnel issued an account.',
  contact: {
    email: null,
    postalAddress: null,
    pointOfContact: null,
    formSubmissionAvailable: false,
  },
  access: {
    requestSubmissionAvailable: false,
    accountActivationAvailable: false,
  },
};

/** Human-readable "not configured" text for an absent configuration value. */
export const NOT_CONFIGURED_TEXT = 'Not configured for this deployment';

/**
 * Public website metadata used for document titles and share descriptions.
 * Deliberately free of performance claims, adoption claims or certifications.
 */
export const PUBLIC_PAGE_META: Record<string, { title: string; description: string }> = {
  landing: {
    title: 'BhoomiSetu — Land Acquisition Intelligence & Decision-Support',
    description:
      'Case, workflow, GIS and predictive intelligence for land acquisition — one operational view from initiation to observed outcome.',
  },
  about: {
    title: 'About BhoomiSetu',
    description: 'What BhoomiSetu is, the fragmentation it addresses, and how it is designed to be audited.',
  },
  features: {
    title: 'Features — BhoomiSetu',
    description: 'Capability overview across case, workflow, document, GIS, intelligence and analytics modules.',
  },
  howItWorks: {
    title: 'How BhoomiSetu Works',
    description: 'From case initiation to portfolio intelligence: the evidence loop the platform maintains.',
  },
  gisIntelligence: {
    title: 'GIS & Spatial Intelligence — BhoomiSetu',
    description: 'Project geography, acquisition corridors, parcels, administrative boundaries and thematic overlays.',
  },
  decisionSupport: {
    title: 'Decision Support — BhoomiSetu',
    description: 'How risk, delay, bottleneck and recommendation outputs are produced — and where human judgement remains.',
  },
  security: {
    title: 'Security & Governance — BhoomiSetu',
    description: 'Authentication, role-based access, row-level security, audit trail and server-side credential handling.',
  },
  contact: {
    title: 'Contact — BhoomiSetu',
    description: 'Contact and access channels for this deployment.',
  },
  privacy: {
    title: 'Privacy Policy — BhoomiSetu',
    description: 'How BhoomiSetu collects, uses, secures and retains information.',
  },
  terms: {
    title: 'Terms of Use — BhoomiSetu',
    description: 'Conditions for accessing and using the BhoomiSetu platform.',
  },
  accessibility: {
    title: 'Accessibility — BhoomiSetu',
    description: 'The accessibility approach applied to the BhoomiSetu interface.',
  },
};
