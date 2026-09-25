-- ============================================================================
-- BHOOMISETU MIGRATION: 20260922000008_day5_operational_governance.sql
-- Day 5: Operational Governance, Notification Lifecycle & Automated Escalation
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND CASE NOTIFICATIONS FOR FULL OPERATIONAL LIFECYCLE
-- ----------------------------------------------------------------------------

-- Add lifecycle tracking columns for resolution and dismissal
ALTER TABLE case_notifications ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE case_notifications ADD COLUMN IF NOT EXISTS resolved_by TEXT;
ALTER TABLE case_notifications ADD COLUMN IF NOT EXISTS action_taken TEXT;
ALTER TABLE case_notifications ADD COLUMN IF NOT EXISTS action_taken_at TIMESTAMPTZ;
ALTER TABLE case_notifications ADD COLUMN IF NOT EXISTS action_taken_by TEXT;

ALTER TABLE case_notifications ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
ALTER TABLE case_notifications ADD COLUMN IF NOT EXISTS dismissed_by TEXT;
ALTER TABLE case_notifications ADD COLUMN IF NOT EXISTS dismissal_reason TEXT;

-- Add escalation tracking columns
ALTER TABLE case_notifications ADD COLUMN IF NOT EXISTS escalation_level INT NOT NULL DEFAULT 0;
ALTER TABLE case_notifications ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
ALTER TABLE case_notifications ADD COLUMN IF NOT EXISTS escalated_to_role TEXT;
ALTER TABLE case_notifications ADD COLUMN IF NOT EXISTS escalated_by TEXT;

-- Add deduplication key for preventing alert storms on active conditions
ALTER TABLE case_notifications ADD COLUMN IF NOT EXISTS dedup_key TEXT;

-- Drop and recreate event_type constraint to support comprehensive operational intelligence categories
DO $$
BEGIN
    ALTER TABLE case_notifications DROP CONSTRAINT IF EXISTS case_notifications_event_type_check;
    ALTER TABLE case_notifications ADD CONSTRAINT case_notifications_event_type_check
        CHECK (event_type IN (
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
            'unresolved_recommendation'
        ));
EXCEPTION
    WHEN OTHERS THEN
        -- If constraint recreation encounters lock or permission differences, continue gracefully
        NULL;
END $$;

-- Operational performance indexes
CREATE INDEX IF NOT EXISTS idx_notifications_dedup ON case_notifications(dedup_key, status);
CREATE INDEX IF NOT EXISTS idx_notifications_escalation ON case_notifications(escalation_level) WHERE escalation_level > 0;
CREATE INDEX IF NOT EXISTS idx_notifications_resolved ON case_notifications(resolved_at DESC) WHERE resolved_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. SEED DEFAULT INSTITUTIONAL POLICIES FOR DAY 5
-- ----------------------------------------------------------------------------

INSERT INTO system_policies (id, category, title, description, config_value, updated_by)
VALUES
(
    'notification_policy',
    'attention',
    'Operational Notification & Deduplication Policy',
    'Configurable thresholds governing notification eligibility, deduplication time windows, and active case alert quotas.',
    '{
        "eligibility_min_severity": "info",
        "deduplication_window_hours": 24,
        "max_active_notifications_per_case": 10,
        "stale_data_notification_behavior": "warn",
        "acknowledgement_deadline_hours": {
            "urgent": 12,
            "critical": 24,
            "warning": 48,
            "info": 72
        }
    }'::jsonb,
    'System Seed Day 5'
),
(
    'escalation_policy',
    'escalation',
    'Statutory Multi-Tier Operational Escalation Policy',
    'Rules governing deadline-based automated escalation, supervisory role progression, and statutory alert elevation.',
    '{
        "sla_breach_escalation_days": 15,
        "critical_risk_auto_escalate": true,
        "unacknowledged_escalation_hours": {
            "urgent": 12,
            "critical": 24,
            "warning": 48
        },
        "escalation_target_role_map": {
            "project_officer": "lao",
            "revenue_inspector": "lao",
            "legal_officer": "lao",
            "viewer": "project_officer",
            "lao": "admin",
            "approver": "admin"
        },
        "repeated_trigger_escalate_count": 3,
        "dispute_count_escalation_threshold": 2
    }'::jsonb,
    'System Seed Day 5'
),
(
    'operational_attention_policy',
    'attention',
    'National Executive Attention Qualification Policy',
    'Unified statutory criteria governing case qualification for priority attention queues and proactive alerts.',
    '{
        "delay_days_threshold": 10,
        "downstream_impact_threshold_days": 7,
        "flag_unverified_docs": true,
        "flag_disputed_parcels": true,
        "flag_blocked_stages": true,
        "flag_critical_risk": true,
        "flag_high_risk": true,
        "flag_stale_external_data": true,
        "flag_cross_source_discrepancies": true
    }'::jsonb,
    'System Seed Day 5'
)
ON CONFLICT (id) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    updated_at = NOW(),
    updated_by = 'System Seed Day 5';
