import type {
  UserRole,
  DisputeStatus,
  DisputeType,
  StageInstanceStatus,
  DocumentType,
  DocumentStatus,
  NotificationEventType,
  NotificationSeverity,
  NotificationStatus,
} from '../../shared/types';

// ============================================================================
// BhoomiDarpan - Centralised domain labels
// ----------------------------------------------------------------------------
// Single source of truth for rendering backend enum values as human text.
//
// RULES
//   * Every map here is typed `Record<UserRole, string>` (or equivalent), so
//     the compiler fails if the backend adds a value and the frontend label
//     set is not updated. There is no way to "forget" an enum member.
//   * Labels describe the ROLE/STATUS THE BACKEND DEFINES. They are never a
//     frontend-only variant of a backend value.
//   * Components must not redeclare these lists inline. Import from here.
// ============================================================================

/**
 * Display labels for `UserRole`, keyed by the exact value the API accepts.
 * Exhaustive by construction.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'System Administrator',
  project_officer: 'Project Nodal Officer',
  lao: 'Land Acquisition Officer (LAO)',
  revenue_inspector: 'Revenue Inspector / Surveyor',
  legal_officer: 'Legal Officer',
  approver: 'Competent Authority (Approver)',
  viewer: 'Viewer / Read-only',
};

/** Ordered role list for presentation (matches backend declaration order). */
export const ROLE_ORDER: UserRole[] = [
  'admin',
  'project_officer',
  'lao',
  'revenue_inspector',
  'legal_officer',
  'approver',
  'viewer',
];

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as UserRole] ?? role;
}

// ----------------------------------------------------------------------------
// Workflow stage instance status
// ----------------------------------------------------------------------------

/**
 * Display labels for `StageInstanceStatus`, keyed by the exact value the API
 * accepts. Exhaustive by construction — `skipped` is included precisely
 * because earlier UI omitted it and silently rendered real skipped stages as
 * "Not Started".
 */
export const STAGE_STATUS_LABELS: Record<StageInstanceStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  pending_approval: 'Pending Approval',
  completed: 'Completed',
  blocked: 'Blocked',
  skipped: 'Skipped',
};

/** Every `StageInstanceStatus` in backend declaration order. */
export const STAGE_STATUS_VALUES: StageInstanceStatus[] = [
  'not_started',
  'in_progress',
  'pending_approval',
  'completed',
  'blocked',
  'skipped',
];

export function stageStatusLabel(status: string): string {
  return STAGE_STATUS_LABELS[status as StageInstanceStatus] ?? status;
}

// ----------------------------------------------------------------------------
// Disputes
// ----------------------------------------------------------------------------

/**
 * Display labels for `DisputeStatus`, keyed by the exact value the API accepts.
 * Exhaustive by construction — the compiler rejects an incomplete map.
 */
export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  filed: 'Filed',
  under_review: 'Under Review',
  under_investigation: 'Under Field Investigation',
  hearing_scheduled: 'Hearing Scheduled',
  hearing_held: 'Hearing Held',
  decision_pending: 'Decision Pending',
  resolved: 'Resolved',
  settled: 'Settled / Award Clear',
  rejected: 'Rejected',
  dismissed: 'Dismiss Objection',
  escalated: 'Escalated',
  referred_to_authority: 'Referred to Land Tribunal',
};

/** Every `DisputeStatus` in backend declaration order. */
export const DISPUTE_STATUS_VALUES: DisputeStatus[] = [
  'filed',
  'under_review',
  'under_investigation',
  'hearing_scheduled',
  'hearing_held',
  'decision_pending',
  'resolved',
  'settled',
  'rejected',
  'dismissed',
  'escalated',
  'referred_to_authority',
];

/** Statuses that mean the dispute is no longer open. */
export const CLOSED_DISPUTE_STATUSES: DisputeStatus[] = ['settled', 'dismissed', 'resolved', 'rejected'];

export function disputeStatusLabel(status: string): string {
  return DISPUTE_STATUS_LABELS[status as DisputeStatus] ?? status;
}

/** Display labels for `DisputeType`, keyed by the exact value the API accepts. */
export const DISPUTE_TYPE_LABELS: Record<DisputeType, string> = {
  title_ownership: 'Title Ownership & Succession Claim',
  compensation_quantum: 'Compensation Quantum Enhancement',
  boundary_encroachment: 'Cadastral Boundary Encroachment',
  statutory_eligibility: 'Section 15 Statutory Objection & Eligibility',
  tribunal_reference: 'Tribunal Reference (Section 64/76)',
  other: 'Other / Not Specified',
};

/** Every `DisputeType` in backend declaration order. */
export const DISPUTE_TYPE_VALUES: DisputeType[] = [
  'title_ownership',
  'compensation_quantum',
  'boundary_encroachment',
  'statutory_eligibility',
  'tribunal_reference',
  'other',
];

export function disputeTypeLabel(type: string): string {
  return DISPUTE_TYPE_LABELS[type as DisputeType] ?? type;
}

// ----------------------------------------------------------------------------
// Documents
// ----------------------------------------------------------------------------

