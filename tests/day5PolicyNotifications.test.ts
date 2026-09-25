import { describe, expect, it, beforeEach, beforeAll, afterAll } from 'bun:test';
import '../server/index';
import {
  evaluateOperationalTriggers,
  evaluateAndGenerateNotifications,
  fetchNotifications,
  fetchNotificationCounts,
  acknowledgeNotification,
  resolveNotification,
  dismissNotification,
  escalateNotification,
  assertValidTransition,
  clearInMemoryNotifications,
  getInMemoryNotifications,
} from '../server/services/notificationService';
import {
  getNotificationPolicySync,
  getEscalationPolicySync,
  getOperationalAttentionPolicySync,
  updatePolicy,
  resetPoliciesToDefaults,
} from '../server/services/policyEngine';
import {
  clearInMemoryAuditLogs,
  getRecentAuditLogs,
} from '../server/services/auditLogger';
import {
  AcquisitionCase,
  CaseStageInstance,
  CaseDocument,
  Parcel,
  RiskAssessment,
  PredictiveDelayEstimate,
  ExternalObservation,
  DataDiscrepancy,
  Recommendation,
  NotificationStatus,
  NotificationAction,
} from '../shared/types';
import { AuthenticatedUser } from '../server/middleware/auth.middleware';

const SERVER_URL = 'http://127.0.0.1:3001';

