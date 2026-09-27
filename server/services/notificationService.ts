import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { isTestEnvironment } from '../config/runtimeEnv';
import {
  CaseNotification,
  NotificationSeverity,
  NotificationEventType,
  NotificationStatus,
  NotificationAction,
  NotificationCounts,
  AcquisitionCase,
  CaseStageInstance,
  CaseDocument,
  Parcel,
  RiskAssessment,
  PredictiveDelayEstimate,
  ExternalObservation,
  DataDiscrepancy,
  Recommendation,
  EvidenceItem,
  UserRole,
} from '../../shared/types';
import {
  getEscalationRulesSync,
  getRiskBandsSync,
  getNotificationPolicySync,
  getEscalationPolicySync,
  getFreshnessPolicySync,
  getBottleneckThresholdsSync,
} from './policyEngine';
import { logCaseEvent } from './auditLogger';
import { AuthorizedScopeFilter, getAuthorizedScopeFilter } from './portfolioAnalyzer';
import { AuthenticatedUser } from '../middleware/auth.middleware';

// In-memory store fallback for offline/development resilience
const inMemoryNotifications: Map<string, CaseNotification> = new Map();

/**
 * Resets the in-memory notification store (critical for test isolation).
 */
export function clearInMemoryNotifications(): void {
  inMemoryNotifications.clear();
}

/**
 * Direct accessor for tests to inspect in-memory notifications.
 */
export function getInMemoryNotifications(): CaseNotification[] {
  return Array.from(inMemoryNotifications.values());
}

/**
 * Enforces strict finite state machine transitions for notifications.
 * Throws an error on illegal state transitions.
 */
