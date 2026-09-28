-- ============================================================================
-- BHOOMIDARPAN MIGRATION: 20260920000005_day5_policy_notifications.sql
-- Day 5: Configurable System Policies, Notifications/Escalations & Audit Expansion
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SYSTEM POLICIES (Decoupled Configurable Business Rules & Thresholds)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_policies (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('risk', 'bottleneck', 'attention', 'escalation', 'sla')),
    title TEXT NOT NULL,
    description TEXT,
    config_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT DEFAULT 'System'
);

-- Seed default institutional policies into the database
INSERT INTO system_policies (id, category, title, description, config_value, updated_by)
VALUES
(
    'risk_scoring_weights',
    'risk',
    'Explainable Multi-Factor Risk Weights',
    'Relative mathematical weights assigned to each operational dimension for composite risk scoring.',
    '{
        "schedule_delay_weight": 0.40,
        "dependency_blockage_weight": 0.25,
        "document_friction_weight": 0.20,
        "cadastral_dispute_weight": 0.15
    }'::jsonb,
    'System Seed'
),
(
    'risk_bands',
    'risk',
    'Institutional Risk Score Classification Bands',
    'Composite score boundaries (0-100) separating risk levels.',
    '{
        "critical_threshold": 75,
        "high_threshold": 50,
        "medium_threshold": 25
    }'::jsonb,
    'System Seed'
),
(
    'bottleneck_thresholds',
    'bottleneck',
    'Active Bottleneck & SLA Delay Detection Thresholds',
    'Statutory delay thresholds (in days) that flag active bottlenecks and determine severity.',
    '{
        "active_overdue_threshold_days": 5,
        "medium_overdue_days": 5,
        "high_overdue_days": 15,
        "critical_overdue_days": 30,
        "historical_delay_impact_days": 14,
        "disputed_parcels_threshold": 3
    }'::jsonb,
    'System Seed'
),
(
    'attention_queue_criteria',
    'attention',
    'National Attention Queue Qualification Rules',
    'Operational criteria and delay thresholds determining which cases require immediate officer intervention.',
    '{
        "delay_days_threshold": 10,
        "flag_unverified_docs": true,
        "flag_disputed_parcels": true,
        "flag_blocked_stages": true,
        "flag_critical_risk": true,
        "flag_high_risk": true
    }'::jsonb,
    'System Seed'
),
(
    'escalation_rules',
    'escalation',
    'Automated Escalation & Alert Trigger Rules',
    'Criteria governing automatic generation of persistent notifications and high-priority escalation flags.',
    '{
        "sla_breach_escalation_days": 15,
        "critical_risk_auto_escalate": true,
        "unverified_doc_escalation_days": 7,
        "dispute_count_escalation_threshold": 2
    }'::jsonb,
    'System Seed'
)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. CASE NOTIFICATIONS & ESCALATIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES acquisition_cases(id) ON DELETE CASCADE,
    stage_instance_id UUID REFERENCES case_stage_instances(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical', 'urgent')),
    event_type TEXT NOT NULL CHECK (event_type IN ('stage_overdue', 'critical_risk', 'blocked_dependency', 'document_awaiting_verification', 'cadastral_dispute', 'workflow_escalation')),
    recipient_role TEXT NOT NULL DEFAULT 'all',
    recipient_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'acknowledged', 'resolved', 'dismissed')),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for rapid notification retrieval and filtering
CREATE INDEX IF NOT EXISTS idx_notifications_case ON case_notifications(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_status_role ON case_notifications(status, recipient_role);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON case_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_severity ON case_notifications(severity);

-- ----------------------------------------------------------------------------
-- 3. EXPAND AUDIT LOG TABLE (case_events) FOR PROJECT & SYSTEM EVENTS
-- ----------------------------------------------------------------------------
-- Allow case_events to record project-level and system-level actions (WHO, WHAT, WHEN, RECORD, WHAT CHANGED)
ALTER TABLE case_events ALTER COLUMN case_id DROP NOT NULL;
ALTER TABLE case_events ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_events_project ON case_events(project_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. PERFORMANCE INDEXES ON RISK ASSESSMENTS
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_risk_assessments_score ON risk_assessments(overall_risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_level ON risk_assessments(risk_level);

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) FOR NEW TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE system_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_notifications ENABLE ROW LEVEL SECURITY;

-- Read policies for system_policies and case_notifications
CREATE POLICY "Allow read system_policies for all authenticated"
    ON system_policies FOR SELECT
    USING (true);

CREATE POLICY "Allow update system_policies for all authenticated"
    ON system_policies FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow insert system_policies for all authenticated"
    ON system_policies FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow read notifications for all authenticated"
    ON case_notifications FOR SELECT
    USING (true);

CREATE POLICY "Allow insert notifications for all authenticated"
    ON case_notifications FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow update notifications for all authenticated"
    ON case_notifications FOR UPDATE
    USING (true)
    WITH CHECK (true);