describe('Day 5: Policy, Notifications & Operational Governance Suite', () => {
  beforeEach(() => {
    resetPoliciesToDefaults();
    clearInMemoryAuditLogs();
    clearInMemoryNotifications();
  });

  // Base test case fixture (data-driven, zero demo-specific assumptions)
  const createMockCase = (overrides?: Partial<AcquisitionCase>): AcquisitionCase => ({
    id: 'case-test-101',
    project_id: 'prj-west-01',
    case_number: 'CASE/2026/001',
    title: 'Acquisition Corridor Section Alpha',
    description: 'Statutory land parcel acquisition pipeline',
    state: 'State-A',
    district: 'District-X',
    village: 'Village-Y',
    status: 'in_progress',
    priority: 'high',
    total_area_hectares: 120,
    estimated_compensation: 50000000,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  // ==========================================================================
  // 1. POLICY FRAMEWORK: RUNTIME LOADING, MUTATION & RESTORATION
  // ==========================================================================
  describe('1. Policy Framework & Dynamic Thresholds', () => {
    it('retrieves default Day 5 institutional policies with zero hardcoded buried constants', () => {
      const notifPolicy = getNotificationPolicySync();
      expect(notifPolicy).toBeDefined();
      expect(notifPolicy.deduplication_window_hours).toBe(24);
      expect(notifPolicy.acknowledgement_deadline_hours.urgent).toBe(12);
      expect(notifPolicy.acknowledgement_deadline_hours.critical).toBe(24);

      const escPolicy = getEscalationPolicySync();
      expect(escPolicy).toBeDefined();
      expect(escPolicy.critical_risk_auto_escalate).toBe(true);
      expect(escPolicy.escalation_target_role_map.project_officer).toBe('lao');
      expect(escPolicy.escalation_target_role_map.lao).toBe('admin');

      const attPolicy = getOperationalAttentionPolicySync();
      expect(attPolicy).toBeDefined();
      expect(attPolicy.delay_days_threshold).toBe(10);
      expect(attPolicy.downstream_impact_threshold_days).toBe(7);
    });

    it('dynamically updates policy in-flight and logs audit event', async () => {
      const updated = await updatePolicy({
        key: 'notification_policy',
        config_value: {
          eligibility_min_severity: 'warning',
          deduplication_window_hours: 48,
          max_active_notifications_per_case: 5,
          stale_data_notification_behavior: 'suppress',
          acknowledgement_deadline_hours: { urgent: 6, critical: 12, warning: 24, info: 48 },
        },
        actor_name: 'Lead Commissioner',
        actor_id: 'usr-comm-99',
      });

      expect(updated.config_value.deduplication_window_hours).toBe(48);
      const activePolicy = getNotificationPolicySync();
      expect(activePolicy.deduplication_window_hours).toBe(48);
      expect(activePolicy.acknowledgement_deadline_hours.urgent).toBe(6);

      // Verify audit trail recorded policy update
      const audits = getRecentAuditLogs(10);
      const policyAudit = audits.find((a) => a.event_type === 'POLICY_UPDATED');
      expect(policyAudit).toBeDefined();
      expect(policyAudit?.actor_name).toBe('Lead Commissioner');
    });

    it('cleanly resets policies to defaults for test isolation', () => {
      resetPoliciesToDefaults();
      const resetPolicy = getNotificationPolicySync();
      expect(resetPolicy.deduplication_window_hours).toBe(24);
    });
  });

  // ==========================================================================
  // 2. EVIDENCE-VERIFIED DETERMINISTIC TRIGGER ENGINE
  // ==========================================================================
  describe('2. Deterministic Trigger Engine (Zero Fabricated Alerts)', () => {
    it('triggers critical_risk notification ONLY when authentic risk assessment >= critical threshold', async () => {
      const mockCase = createMockCase();

      // Case A: Risk score 40 (Moderate) -> Below threshold (75) -> Should NOT trigger critical_risk
      const moderateRisk: RiskAssessment = {
        case_id: mockCase.id,
        overall_risk_score: 40,
        risk_level: 'medium',
        confidence: 0.9,
        predicted_delay_days: 5,
        factor_breakdown: {
          schedule_delay_score: 40,
          dependency_blockage_score: 0,
          missing_documents_score: 0,
          cadastral_dispute_score: 0,
          details: [],
        },
        observed_facts: [],
        ai_inferences: [],
        generated_at: new Date().toISOString(),
      };

      const alertsA = await evaluateOperationalTriggers({
        caseItem: mockCase,
        riskAssessment: moderateRisk,
      });
      expect(alertsA.filter((a) => a.event_type === 'critical_risk')).toHaveLength(0);

      // Case B: Risk score 82 (Critical) -> >= 75 -> Must trigger urgent critical_risk with explainable evidence
      const criticalRisk: RiskAssessment = {
        ...moderateRisk,
        overall_risk_score: 82,
        risk_level: 'critical',
      };

      const alertsB = await evaluateOperationalTriggers({
        caseItem: mockCase,
        riskAssessment: criticalRisk,
      });
      const riskAlert = alertsB.find((a) => a.event_type === 'critical_risk');
      expect(riskAlert).toBeDefined();
      expect(riskAlert?.severity).toBe('urgent');
      expect(riskAlert?.recipient_role).toBe('approver');
      expect(riskAlert?.evidence).toBeDefined();
      expect(riskAlert?.evidence?.[0].policy_key).toBe('risk_bands');
      expect(riskAlert?.evidence?.[0].statement).toContain('82/100');
    });

    it('triggers predicted_delay alert ONLY when empirical completed milestones >= 1', async () => {
      const mockCase = createMockCase();

      // Baseline only (0 milestones completed) -> Limitations present -> Skips predicted_delay
      const baselineEstimate: PredictiveDelayEstimate = {
        current_stage_delay_risk_days: 0,
        expected_additional_delay_days: 14,
        min_projected_delay_days: 7,
        max_projected_delay_days: 21,
        confidence: 0.4,
        probability_of_further_delay: 0.5,
        historical_velocity_ratio: 1.0,
        projected_completion_date: '2026-12-31',
        affected_downstream_stages_count: 3,
        major_contributing_factors: [],
        limitations: ['0 milestones completed: baseline statutory extrapolation only'],
        methodology: 'statutory_baseline_only',
      };

      const alertsBaseline = await evaluateOperationalTriggers({
        caseItem: mockCase,
        predictiveDelay: baselineEstimate,
      });
      expect(alertsBaseline.filter((a) => a.event_type === 'predicted_delay')).toHaveLength(0);

      // Empirical velocity projection (milestones >= 1 completed) -> Triggers predicted_delay with evidence
      const empiricalEstimate: PredictiveDelayEstimate = {
        ...baselineEstimate,
        confidence: 0.85,
        methodology: 'historical_velocity_and_critical_path_dag',
      };

      const alertsEmpirical = await evaluateOperationalTriggers({
        caseItem: mockCase,
        predictiveDelay: empiricalEstimate,
      });
      const delayAlert = alertsEmpirical.find((a) => a.event_type === 'predicted_delay');
      expect(delayAlert).toBeDefined();
      expect(delayAlert?.severity).toBe('warning');
      expect(delayAlert?.recipient_role).toBe('project_officer');
      expect(delayAlert?.evidence?.[0].classification).toBe('predictive_estimate');
    });

    it('triggers active_bottleneck alert when stage overdue exceeds policy threshold', async () => {
      const mockCase = createMockCase();
      const stages: CaseStageInstance[] = [
        {
          id: 'stg-inst-1',
          case_id: mockCase.id,
          stage_id: 'stg-11',
          stage_number: 1,
          status: 'in_progress',
          planned_start_date: '2026-01-01',
          planned_end_date: '2026-01-20',
          actual_start_date: '2026-01-01',
          delay_days: 18,
          stage: {
            id: 'stg-11',
            workflow_id: 'wf-1',
            stage_number: 1,
            code: 'SEC_11_NOTIF',
            title: 'Section 11 Preliminary Notification',
            default_duration_days: 20,
            is_mandatory: true,
            required_documents: ['notification_gazette'],
            completion_criteria: {},
            escalation_threshold_days: 15,
            created_at: new Date().toISOString(),
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const alerts = await evaluateOperationalTriggers({
        caseItem: mockCase,
        stageInstances: stages,
      });

      const bottleneckAlert = alerts.find((a) => a.event_type === 'stage_overdue');
      expect(bottleneckAlert).toBeDefined();
      expect(bottleneckAlert?.severity).toBe('warning');
      expect(bottleneckAlert?.recipient_role).toBe('lao');
      expect(bottleneckAlert?.evidence?.[0].statement).toContain('18 days overdue');
    });

    it('triggers stale_external_data alert ONLY when actual observation exceeds freshness SLA', async () => {
      const mockCase = createMockCase();

      // Case A: No observations -> Zero alerts
      const alertsEmpty = await evaluateOperationalTriggers({
        caseItem: mockCase,
        externalObservations: [],
      });
      expect(alertsEmpty.filter((a) => a.event_type === 'stale_external_data')).toHaveLength(0);

      // Case B: Fresh observation (10 mins old, SLA: 24h) -> Zero alerts
      const freshObs: ExternalObservation = {
        id: 'obs-fresh',
        source_id: 'src-weather-1',
        provider: 'OpenMeteo',
        observation_type: 'weather',
        entity_type: 'case',
        entity_id: mockCase.id,
        observed_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        retrieved_at: new Date().toISOString(),
        valid_from: new Date().toISOString(),
        normalized_values: { temperature_c: 28 },
        units: {},
        freshness_state: 'fresh',
        metadata: {},
        created_at: new Date().toISOString(),
      };
      const alertsFresh = await evaluateOperationalTriggers({
        caseItem: mockCase,
        externalObservations: [freshObs],
      });
      expect(alertsFresh.filter((a) => a.event_type === 'stale_external_data')).toHaveLength(0);

      // Case C: Stale observation (36 hours old > 24h SLA) -> Triggers stale_external_data
      const staleObs: ExternalObservation = {
        ...freshObs,
        id: 'obs-stale',
        observed_at: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
        freshness_state: 'stale',
      };
      const alertsStale = await evaluateOperationalTriggers({
        caseItem: mockCase,
        externalObservations: [staleObs],
      });
      const staleAlert = alertsStale.find((a) => a.event_type === 'stale_external_data');
      expect(staleAlert).toBeDefined();
      expect(staleAlert?.evidence?.[0].source).toBe('freshnessEngine');
    });

    it('triggers data_discrepancy alert when unresolved spatial/attribute variance exists', async () => {
      const mockCase = createMockCase();
      const discrepancies: DataDiscrepancy[] = [
        {
          id: 'disc-01',
          entity_type: 'case',
          entity_id: mockCase.id,
          source_a: 'Revenue Records',
          source_b: 'Drone Survey GIS',
          compared_field: 'centroid_coordinates',
          value_a: { lat: 28.5, lng: 77.2 },
          value_b: { lat: 28.51, lng: 77.21 },
          discrepancy_type: 'coordinates_mismatch',
          severity: 'high',
          detected_at: new Date().toISOString(),
          resolution_state: 'unresolved',
          metadata: {},
          created_at: new Date().toISOString(),
        },
      ];

      const alerts = await evaluateOperationalTriggers({
        caseItem: mockCase,
        discrepancies,
      });

      const discAlert = alerts.find((a) => a.event_type === 'data_discrepancy');
      expect(discAlert).toBeDefined();
      expect(discAlert?.recipient_role).toBe('revenue_inspector');
      expect(discAlert?.evidence?.[0].source).toBe('discrepancyDetector');
    });
  });

  // ==========================================================================
  // 3. DEDUPLICATION: PREVENTS ALERTS STORMS WITHOUT SUPPRESSING RECURRING EVENTS
  // ==========================================================================
  describe('3. Deduplication Engine (Unresolved vs. Legitimate Recurring)', () => {
    it('deduplicates identical active triggers without creating duplicate records', async () => {
      const mockCase = createMockCase();
      const stages: CaseStageInstance[] = [
        {
          id: 'stg-inst-dedup',
          case_id: mockCase.id,
          stage_id: 'stg-11',
          stage_number: 1,
          status: 'in_progress',
          planned_start_date: '2026-01-01',
          planned_end_date: '2026-01-20',
          actual_start_date: '2026-01-01',
          delay_days: 10,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      // First run: Creates 1 notification
      const run1 = await evaluateOperationalTriggers({
        caseItem: mockCase,
        stageInstances: stages,
      });
      expect(run1).toHaveLength(1);
      const firstId = run1[0].id;

      // Second run with identical condition: Should retain existing without creating duplicate
      const run2 = await evaluateOperationalTriggers({
        caseItem: mockCase,
        stageInstances: stages,
      });
      expect(run2).toHaveLength(0); // No new alerts generated

      const totalActive = await fetchNotifications({ case_id: mockCase.id });
      expect(totalActive).toHaveLength(1);
      expect(totalActive[0].id).toBe(firstId);
    });

    it('upgrades existing active notification in-place when condition worsens', async () => {
      const mockCase = createMockCase();
      const stagesMinor: CaseStageInstance[] = [
        {
          id: 'stg-inst-worsen',
          case_id: mockCase.id,
          stage_id: 'stg-11',
          stage_number: 1,
          status: 'in_progress',
          planned_start_date: '2026-01-01',
          planned_end_date: '2026-01-20',
          delay_days: 8, // Minor overdue -> severity info
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const run1 = await evaluateOperationalTriggers({
        caseItem: mockCase,
        stageInstances: stagesMinor,
      });
      expect(run1).toHaveLength(1);
      expect(run1[0].severity).toBe('info');

      // Condition worsens: Delay increases to 35 days (Critical)
      const stagesCritical: CaseStageInstance[] = [
        {
          ...stagesMinor[0],
          delay_days: 35,
        },
      ];

      const run2 = await evaluateOperationalTriggers({
        caseItem: mockCase,
        stageInstances: stagesCritical,
      });
      // Existing active notification upgraded in-place
      expect(run2).toHaveLength(1);
      expect(run2[0].id).toBe(run1[0].id);
      expect(run2[0].severity).toBe('critical');

      const allNotifs = await fetchNotifications({ case_id: mockCase.id });
      expect(allNotifs).toHaveLength(1); // Still exactly 1 record, upgraded
    });

    it('generates a fresh notification when a condition recurs AFTER previous was resolved', async () => {
      const mockCase = createMockCase();
      const stages: CaseStageInstance[] = [
        {
          id: 'stg-inst-recur',
          case_id: mockCase.id,
          stage_id: 'stg-11',
          stage_number: 1,
          status: 'in_progress',
          planned_start_date: '2026-01-01',
          planned_end_date: '2026-01-20',
          delay_days: 10,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      // 1. Initial occurrence: Alert generated
      const initialAlerts = await evaluateOperationalTriggers({
        caseItem: mockCase,
        stageInstances: stages,
      });
      expect(initialAlerts).toHaveLength(1);
      const alertId1 = initialAlerts[0].id;

      // 2. Officer acknowledges and resolves the issue
      await acknowledgeNotification(alertId1, 'Authorized Officer');
      await resolveNotification(alertId1, 'Authorized Officer', 'usr-1', 'Granted statutory time extension.');

      const resolvedAlert = (await fetchNotifications({ case_id: mockCase.id })).find((n) => n.id === alertId1);
      expect(resolvedAlert?.status).toBe('resolved');

      // 3. New occurrence arises later on another milestone
      const newStage: CaseStageInstance = {
        ...stages[0],
        id: 'stg-inst-recur-new',
        stage_id: 'stg-19',
        delay_days: 12,
      };

      const newAlerts = await evaluateOperationalTriggers({
        caseItem: mockCase,
        stageInstances: [newStage],
      });

      // Must generate a fresh, new notification! (Does NOT suppress legitimate recurring event)
      expect(newAlerts).toHaveLength(1);
      expect(newAlerts[0].id).not.toBe(alertId1);
      expect(newAlerts[0].status).toBe('unread');

      const totalAfter = await fetchNotifications({ case_id: mockCase.id });
      expect(totalAfter).toHaveLength(2); // 1 resolved historical, 1 active new
    });
  });

  // ==========================================================================
  // 4. EXPLICIT FINITE STATE MACHINE & LIFECYCLE ENFORCEMENT
  // ==========================================================================
  describe('4. Explicit State Machine & Lifecycle Transitions', () => {
    it('executes valid transitions: unread -> acknowledged -> resolved', async () => {
      const mockCase = createMockCase();
      const generated = await evaluateOperationalTriggers({
        caseItem: mockCase,
        riskAssessment: {
          case_id: mockCase.id,
          overall_risk_score: 90,
          risk_level: 'critical',
          confidence: 1.0,
          predicted_delay_days: 15,
          factor_breakdown: {
            schedule_delay_score: 90,
            dependency_blockage_score: 0,
            missing_documents_score: 0,
            cadastral_dispute_score: 0,
            details: [],
          },
          observed_facts: [],
          ai_inferences: [],
          generated_at: new Date().toISOString(),
        },
      });
      const alert = generated[0];
      expect(alert.status).toBe('unread');

      // 1. Acknowledge
      const ackResult = await acknowledgeNotification(alert.id, 'Dr. Anand Verma');
      expect(ackResult?.status).toBe('acknowledged');
      expect(ackResult?.acknowledged_by).toBe('Dr. Anand Verma');
      expect(ackResult?.acknowledged_at).toBeDefined();

      // 2. Resolve
      const resResult = await resolveNotification(alert.id, 'Dr. Anand Verma', 'usr-lao', 'Conducted revenue review.');
      expect(resResult?.status).toBe('resolved');
      expect(resResult?.resolved_by).toBe('Dr. Anand Verma');
      expect(resResult?.action_taken).toBe('Conducted revenue review.');
      expect(resResult?.resolved_at).toBeDefined();
    });

    it('executes valid dismissal with mandatory justification notes', async () => {
      const mockCase = createMockCase();
      const generated = await evaluateOperationalTriggers({
        caseItem: mockCase,
        stageInstances: [
          {
            id: 'stg-dismiss',
            case_id: mockCase.id,
            stage_id: 'stg-1',
            stage_number: 1,
            status: 'in_progress',
            delay_days: 10,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const alert = generated[0];

      const disResult = await dismissNotification(alert.id, 'Dr. Anand Verma', 'usr-lao', 'Variance verified as acceptable minor delay.');
      expect(disResult?.status).toBe('dismissed');
      expect(disResult?.dismissed_by).toBe('Dr. Anand Verma');
      expect(disResult?.dismissal_reason).toBe('Variance verified as acceptable minor delay.');
    });

    it('strictly forbids invalid state transitions (terminal state protection)', async () => {
      // 1. Resolved is terminal
      expect(() => assertValidTransition('resolved', 'acknowledge')).toThrow('Illegal transition');
      expect(() => assertValidTransition('resolved', 'dismiss')).toThrow('Illegal transition');
      expect(() => assertValidTransition('resolved', 'resolve')).toThrow('Illegal transition');

      // 2. Dismissed is terminal
      expect(() => assertValidTransition('dismissed', 'acknowledge')).toThrow('Illegal transition');
      expect(() => assertValidTransition('dismissed', 'resolve')).toThrow('Illegal transition');

      // 3. Cannot re-acknowledge an already acknowledged alert
      expect(() => assertValidTransition('acknowledged', 'acknowledge')).toThrow('already acknowledged');
    });
  });

  // ==========================================================================
  // 5. AUTOMATED ESCALATION GOVERNANCE & AUDIT TRAIL
  // ==========================================================================
  describe('5. Multi-Tier Escalation & Institutional Auditability', () => {
    it('escalates alert severity, reassigns to supervisory role, and records audit trail', async () => {
      const mockCase = createMockCase();
      const generated = await evaluateOperationalTriggers({
        caseItem: mockCase,
        stageInstances: [
          {
            id: 'stg-esc-test',
            case_id: mockCase.id,
            stage_id: 'stg-2',
            stage_number: 2,
            status: 'blocked', // blocked dependency -> recipient project_officer
            delay_days: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const alert = generated[0];
      const initialRole = alert.recipient_role;
      expect(initialRole).toBe('project_officer');
      const initialSeverity = alert.severity;

      // Escalate alert
      const escalated = await escalateNotification(
        alert.id,
        'Institutional Escalation Engine',
        'sys-cron',
        'Unacknowledged for > 48 hours exceeding SLA deadline.'
      );

      expect(escalated?.escalation_level).toBe(1);
      expect(escalated?.escalated_at).toBeDefined();
      expect(escalated?.escalated_to_role).toBe('lao'); // project_officer -> lao per escalation_policy
      expect(escalated?.recipient_role).toBe('lao');
      expect(escalated?.severity).toBe('critical'); // elevated from warning to critical

      // Verify comprehensive audit trail written to case_events
      const audits = getRecentAuditLogs(10);
      const escAudit = audits.find((a) => a.event_type === 'NOTIFICATION_ESCALATED');
      expect(escAudit).toBeDefined();
      expect(escAudit?.metadata?.previous_role).toBe(initialRole);
      expect(escAudit?.metadata?.new_role).toBe('lao');
      expect(escAudit?.metadata?.policy_id).toBe('escalation_policy');
    });
  });

  // ==========================================================================
  // 6. ROLE-BASED AUTHORIZATION & ADVERSARIAL SCOPE ATTACK TESTS
  // ==========================================================================
  describe('6. Role & Jurisdiction Authorization (Adversarial Security)', () => {
    const caseProjectA = createMockCase({ id: 'case-A', project_id: 'prj-alpha', state: 'Punjab', district: 'Amritsar' });
    const caseProjectB = createMockCase({ id: 'case-B', project_id: 'prj-beta', state: 'Haryana', district: 'Karnal' });

    beforeEach(async () => {
      // Seed alerts across two separate projects and jurisdictions
      await evaluateOperationalTriggers({
        caseItem: caseProjectA,
        riskAssessment: {
          case_id: caseProjectA.id,
          overall_risk_score: 85,
          risk_level: 'critical',
          confidence: 1.0,
          predicted_delay_days: 10,
          factor_breakdown: { schedule_delay_score: 85, dependency_blockage_score: 0, missing_documents_score: 0, cadastral_dispute_score: 0, details: [] },
          observed_facts: [],
          ai_inferences: [],
          generated_at: new Date().toISOString(),
        },
      });

      await evaluateOperationalTriggers({
        caseItem: caseProjectB,
        riskAssessment: {
          case_id: caseProjectB.id,
          overall_risk_score: 85,
          risk_level: 'critical',
          confidence: 1.0,
          predicted_delay_days: 10,
          factor_breakdown: { schedule_delay_score: 85, dependency_blockage_score: 0, missing_documents_score: 0, cadastral_dispute_score: 0, details: [] },
          observed_facts: [],
          ai_inferences: [],
          generated_at: new Date().toISOString(),
        },
      });
    });

    it('authorizes admin and LAO with full unrestricted national portfolio scope', async () => {
      const adminUser: AuthenticatedUser = { id: 'usr-admin', role: 'admin', full_name: 'Administrator' };
      const laoUser: AuthenticatedUser = { id: 'usr-lao', role: 'lao', full_name: 'LAO Officer' };

      const adminNotifs = await fetchNotifications({ user: adminUser });
      expect(adminNotifs).toHaveLength(2);

      const laoNotifs = await fetchNotifications({ user: laoUser });
      expect(laoNotifs).toHaveLength(2);
    });

    it('strictly confines Project Officer to their assigned project boundary', async () => {
      const poUserAlpha: AuthenticatedUser = {
        id: 'usr-po-alpha',
        role: 'project_officer',
        full_name: 'Project Officer Alpha',
        department: 'project:prj-alpha',
      };

      const poNotifs = await fetchNotifications({ user: poUserAlpha });
      expect(poNotifs).toHaveLength(1);
      expect(poNotifs[0].project_id).toBe('prj-alpha');
      expect(poNotifs[0].case_id).toBe('case-A');
    });

    it('strictly confines Revenue Inspector to their assigned jurisdiction boundary', async () => {
      const riUserPunjab: AuthenticatedUser = {
        id: 'usr-ri-punjab',
        role: 'revenue_inspector',
        full_name: 'Revenue Inspector Punjab',
        department: 'state:Punjab',
      };

      const riNotifs = await fetchNotifications({ user: riUserPunjab });
      expect(riNotifs).toHaveLength(1);
      expect(riNotifs[0].state).toBe('Punjab');
    });

    it('confines Viewer role to empty/public records and blocks internal alerts', async () => {
      const viewerUser: AuthenticatedUser = {
        id: 'usr-viewer',
        role: 'viewer',
        full_name: 'Public Citizen',
        department: 'restricted',
      };

      const viewerNotifs = await fetchNotifications({ user: viewerUser });
      expect(viewerNotifs).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 7. LIVE HTTP API & INTEGRATION VERIFICATION
  // ==========================================================================
  describe('7. Live HTTP API Endpoints & Scope Enforcement', () => {
    it('rejects unauthenticated request to /api/notifications with HTTP 401', async () => {
      const res = await fetch(`${SERVER_URL}/api/notifications`);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe('AUTH_REQUIRED');
    });

    it('rejects unauthenticated request to /api/notifications/count with HTTP 401', async () => {
      const res = await fetch(`${SERVER_URL}/api/notifications/count`);
      expect(res.status).toBe(401);
    });

    it('authorizes authenticated request with evaluation headers', async () => {
      const res = await fetch(`${SERVER_URL}/api/notifications`, {
        headers: {
          'x-eval-role': 'admin',
          'x-eval-user-id': 'usr-admin-test',
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.notifications).toBeDefined();
      expect(Array.isArray(json.notifications)).toBe(true);
      expect(typeof json.total_count).toBe('number');
    });

    it('blocks scope bypass via malicious query parameter tampering on live server', async () => {
      // Project Officer assigned to prj-alpha attempts to tamper query params with ?project_id=prj-beta
      const res = await fetch(`${SERVER_URL}/api/notifications?project_id=prj-beta`, {
        headers: {
          'x-eval-role': 'project_officer',
          'x-eval-user-id': 'usr-po-restricted',
          'x-eval-user-name': 'PO Restricted',
          'x-eval-department': 'project:prj-alpha',
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      // Server must NOT return prj-beta records to a prj-alpha officer
      const leakedForeign = (json.notifications || []).filter((n: any) => n.project_id === 'prj-beta');
      expect(leakedForeign).toHaveLength(0);
    });
  });
});