/**
 * Display labels for `DocumentType`, keyed by the exact value the API accepts.
 * Exhaustive by construction — this list previously lived inline in a modal,
 * where a new backend document type could never be surfaced.
 */
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  preliminary_notice: 'Preliminary Gazette Notice',
  sec_11_notification: 'Section 11 Preliminary Notification',
  hearing_minutes: 'Section 15 Hearing Minutes & Objections',
  survey_report: 'Cadastral Land Survey & Census Report',
  valuation_record: 'Land & Asset Valuation Statement',
  sec_19_declaration: 'Section 19 Declaration of Acquisition',
  award_order: 'Section 23 / 31 Award & Compensation Order',
  possession_memo: 'Section 38 Possession Certificate / Panchnama',
  litigation_filing: 'Court Stay / Legal Objection Petition',
  miscellaneous: 'Miscellaneous Statutory Record',
};

/** Every `DocumentType` in backend declaration order, ready for a `<select>`. */
export const DOCUMENT_TYPE_OPTIONS: Array<{ value: DocumentType; label: string }> = (
  Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]
).map((value) => ({ value, label: DOCUMENT_TYPE_LABELS[value] }));

export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type as DocumentType] ?? type;
}

/** Display labels for `DocumentStatus`, keyed by the exact value the API accepts. */
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  uploaded: 'Uploaded',
  processing: 'Processing',
  processed: 'Processed',
  extracted: 'Fields Extracted',
  validation_required: 'Validation Required',
  verified: 'Verified',
  rejected: 'Rejected',
  failed: 'Failed',
};

/** Every `DocumentStatus` in backend declaration order. */
export const DOCUMENT_STATUS_VALUES: DocumentStatus[] = [
  'uploaded',
  'processing',
  'processed',
  'extracted',
  'validation_required',
  'verified',
  'rejected',
  'failed',
];

export function documentStatusLabel(status: string): string {
  return DOCUMENT_STATUS_LABELS[status as DocumentStatus] ?? status;
}

// ----------------------------------------------------------------------------
// Notifications
// ----------------------------------------------------------------------------

/**
 * Display labels for `NotificationEventType`, keyed by the exact value the API
 * accepts. Exhaustive by construction — the filter dropdown previously listed
 * only ten of the fourteen types, so four real notification kinds could never
 * be filtered for.
 */
export const NOTIFICATION_EVENT_TYPE_LABELS: Record<NotificationEventType, string> = {
  stage_overdue: 'Milestone Overdue / Bottleneck',
  critical_risk: 'Critical Risk',
  blocked_dependency: 'Blocked Prerequisite',
  document_awaiting_verification: 'Document Awaiting Verification',
  cadastral_dispute: 'Cadastral Dispute',
  workflow_escalation: 'Workflow Escalation',
  predicted_delay: 'Predicted Schedule Delay',
  active_bottleneck: 'Active Bottleneck',
  workflow_deviation: 'Workflow Deviation',
  stale_external_data: 'Stale External Data',
  data_discrepancy: 'Cross-Source Discrepancy',
  document_issue: 'Document Issue',
  downstream_impact: 'Downstream DAG Impact',
  unresolved_recommendation: 'Unimplemented Advisory',
  spatial_overlap: 'Spatial Polygon Overlap',
  cadastral_collision: 'Cadastral Survey Collision',
};

/** Every `NotificationEventType` in backend declaration order. */
export const NOTIFICATION_EVENT_TYPE_VALUES: NotificationEventType[] = [
  'stage_overdue',
  'critical_risk',
  'blocked_dependency',
  'document_awaiting_verification',
  'cadastral_dispute',
  'workflow_escalation',
  'predicted_delay',
  'active_bottleneck',
  'workflow_deviation',
  'stale_external_data',
  'data_discrepancy',
  'document_issue',
  'downstream_impact',
  'unresolved_recommendation',
  'spatial_overlap',
  'cadastral_collision',
];

export function notificationEventTypeLabel(eventType: string): string {
  return NOTIFICATION_EVENT_TYPE_LABELS[eventType as NotificationEventType] ?? eventType;
}

/** Display labels for `NotificationSeverity`, keyed by the exact API value. */
export const NOTIFICATION_SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
  urgent: 'Urgent',
};

/** Every `NotificationSeverity` in backend declaration order. */
export const NOTIFICATION_SEVERITY_VALUES: NotificationSeverity[] = [
  'info',
  'warning',
  'critical',
  'urgent',
];

export function notificationSeverityLabel(severity: string): string {
  return NOTIFICATION_SEVERITY_LABELS[severity as NotificationSeverity] ?? severity;
}

/**
 * Display labels for `NotificationStatus`.
 *
 * NOTE: only these four values may be sent as the `status` query parameter —
 * the API compares them literally. Any composite view (e.g. "Active" =
 * unread + acknowledged) is a client-side presentation, never a status value.
 */
export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  unread: 'Unread',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

/** Every `NotificationStatus` in backend declaration order. */
export const NOTIFICATION_STATUS_VALUES: NotificationStatus[] = [
  'unread',
  'acknowledged',
  'resolved',
  'dismissed',
];

export function notificationStatusLabel(status: string): string {
  return NOTIFICATION_STATUS_LABELS[status as NotificationStatus] ?? status;
}