export function assertValidTransition(
  currentStatus: NotificationStatus,
  action: NotificationAction
): NotificationStatus {
  // Terminal states cannot be mutated
  if (currentStatus === 'resolved') {
    throw new Error('Illegal transition: Cannot act on a notification that is already resolved.');
  }
  if (currentStatus === 'dismissed') {
    throw new Error('Illegal transition: Cannot act on a notification that is already dismissed.');
  }

  switch (action) {
    case 'acknowledge':
      if (currentStatus === 'acknowledged') {
        throw new Error('Illegal transition: Notification is already acknowledged.');
      }
      return 'acknowledged';

    case 'resolve':
      return 'resolved';

    case 'dismiss':
      return 'dismissed';

    case 'escalate':
      // Escalation retains the existing lifecycle state (unread or acknowledged) while incrementing level
      return currentStatus;

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

export interface EvaluateTriggersParams {
  caseItem: AcquisitionCase;
  stageInstances?: CaseStageInstance[];
  documents?: CaseDocument[];
  parcels?: Parcel[];
  riskAssessment?: RiskAssessment;
  predictiveDelay?: PredictiveDelayEstimate;
  externalObservations?: ExternalObservation[];
  discrepancies?: DataDiscrepancy[];
  recommendations?: Recommendation[];
  downstreamImpactDays?: number;
}

/**
 * Deterministically evaluates operational conditions against active institutional policies.
 * Generates explainable notifications with authentic evidence sources.
 * Never fabricates alerts when evidence is missing.
 */
export async function evaluateOperationalTriggers(
  params: EvaluateTriggersParams
): Promise<CaseNotification[]> {
  const notificationPolicy = getNotificationPolicySync();
  const escalationPolicy = getEscalationPolicySync();
  const riskBands = getRiskBandsSync();
  const bottleneckThresholds = getBottleneckThresholdsSync();
  const freshnessPolicy = getFreshnessPolicySync();

  const caseId = params.caseItem.id;
  const caseNumber = params.caseItem.case_number;
  const caseTitle = params.caseItem.title;
  const projectId = params.caseItem.project_id;
  const state = params.caseItem.state;
  const district = params.caseItem.district;

  // Fetch active notifications for deduplication check
  const existingActive = await fetchNotifications({
    case_id: caseId,
  });

  // Map active notifications by dedup key (only unread and acknowledged are considered active)
  const activeDedupMap = new Map<string, CaseNotification>();
  for (const n of existingActive) {
    if (n.status === 'unread' || n.status === 'acknowledged') {
      const key = n.dedup_key || `${n.case_id}:${n.event_type}:${n.stage_instance_id || 'case'}`;
      activeDedupMap.set(key, n);
    }
  }

  const generatedOrUpdated: CaseNotification[] = [];

  // Helper to process candidate notification through deduplication & persistence
  const processCandidate = async (candidate: {
    event_type: NotificationEventType;
    stage_instance_id?: string | null;
    entity_id?: string;
    title: string;
    message: string;
    severity: NotificationSeverity;
    recipient_role: string;
    evidence: EvidenceItem[];
    metadata?: Record<string, any>;
  }) => {
    const dedupKey = `${caseId}:${candidate.event_type}:${candidate.stage_instance_id || candidate.entity_id || 'root'}`;
    const existing = activeDedupMap.get(dedupKey);

    if (existing) {
      // Deduplication: Condition is already active and unresolved.
      // Check if severity has worsened (e.g. warning -> critical/urgent) or delay increased.
      const severityRanks: Record<NotificationSeverity, number> = {
        info: 1,
        warning: 2,
        critical: 3,
        urgent: 4,
      };

      const hasWorsened = severityRanks[candidate.severity] > severityRanks[existing.severity];

      if (hasWorsened) {
        // Upgrade existing active alert in-place
        existing.severity = candidate.severity;
        existing.message = candidate.message;
        existing.evidence = candidate.evidence;
        existing.metadata = { ...existing.metadata, ...candidate.metadata, upgraded_at: new Date().toISOString() };
        
        inMemoryNotifications.set(existing.id, existing);

        if (isSupabaseConfigured) {
          try {
            const supabase = getSupabase();
            await supabase
              .from('case_notifications')
              .update({
                severity: existing.severity,
                message: existing.message,
                metadata: existing.metadata,
              })
              .eq('id', existing.id);
          } catch (err: any) {
            console.warn('[NotificationService] Supabase alert upgrade warning:', err.message);
          }
        }
        generatedOrUpdated.push(existing);
      }
      // If unchanged or lower severity, retain existing alert and skip creating duplicate
      return;
    }

    // Condition is new OR previous occurrence was already resolved/dismissed.
    // Create a fresh notification.
    const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newNotif: CaseNotification = {
      id: notifId,
      case_id: caseId,
      stage_instance_id: candidate.stage_instance_id || null,
      title: candidate.title,
      message: candidate.message,
      severity: candidate.severity,
      event_type: candidate.event_type,
      recipient_role: candidate.recipient_role,
      status: 'unread',
      dedup_key: dedupKey,
      evidence: candidate.evidence,
      metadata: candidate.metadata || {},
      created_at: new Date().toISOString(),
      case_number: caseNumber,
      case_title: caseTitle,
      project_id: projectId,
      state: state,
      district: district,
      escalation_level: 0,
    };

    inMemoryNotifications.set(newNotif.id, newNotif);

    // Fixtures generate notifications for fabricated cases; keep them in memory.
    if (isSupabaseConfigured && !isTestEnvironment()) {
      try {
        const supabase = getSupabase();
        await supabase.from('case_notifications').insert({
          id: newNotif.id,
          case_id: newNotif.case_id,
          stage_instance_id: newNotif.stage_instance_id,
          title: newNotif.title,
          message: newNotif.message,
          severity: newNotif.severity,
          event_type: newNotif.event_type,
          recipient_role: newNotif.recipient_role,
          status: newNotif.status,
          metadata: {
            ...newNotif.metadata,
            dedup_key: newNotif.dedup_key,
            evidence: newNotif.evidence,
            escalation_level: 0,
            project_id: projectId,
          },
          created_at: newNotif.created_at,
        });
      } catch (err: any) {
        console.warn('[NotificationService] Supabase insert warning:', err.message);
      }
    }

    // Emit audit log
    await logCaseEvent({
      case_id: newNotif.case_id,
      stage_instance_id: newNotif.stage_instance_id || undefined,
      project_id: projectId,
      event_type: 'NOTIFICATION_CREATED',
      title: `Operational Alert Generated: ${newNotif.title}`,
      description: newNotif.message,
      actor_name: 'Institutional Policy Engine',
      metadata: {
        notification_id: newNotif.id,
        event_type: newNotif.event_type,
        severity: newNotif.severity,
        dedup_key: dedupKey,
      },
    });

    generatedOrUpdated.push(newNotif);
  };

  // --------------------------------------------------------------------------
  // 1. Critical Risk Check (Evidence: RiskAssessment)
  // --------------------------------------------------------------------------
  if (params.riskAssessment && typeof params.riskAssessment.overall_risk_score === 'number') {
    if (params.riskAssessment.overall_risk_score >= riskBands.critical_threshold) {
      const evidence: EvidenceItem[] = [
        {
          id: `ev-risk-${Date.now()}`,
          statement: `Composite institutional risk score (${params.riskAssessment.overall_risk_score}/100) exceeds statutory critical threshold of ${riskBands.critical_threshold}.`,
          classification: 'calculated_metric',
          source: 'riskAssessment',
          confidence: params.riskAssessment.confidence || 0.95,
          policy_key: 'risk_bands',
          timestamp: new Date().toISOString(),
        },
      ];

      await processCandidate({
        event_type: 'critical_risk',
        title: `Critical Risk Alert (${params.riskAssessment.overall_risk_score}/100): ${caseNumber}`,
        message: `Case compounded risk has crossed the statutory critical threshold (${params.riskAssessment.overall_risk_score} >= ${riskBands.critical_threshold}). High probability of project schedule failure.`,
        severity: 'urgent',
        recipient_role: 'approver',
        evidence,
        metadata: {
          risk_score: params.riskAssessment.overall_risk_score,
          risk_level: params.riskAssessment.risk_level,
        },
      });
    }
  }

  // --------------------------------------------------------------------------
  // 2. Stage Overdue / Active Bottleneck (Evidence: CaseStageInstance)
  // --------------------------------------------------------------------------
  const stages = params.stageInstances || [];
  for (const st of stages) {
    if ((st.status === 'in_progress' || st.status === 'pending_approval') && (st.delay_days || 0) >= bottleneckThresholds.active_overdue_threshold_days) {
      const delayDays = st.delay_days || 0;
      const severity: NotificationSeverity =
        delayDays >= bottleneckThresholds.critical_overdue_days
          ? 'critical'
          : delayDays >= bottleneckThresholds.high_overdue_days
          ? 'warning'
          : 'info';

      const evidence: EvidenceItem[] = [
        {
          id: `ev-stage-${st.id}`,
          statement: `Milestone "${st.stage?.title || 'Active Stage'}" is ${delayDays} days overdue against its statutory SLA baseline.`,
          classification: 'calculated_metric',
          source: 'bottleneckDetector',
          confidence: 1.0,
          policy_key: 'bottleneck_thresholds',
          timestamp: new Date().toISOString(),
        },
      ];

      await processCandidate({
        event_type: 'stage_overdue',
        stage_instance_id: st.id,
        title: `Milestone Overdue: ${st.stage?.title || 'Active Stage'}`,
        message: `Stage has exceeded statutory SLA deadline by ${delayDays} days. Immediate administrative intervention required.`,
        severity,
        recipient_role: 'lao',
        evidence,
        metadata: { delay_days: delayDays, stage_id: st.stage_id },
      });
    }
  }

  // --------------------------------------------------------------------------
  // 3. Blocked Prerequisite Dependencies (Evidence: blocked stage instances)
  // --------------------------------------------------------------------------
  const blockedStages = stages.filter((s) => s.status === 'blocked');
  if (blockedStages.length > 0) {
    const evidence: EvidenceItem[] = blockedStages.map((st) => ({
      id: `ev-blocked-${st.id}`,
      statement: `Milestone "${st.stage?.title || st.stage_id}" is blocked pending completion of statutory prerequisite milestones.`,
      classification: 'observed_fact',
      source: 'workflowEngine',
      confidence: 1.0,
      policy_key: 'workflow_engine',
      timestamp: new Date().toISOString(),
    }));

    await processCandidate({
      event_type: 'blocked_dependency',
      title: `Critical Path Blocked: ${blockedStages.length} Milestones (${caseNumber})`,
      message: `${blockedStages.length} milestone(s) are blocked by uncompleted prerequisites. Subsequent workflow progression is halted.`,
      severity: 'warning',
      recipient_role: 'project_officer',
      evidence,
      metadata: { blocked_count: blockedStages.length, blocked_stages: blockedStages.map((s) => s.stage_id) },
    });
  }

  // --------------------------------------------------------------------------
  // 4. Statutory Documents Awaiting Verification (Evidence: CaseDocument)
  // --------------------------------------------------------------------------
  const pendingDocs = (params.documents || []).filter((d) => d.status === 'validation_required');
  if (pendingDocs.length > 0) {
    const evidence: EvidenceItem[] = pendingDocs.map((doc) => ({
      id: `ev-doc-${doc.id}`,
      statement: `Statutory document "${doc.title}" requires authorized officer verification before workflow stage clearance.`,
      classification: 'observed_fact',
      source: 'documents',
      confidence: 1.0,
      policy_key: 'escalation_rules',
      timestamp: doc.uploaded_at || new Date().toISOString(),
    }));

    await processCandidate({
      event_type: 'document_awaiting_verification',
      title: `Documents Awaiting Statutory Verification: ${pendingDocs.length} (${caseNumber})`,
      message: `${pendingDocs.length} legal order(s) or gazette notice(s) require authorized officer review and validation.`,
      severity: pendingDocs.length >= 3 ? 'warning' : 'info',
      recipient_role: 'lao',
      evidence,
      metadata: { pending_doc_count: pendingDocs.length, doc_ids: pendingDocs.map((d) => d.id) },
    });
  }

  // --------------------------------------------------------------------------
  // 5. Cadastral Disputes (Evidence: Parcel)
  // --------------------------------------------------------------------------
  const disputedParcels = (params.parcels || []).filter((p) => p.acquisition_status === 'disputed');
  if (disputedParcels.length >= escalationPolicy.dispute_count_escalation_threshold) {
    const evidence: EvidenceItem[] = disputedParcels.map((parcel) => ({
      id: `ev-parcel-${parcel.id}`,
      statement: `Survey No. ${parcel.survey_number} has an active cadastral title dispute or stay litigation.`,
      classification: 'observed_fact',
      source: 'parcels',
      confidence: 1.0,
      policy_key: 'escalation_rules',
      timestamp: new Date().toISOString(),
    }));

    await processCandidate({
      event_type: 'cadastral_dispute',
      title: `Cadastral Litigation Exposure: ${disputedParcels.length} Parcels (${caseNumber})`,
      message: `${disputedParcels.length} survey numbers have recorded disputes. Tribunal reference or revenue dispute resolution required to avoid stay orders.`,
      severity: disputedParcels.length >= 5 ? 'urgent' : 'critical',
      recipient_role: 'lao',
      evidence,
      metadata: { disputed_count: disputedParcels.length, survey_numbers: disputedParcels.map((p) => p.survey_number) },
    });
  }

  // --------------------------------------------------------------------------
  // 6. Empirical Predictive Delay (Evidence: PredictiveDelayEstimate)
  // --------------------------------------------------------------------------
  if (params.predictiveDelay && params.predictiveDelay.expected_additional_delay_days > 0) {
    // Only alert if empirical evidence exists (completed milestones >= 1)
    if (params.predictiveDelay.methodology === 'historical_velocity_and_critical_path_dag') {
      const evidence: EvidenceItem[] = [
        {
          id: `ev-delay-${Date.now()}`,
          statement: `Empirical milestone velocity projects an additional ${params.predictiveDelay.expected_additional_delay_days} days of project schedule slip.`,
          classification: 'predictive_estimate',
          source: 'predictiveDelayEngine',
          confidence: params.predictiveDelay.confidence,
          policy_key: 'predictive_delay_policy',
          timestamp: new Date().toISOString(),
        },
      ];

      await processCandidate({
        event_type: 'predicted_delay',
        title: `Projected Schedule Delay: +${params.predictiveDelay.expected_additional_delay_days} Days (${caseNumber})`,
        message: `Historical velocity indicates completion will slip to ${params.predictiveDelay.projected_completion_date}. Downstream stages affected: ${params.predictiveDelay.affected_downstream_stages_count}.`,
        severity: params.predictiveDelay.expected_additional_delay_days >= 30 ? 'critical' : 'warning',
        recipient_role: 'project_officer',
        evidence,
        metadata: {
          projected_delay_days: params.predictiveDelay.expected_additional_delay_days,
          projected_completion_date: params.predictiveDelay.projected_completion_date,
        },
      });
    }
  }

  // --------------------------------------------------------------------------
  // 7. Stale External Intelligence (Evidence: ExternalObservation)
  // --------------------------------------------------------------------------
  if (params.externalObservations && params.externalObservations.length > 0) {
    const now = Date.now();
    const staleObservations = params.externalObservations.filter((obs) => {
      const ageSeconds = (now - new Date(obs.observed_at).getTime()) / 1000;
      return ageSeconds > freshnessPolicy.stale_seconds;
    });

    if (staleObservations.length > 0) {
      const evidence: EvidenceItem[] = staleObservations.map((obs) => ({
        id: `ev-stale-${obs.id}`,
        statement: `External ${obs.observation_type} observation from provider "${obs.provider}" is stale (${Math.round((now - new Date(obs.observed_at).getTime()) / 3600000)}h old, SLA: ${freshnessPolicy.stale_seconds / 3600}h).`,
        classification: 'observed_fact',
        source: 'freshnessEngine',
        confidence: 1.0,
        policy_key: 'external_freshness_policy',
        timestamp: obs.observed_at,
      }));

      await processCandidate({
        event_type: 'stale_external_data',
        title: `Stale External Intelligence: ${staleObservations.length} Observation(s) (${caseNumber})`,
        message: `External environmental/weather observations have exceeded statutory freshness SLA. Data refresh synchronization required.`,
        severity: 'info',
        recipient_role: 'project_officer',
        evidence,
        metadata: { stale_count: staleObservations.length },
      });
    }
  }

  // --------------------------------------------------------------------------
  // 8. Cross-Source Data Discrepancy (Evidence: DataDiscrepancy)
  // --------------------------------------------------------------------------
  if (params.discrepancies && params.discrepancies.length > 0) {
    const unresolvedDiscrepancies = params.discrepancies.filter((d) => d.resolution_state === 'unresolved');
    if (unresolvedDiscrepancies.length > 0) {
      const evidence: EvidenceItem[] = unresolvedDiscrepancies.map((d) => ({
        id: `ev-disc-${d.id}`,
        statement: `Variance detected between "${d.source_a}" and "${d.source_b}" on field "${d.compared_field}".`,
        classification: 'calculated_metric',
        source: 'discrepancyDetector',
        confidence: 0.9,
        policy_key: 'spatial_discrepancy_policy',
        timestamp: d.detected_at,
      }));

      await processCandidate({
        event_type: 'data_discrepancy',
        title: `Cross-Source Data Discrepancy Detected (${caseNumber})`,
        message: `${unresolvedDiscrepancies.length} discrepancy record(s) detected between authoritative survey and field observations. Reconciliation required.`,
        severity: unresolvedDiscrepancies.some((d) => d.severity === 'critical') ? 'critical' : 'warning',
        recipient_role: 'revenue_inspector',
        evidence,
        metadata: { discrepancy_count: unresolvedDiscrepancies.length },
      });
    }
  }

  // --------------------------------------------------------------------------
  // 9. Downstream Schedule Slip (Evidence: downstreamImpactDays)
  // --------------------------------------------------------------------------
  if (params.downstreamImpactDays && params.downstreamImpactDays > 7) {
    const evidence: EvidenceItem[] = [
      {
        id: `ev-impact-${Date.now()}`,
        statement: `Prerequisite stage delay propagates ${params.downstreamImpactDays} days of net schedule slip downstream along the critical path.`,
        classification: 'calculated_metric',
        source: 'impactAnalyzer',
        confidence: 0.95,
        policy_key: 'operational_attention_policy',
        timestamp: new Date().toISOString(),
      },
    ];

    await processCandidate({
      event_type: 'downstream_impact',
      title: `Downstream Critical Path Slip: ${params.downstreamImpactDays} Days (${caseNumber})`,
      message: `Delay on active prerequisite milestone is propagating downstream delay to subsequent legal notification stages.`,
      severity: params.downstreamImpactDays >= 20 ? 'critical' : 'warning',
      recipient_role: 'project_officer',
      evidence,
      metadata: { downstream_slip_days: params.downstreamImpactDays },
    });
  }

  // --------------------------------------------------------------------------
  // 10. Unresolved Critical Recommendations (Evidence: Recommendation)
  // --------------------------------------------------------------------------
  if (params.recommendations && params.recommendations.length > 0) {
    const criticalRecs = params.recommendations.filter(
      (r) => r.urgency === 'critical' && !r.is_implemented
    );
    if (criticalRecs.length > 0) {
      const evidence: EvidenceItem[] = criticalRecs.map((rec) => ({
        id: `ev-rec-${rec.id}`,
        statement: `Statutory advisory "${rec.title}" (urgency: critical) remains unimplemented.`,
        classification: 'policy_derived_risk',
        source: 'recommendationEngine',
        confidence: rec.confidence || 0.85,
        policy_key: 'recommendation_policy',
        timestamp: rec.created_at,
      }));

      await processCandidate({
        event_type: 'unresolved_recommendation',
        title: `Unimplemented Critical Statutory Advisory (${caseNumber})`,
        message: `${criticalRecs.length} high-priority recommendation(s) remain unimplemented. Action required to mitigate timeline risk.`,
        severity: 'warning',
        recipient_role: 'lao',
        evidence,
        metadata: { recommendation_ids: criticalRecs.map((r) => r.id) },
      });
    }
  }

  return generatedOrUpdated;
}

/**
 * Backward-compatible wrapper for single-case notification evaluation.
 */
export async function evaluateAndGenerateNotifications(params: {
  caseItem: AcquisitionCase;
  stageInstances?: CaseStageInstance[];
  documents?: CaseDocument[];
  parcels?: Parcel[];
  riskAssessment?: RiskAssessment;
}): Promise<CaseNotification[]> {
  return evaluateOperationalTriggers({
    caseItem: params.caseItem,
    stageInstances: params.stageInstances,
    documents: params.documents,
    parcels: params.parcels,
    riskAssessment: params.riskAssessment,
  });
}

/**
 * Fetch persistent notifications applying role-aware scope constraints.
 */
export async function fetchNotifications(filter?: {
  case_id?: string;
  project_id?: string;
  recipient_role?: string;
  status?: string;
  severity?: string;
  event_type?: string;
  limit?: number;
  user?: AuthenticatedUser;
}): Promise<CaseNotification[]> {
  const scope: AuthorizedScopeFilter = getAuthorizedScopeFilter(filter?.user);

  let items: CaseNotification[] = [];

  if (isSupabaseConfigured) {
    try {
      const supabase = getSupabase();
      let query = supabase
        .from('case_notifications')
        .select(`
          *,
          acquisition_cases(case_number, title, project_id, state, district)
        `)
        .order('created_at', { ascending: false });

      if (filter?.case_id) query = query.eq('case_id', filter.case_id);
      if (filter?.status) query = query.eq('status', filter.status);
      if (filter?.severity) query = query.eq('severity', filter.severity);
      if (filter?.event_type) query = query.eq('event_type', filter.event_type);

      if (filter?.limit) query = query.limit(filter.limit);

      const { data, error } = await query;
      if (!error && data) {
        items = data.map((row: any) => ({
          ...row,
          case_number: row.acquisition_cases?.case_number,
          case_title: row.acquisition_cases?.title,
          project_id: row.project_id || row.acquisition_cases?.project_id,
          state: row.state || row.acquisition_cases?.state,
          district: row.district || row.acquisition_cases?.district,
          // Unwrap metadata enrichments if stored in JSONB
          dedup_key: row.dedup_key || row.metadata?.dedup_key,
          evidence: row.evidence || row.metadata?.evidence || [],
          escalation_level: row.escalation_level !== undefined ? row.escalation_level : row.metadata?.escalation_level || 0,
        }));
      }
    } catch (err: any) {
      console.warn('[NotificationService] DB query failed, falling back to memory:', err.message);
    }
  }

  // Merge with memory store if items empty
  if (items.length === 0) {
    items = Array.from(inMemoryNotifications.values());
    if (filter?.case_id) items = items.filter((n) => n.case_id === filter.case_id);
    if (filter?.status) items = items.filter((n) => n.status === filter.status);
    if (filter?.severity) items = items.filter((n) => n.severity === filter.severity);
    if (filter?.event_type) items = items.filter((n) => n.event_type === filter.event_type);
  }

  // Apply server-side role and jurisdiction scoping
  if (scope.isRestricted) {
    items = items.filter((n) => {
      // 1. Project Officer scope: must match assigned project ID
      if (scope.projectIds !== undefined) {
        if (scope.projectIds.length === 0) return false;
        if (!n.project_id || !scope.projectIds.includes(n.project_id)) {
          return false;
        }
      }

      // 2. Revenue Inspector scope: must match assigned state / district
      if (scope.allowedStates !== undefined) {
        if (scope.allowedStates.length === 0) return false;
        if (!n.state || !scope.allowedStates.some((s) => s.toLowerCase() === n.state?.toLowerCase())) {
          return false;
        }
      }
      if (scope.allowedDistricts !== undefined) {
        if (scope.allowedDistricts.length === 0) return false;
        if (!n.district || !scope.allowedDistricts.some((d) => d.toLowerCase() === n.district?.toLowerCase())) {
          return false;
        }
      }

      // 3. Citizen / Viewer confidentiality: viewers cannot view internal operational alerts
      if (scope.userRole === 'viewer') {
        if (n.recipient_role !== 'all' && n.recipient_role !== 'viewer' && n.recipient_role !== 'public') {
          return false;
        }
      }

      return true;
    });
  }

  // Explicit recipient role filter if specified
  if (filter?.recipient_role && filter.recipient_role !== 'all' && filter.recipient_role !== 'admin') {
    items = items.filter((n) => n.recipient_role === filter.recipient_role || n.recipient_role === 'all');
  }

  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (filter?.limit) items = items.slice(0, filter.limit);

  return items;
}

/**
 * Computes aggregated notification counts across status, severity, and categories.
 */
export async function fetchNotificationCounts(user?: AuthenticatedUser): Promise<NotificationCounts> {
  const notifications = await fetchNotifications({ user });

  const counts: NotificationCounts = {
    total_count: notifications.length,
    unread_count: 0,
    acknowledged_count: 0,
    resolved_count: 0,
    dismissed_count: 0,
    urgent_count: 0,
    critical_count: 0,
    warning_count: 0,
    info_count: 0,
    escalated_count: 0,
    by_event_type: {},
  };

  for (const n of notifications) {
    if (n.status === 'unread') counts.unread_count++;
    if (n.status === 'acknowledged') counts.acknowledged_count++;
    if (n.status === 'resolved') counts.resolved_count++;
    if (n.status === 'dismissed') counts.dismissed_count++;

    if (n.severity === 'urgent') counts.urgent_count++;
    if (n.severity === 'critical') counts.critical_count++;
    if (n.severity === 'warning') counts.warning_count++;
    if (n.severity === 'info') counts.info_count++;

    if ((n.escalation_level || 0) > 0) counts.escalated_count++;

    counts.by_event_type[n.event_type] = (counts.by_event_type[n.event_type] || 0) + 1;
  }

  return counts;
}

/**
 * Acknowledge an active notification.
 * Enforces state machine transition (unread -> acknowledged).
 */
export async function acknowledgeNotification(
  id: string,
  actorName: string,
  actorId?: string
): Promise<CaseNotification | null> {
  let notif = inMemoryNotifications.get(id);

  if (!notif && isSupabaseConfigured) {
    const supabase = getSupabase();
    const { data } = await supabase.from('case_notifications').select('*').eq('id', id).single();
    if (data) notif = data as CaseNotification;
  }

  if (!notif) return null;

  // Validate state machine transition
  assertValidTransition(notif.status, 'acknowledge');

  const acknowledgedAt = new Date().toISOString();
  notif.status = 'acknowledged';
  notif.acknowledged_at = acknowledgedAt;
  notif.acknowledged_by = actorName;
  inMemoryNotifications.set(id, notif);

  if (isSupabaseConfigured) {
    try {
      const supabase = getSupabase();
      await supabase
        .from('case_notifications')
        .update({
          status: 'acknowledged',
          acknowledged_at: acknowledgedAt,
          acknowledged_by: actorName,
        })
        .eq('id', id);
    } catch (err: any) {
      console.warn('[NotificationService] Supabase acknowledge failed:', err.message);
    }
  }

  // Emit audit log
  await logCaseEvent({
    case_id: notif.case_id,
    stage_instance_id: notif.stage_instance_id || undefined,
    project_id: notif.project_id,
    event_type: 'NOTIFICATION_ACKNOWLEDGED',
    title: `Alert Acknowledged: ${notif.title}`,
    description: `Alert acknowledged by authorized officer ${actorName}.`,
    actor_name: actorName,
    actor_id: actorId,
    metadata: {
      notification_id: id,
      severity: notif.severity,
      event_type: notif.event_type,
    },
  });

  return notif;
}

/**
 * Resolve an active notification with mandatory action notes.
 * Enforces state machine transition (unread/acknowledged -> resolved).
 */
export async function resolveNotification(
  id: string,
  actorName: string,
  actorId?: string,
  actionTaken?: string
): Promise<CaseNotification | null> {
  let notif = inMemoryNotifications.get(id);

  if (!notif && isSupabaseConfigured) {
    const supabase = getSupabase();
    const { data } = await supabase.from('case_notifications').select('*').eq('id', id).single();
    if (data) notif = data as CaseNotification;
  }

  if (!notif) return null;

  // Validate state machine transition
  assertValidTransition(notif.status, 'resolve');

  const resolvedAt = new Date().toISOString();
  notif.status = 'resolved';
  notif.resolved_at = resolvedAt;
  notif.resolved_by = actorName;
  notif.action_taken = actionTaken || 'Resolved by authorized officer.';
  notif.action_taken_at = resolvedAt;
  notif.action_taken_by = actorName;
  inMemoryNotifications.set(id, notif);

  if (isSupabaseConfigured) {
    try {
      const supabase = getSupabase();
      await supabase
        .from('case_notifications')
        .update({
          status: 'resolved',
          metadata: {
            ...notif.metadata,
            resolved_at: resolvedAt,
            resolved_by: actorName,
            action_taken: notif.action_taken,
          },
        })
        .eq('id', id);
    } catch (err: any) {
      console.warn('[NotificationService] Supabase resolve failed:', err.message);
    }
  }

  // Emit audit log
  await logCaseEvent({
    case_id: notif.case_id,
    stage_instance_id: notif.stage_instance_id || undefined,
    project_id: notif.project_id,
    event_type: 'NOTIFICATION_RESOLVED',
    title: `Alert Resolved: ${notif.title}`,
    description: `Action taken: "${notif.action_taken}". Resolved by ${actorName}.`,
    actor_name: actorName,
    actor_id: actorId,
    metadata: {
      notification_id: id,
      action_taken: notif.action_taken,
      resolved_at: resolvedAt,
    },
  });

  return notif;
}

/**
 * Dismiss an active notification with mandatory justification reason.
 * Enforces state machine transition (unread/acknowledged -> dismissed).
 */
export async function dismissNotification(
  id: string,
  actorName: string,
  actorId?: string,
  reason?: string
): Promise<CaseNotification | null> {
  let notif = inMemoryNotifications.get(id);

  if (!notif && isSupabaseConfigured) {
    const supabase = getSupabase();
    const { data } = await supabase.from('case_notifications').select('*').eq('id', id).single();
    if (data) notif = data as CaseNotification;
  }

  if (!notif) return null;

  // Validate state machine transition
  assertValidTransition(notif.status, 'dismiss');

  const dismissedAt = new Date().toISOString();
  notif.status = 'dismissed';
  notif.dismissed_at = dismissedAt;
  notif.dismissed_by = actorName;
  notif.dismissal_reason = reason || 'Dismissed as non-actionable by authorized officer.';
  inMemoryNotifications.set(id, notif);

  if (isSupabaseConfigured) {
    try {
      const supabase = getSupabase();
      await supabase
        .from('case_notifications')
        .update({
          status: 'dismissed',
          metadata: {
            ...notif.metadata,
            dismissed_at: dismissedAt,
            dismissed_by: actorName,
            dismissal_reason: notif.dismissal_reason,
          },
        })
        .eq('id', id);
    } catch (err: any) {
      console.warn('[NotificationService] Supabase dismiss failed:', err.message);
    }
  }

  // Emit audit log
  await logCaseEvent({
    case_id: notif.case_id,
    stage_instance_id: notif.stage_instance_id || undefined,
    project_id: notif.project_id,
    event_type: 'NOTIFICATION_DISMISSED',
    title: `Alert Dismissed: ${notif.title}`,
    description: `Dismissal justification: "${notif.dismissal_reason}". Dismissed by ${actorName}.`,
    actor_name: actorName,
    actor_id: actorId,
    metadata: {
      notification_id: id,
      dismissal_reason: notif.dismissal_reason,
      dismissed_at: dismissedAt,
    },
  });

  return notif;
}

/**
 * Escalate an active notification according to policy-defined role progression.
 * Elevates severity, reassigns recipient role, increments escalation level, and records audit trail.
 */
export async function escalateNotification(
  id: string,
  actorName: string = 'Institutional Escalation Engine',
  actorId?: string,
  reason?: string
): Promise<CaseNotification | null> {
  let notif = inMemoryNotifications.get(id);

  if (!notif && isSupabaseConfigured) {
    const supabase = getSupabase();
    const { data } = await supabase.from('case_notifications').select('*').eq('id', id).single();
    if (data) notif = data as CaseNotification;
  }

  if (!notif) return null;

  // Validate state machine transition
  assertValidTransition(notif.status, 'escalate');

  const escalationPolicy = getEscalationPolicySync();
  const currentRole = notif.recipient_role;
  const targetRole = escalationPolicy.escalation_target_role_map[currentRole] || 'admin';

  // Elevate severity if possible
  const severityProgression: Record<NotificationSeverity, NotificationSeverity> = {
    info: 'warning',
    warning: 'critical',
    critical: 'urgent',
    urgent: 'urgent',
  };
  const previousSeverity = notif.severity;
  notif.severity = severityProgression[notif.severity];

  const escalatedAt = new Date().toISOString();
  notif.escalation_level = (notif.escalation_level || 0) + 1;
  notif.escalated_at = escalatedAt;
  notif.escalated_to_role = targetRole;
  notif.escalated_by = actorName;
  notif.recipient_role = targetRole; // Reassigned to supervisory role
  inMemoryNotifications.set(id, notif);

  if (isSupabaseConfigured) {
    try {
      const supabase = getSupabase();
      await supabase
        .from('case_notifications')
        .update({
          severity: notif.severity,
          recipient_role: notif.recipient_role,
          metadata: {
            ...notif.metadata,
            escalation_level: notif.escalation_level,
            escalated_at: escalatedAt,
            escalated_to_role: targetRole,
            escalated_by: actorName,
            escalation_reason: reason || 'Statutory unacknowledged alert escalation deadline breached.',
          },
        })
        .eq('id', id);
    } catch (err: any) {
      console.warn('[NotificationService] Supabase escalate failed:', err.message);
    }
  }

  // Emit audit log
  await logCaseEvent({
    case_id: notif.case_id,
    stage_instance_id: notif.stage_instance_id || undefined,
    project_id: notif.project_id,
    event_type: 'NOTIFICATION_ESCALATED',
    title: `Alert Escalated to ${targetRole.toUpperCase()}: ${notif.title}`,
    description: `Escalated from role "${currentRole}" to supervisory role "${targetRole}". Reason: ${reason || 'SLA escalation deadline exceeded'}.`,
    actor_name: actorName,
    actor_id: actorId,
    metadata: {
      notification_id: id,
      previous_role: currentRole,
      new_role: targetRole,
      previous_severity: previousSeverity,
      new_severity: notif.severity,
      escalation_level: notif.escalation_level,
      policy_id: 'escalation_policy',
    },
  });

  return notif;
}
