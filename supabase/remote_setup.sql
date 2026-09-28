-- ============================================================================
-- CANONICAL MIGRATION: 20260920000001_initial_schema.sql
-- ============================================================================

-- ============================================================================
-- BhoomiDarpan - Initial Database Schema Migration
-- Designed for PostgreSQL / Supabase
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'admin',
        'project_officer',
        'lao',
        'revenue_inspector',
        'legal_officer',
        'approver',
        'viewer'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE project_type AS ENUM (
        'highway',
        'railway',
        'irrigation',
        'metro',
        'industrial',
        'urban',
        'energy',
        'airport'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE project_status AS ENUM (
        'planning',
        'in_progress',
        'delayed',
        'completed',
        'halted'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE case_status AS ENUM (
        'draft',
        'active',
        'under_review',
        'delayed',
        'litigation',
        'completed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE case_priority AS ENUM (
        'low',
        'medium',
        'high',
        'critical'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE stage_status AS ENUM (
        'not_started',
        'in_progress',
        'pending_approval',
        'completed',
        'blocked',
        'skipped'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE dependency_type AS ENUM (
        'finish_to_start',
        'start_to_start',
        'finish_to_finish'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE document_type AS ENUM (
        'preliminary_notice',
        'sec_11_notification',
        'hearing_minutes',
        'survey_report',
        'valuation_record',
        'sec_19_declaration',
        'award_order',
        'possession_memo',
        'litigation_filing',
        'miscellaneous'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE document_status AS ENUM (
        'uploaded',
        'extracted',
        'verified',
        'rejected'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE risk_level AS ENUM (
        'low',
        'medium',
        'high',
        'critical'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 2. USER PROFILES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'project_officer',
    department TEXT NOT NULL,
    jurisdiction_state TEXT,
    jurisdiction_district TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. PROJECTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    project_type project_type NOT NULL,
    sponsoring_agency TEXT NOT NULL,
    estimated_budget NUMERIC(15, 2),
    target_completion_date DATE,
    status project_status NOT NULL DEFAULT 'in_progress',
    state TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. WORKFLOWS & STAGES (Configurable Workflow Engine)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version TEXT NOT NULL DEFAULT '1.0',
    legal_framework TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    stage_number INTEGER NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    default_duration_days INTEGER NOT NULL CHECK (default_duration_days > 0),
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    required_role user_role,
    required_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
    completion_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
    escalation_threshold_days INTEGER NOT NULL DEFAULT 7,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workflow_stage_code UNIQUE (workflow_id, code),
    CONSTRAINT uq_workflow_stage_number UNIQUE (workflow_id, stage_number)
);

CREATE TABLE IF NOT EXISTS stage_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id UUID NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
    depends_on_stage_id UUID NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
    dependency_type dependency_type NOT NULL DEFAULT 'finish_to_start',
    lag_days INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_stage_dependency UNIQUE (stage_id, depends_on_stage_id),
    CONSTRAINT chk_no_self_dependency CHECK (stage_id <> depends_on_stage_id)
);

-- ----------------------------------------------------------------------------
-- 5. ACQUISITION CASES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acquisition_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number TEXT NOT NULL UNIQUE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workflow_id UUID NOT NULL REFERENCES workflows(id),
    title TEXT NOT NULL,
    description TEXT,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    tehsil TEXT,
    village TEXT NOT NULL,
    total_area_hectares NUMERIC(10, 4) NOT NULL CHECK (total_area_hectares > 0),
    estimated_compensation NUMERIC(15, 2) NOT NULL DEFAULT 0,
    status case_status NOT NULL DEFAULT 'active',
    priority case_priority NOT NULL DEFAULT 'medium',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_completion_date DATE NOT NULL,
    actual_completion_date DATE,
    assigned_officer_id UUID REFERENCES user_profiles(id),
    geojson_boundary JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. CASE STAGE INSTANCES (Dynamic progress & deviations)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_stage_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES acquisition_cases(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES workflow_stages(id),
    status stage_status NOT NULL DEFAULT 'not_started',
    expected_start_date DATE NOT NULL,
    expected_end_date DATE NOT NULL,
    actual_start_date DATE,
    actual_end_date DATE,
    delay_days INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    completed_by UUID REFERENCES user_profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_case_stage UNIQUE (case_id, stage_id)
);

-- ----------------------------------------------------------------------------
-- 7. PARCELS / LANDOWNERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parcels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES acquisition_cases(id) ON DELETE CASCADE,
    survey_number TEXT NOT NULL,
    khata_number TEXT,
    landowner_names TEXT[] NOT NULL DEFAULT '{}',
    land_type TEXT NOT NULL,
    area_acres NUMERIC(10, 4) NOT NULL CHECK (area_acres > 0),
    compensation_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    acquisition_status TEXT NOT NULL DEFAULT 'identified',
    geojson_geometry JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 8. DOCUMENTS & OCR / AI EXTRACTIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES acquisition_cases(id) ON DELETE CASCADE,
    stage_instance_id UUID REFERENCES case_stage_instances(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    document_type document_type NOT NULL,
    file_url TEXT NOT NULL,
    file_size_bytes BIGINT,
    mime_type TEXT,
    status document_status NOT NULL DEFAULT 'uploaded',
    uploaded_by UUID REFERENCES user_profiles(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    raw_text TEXT,
    structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    confidence_score NUMERIC(4, 3),
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by UUID REFERENCES user_profiles(id),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 9. AUDIT LOG & EVENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES acquisition_cases(id) ON DELETE CASCADE,
    stage_instance_id UUID REFERENCES case_stage_instances(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor_id UUID REFERENCES user_profiles(id),
    actor_name TEXT NOT NULL DEFAULT 'System',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 10. RISK ASSESSMENTS & RECOMMENDATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES acquisition_cases(id) ON DELETE CASCADE,
    overall_risk_score INTEGER NOT NULL CHECK (overall_risk_score BETWEEN 0 AND 100),
    risk_level risk_level NOT NULL,
    factor_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    observed_facts TEXT[] NOT NULL DEFAULT '{}',
    ai_inferences TEXT[] NOT NULL DEFAULT '{}',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES acquisition_cases(id) ON DELETE CASCADE,
    stage_instance_id UUID REFERENCES case_stage_instances(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    action_type TEXT NOT NULL,
    urgency TEXT NOT NULL DEFAULT 'routine',
    expected_impact TEXT NOT NULL,
    confidence NUMERIC(4, 3),
    responsible_stakeholder TEXT,
    is_implemented BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 11. SCENARIO SIMULATION
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES acquisition_cases(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    proposed_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    original_projected_date DATE NOT NULL,
    simulated_projected_date DATE NOT NULL,
    delay_recovered_days INTEGER NOT NULL DEFAULT 0,
    simulation_result JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 12. PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cases_project ON acquisition_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_cases_workflow ON acquisition_cases(workflow_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON acquisition_cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_location ON acquisition_cases(state, district);
CREATE INDEX IF NOT EXISTS idx_case_stages_case ON case_stage_instances(case_id);
CREATE INDEX IF NOT EXISTS idx_case_stages_status ON case_stage_instances(status);
CREATE INDEX IF NOT EXISTS idx_parcels_case ON parcels(case_id);
CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_events_case ON case_events(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_stages_wf ON workflow_stages(workflow_id, stage_number);

-- ----------------------------------------------------------------------------
-- 13. AUTOMATIC UPDATED_AT TRIGGER
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER set_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_projects_updated_at ON projects;
CREATE TRIGGER set_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_workflows_updated_at ON workflows;
CREATE TRIGGER set_workflows_updated_at
BEFORE UPDATE ON workflows
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_acquisition_cases_updated_at ON acquisition_cases;
CREATE TRIGGER set_acquisition_cases_updated_at
BEFORE UPDATE ON acquisition_cases
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_case_stage_instances_updated_at ON case_stage_instances;
CREATE TRIGGER set_case_stage_instances_updated_at
BEFORE UPDATE ON case_stage_instances
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ----------------------------------------------------------------------------
-- 14. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE acquisition_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_stage_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated and anon users (for public demo / authorized viewing)
DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'user_profiles', 'projects', 'workflows', 'workflow_stages',
        'stage_dependencies', 'acquisition_cases', 'case_stage_instances',
        'parcels', 'documents', 'document_extractions', 'case_events',
        'risk_assessments', 'recommendations', 'scenarios'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow select for all" ON %I;', tbl);
        EXECUTE format('CREATE POLICY "Allow select for all" ON %I FOR SELECT USING (true);', tbl);
        
        EXECUTE format('DROP POLICY IF EXISTS "Allow insert for all" ON %I;', tbl);
        EXECUTE format('CREATE POLICY "Allow insert for all" ON %I FOR INSERT WITH CHECK (true);', tbl);

        EXECUTE format('DROP POLICY IF EXISTS "Allow update for all" ON %I;', tbl);
        EXECUTE format('CREATE POLICY "Allow update for all" ON %I FOR UPDATE USING (true) WITH CHECK (true);', tbl);

        EXECUTE format('DROP POLICY IF EXISTS "Allow delete for all" ON %I;', tbl);
        EXECUTE format('CREATE POLICY "Allow delete for all" ON %I FOR DELETE USING (true);', tbl);
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 15. STORAGE BUCKET FOR DOCUMENTS (Idempotent Supabase Storage)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('documents', 'documents', true)
    ON CONFLICT (id) DO NOTHING;

    DROP POLICY IF EXISTS "Public Document Access" ON storage.objects;
    CREATE POLICY "Public Document Access" ON storage.objects FOR SELECT USING (bucket_id = 'documents');
    
    DROP POLICY IF EXISTS "Allow Document Upload" ON storage.objects;
    CREATE POLICY "Allow Document Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documents');
EXCEPTION
    WHEN undefined_table THEN null;
    WHEN others THEN null;
END $$;

-- ============================================================================
-- CANONICAL MIGRATION: 20260920000002_day2_gis_documents.sql
-- ============================================================================

-- ============================================================================
-- BhoomiDarpan - Migration 000002: Day 2 GIS & Document Intelligence Extensions
-- ============================================================================

-- 1. Expand document_status enum values safely
DO $$ BEGIN
    ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'processing';
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'processed';
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'validation_required';
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'failed';
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null;
END $$;

-- 2. Add storage_path and error_details to documents table
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS storage_path TEXT,
ADD COLUMN IF NOT EXISTS error_details TEXT;

-- 3. Add human validation tracking fields to document_extractions table
ALTER TABLE document_extractions
ADD COLUMN IF NOT EXISTS human_edited_data JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS validation_notes TEXT,
ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'pending';

-- 4. Additional indexes for spatial parcel queries and document lookups
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_stage ON documents(stage_instance_id);
CREATE INDEX IF NOT EXISTS idx_extractions_document ON document_extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_parcels_status ON parcels(acquisition_status);

-- ============================================================================
-- CANONICAL MIGRATION: 20260920000003_day3_intelligence.sql
-- ============================================================================

-- ============================================================================
-- BHOOMIDARPAN MIGRATION: 20260920000003_day3_intelligence.sql
-- Day 3: Core Intelligence, Bottlenecks, and Action Recommendations
-- ============================================================================

-- 1. Extend recommendations table with detailed audit & decision fields
ALTER TABLE recommendations 
    ADD COLUMN IF NOT EXISTS reason TEXT,
    ADD COLUMN IF NOT EXISTS supporting_evidence TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'deterministic',
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'proposed';

-- 2. Create case_bottlenecks table for recording historical & active bottlenecks
CREATE TABLE IF NOT EXISTS case_bottlenecks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES acquisition_cases(id) ON DELETE CASCADE,
    stage_instance_id UUID REFERENCES case_stage_instances(id) ON DELETE CASCADE,
    stage_title TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    evidence TEXT NOT NULL,
    deviation_days INTEGER NOT NULL DEFAULT 0,
    downstream_stages_count INTEGER NOT NULL DEFAULT 0,
    downstream_stage_titles TEXT[] NOT NULL DEFAULT '{}',
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for bottleneck performance
CREATE INDEX IF NOT EXISTS idx_bottlenecks_case ON case_bottlenecks(case_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_bottlenecks_severity ON case_bottlenecks(severity);
CREATE INDEX IF NOT EXISTS idx_recommendations_case_status ON recommendations(case_id, status);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE case_bottlenecks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read bottlenecks"
    ON case_bottlenecks FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated insert bottlenecks"
    ON case_bottlenecks FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated update recommendations"
    ON recommendations FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- CANONICAL MIGRATION: 20260920000004_day4_portfolio_operations.sql
-- ============================================================================

-- ============================================================================
-- BHOOMIDARPAN MIGRATION: 20260920000004_day4_portfolio_operations.sql
-- Day 4: Portfolio Operations, Attention Queue, and Bottleneck Aggregations
-- ============================================================================

-- 1. Composite & Filtered Indexes on acquisition_cases for multi-dimensional filtering
CREATE INDEX IF NOT EXISTS idx_cases_project_status ON acquisition_cases(project_id, status);
CREATE INDEX IF NOT EXISTS idx_cases_workflow_status ON acquisition_cases(workflow_id, status);
CREATE INDEX IF NOT EXISTS idx_cases_priority ON acquisition_cases(priority);
CREATE INDEX IF NOT EXISTS idx_cases_state_district ON acquisition_cases(state, district);

-- 2. Performance indexes on case_stage_instances for SLA delays & bottleneck scanning
CREATE INDEX IF NOT EXISTS idx_case_stages_delay_active ON case_stage_instances(delay_days) WHERE delay_days > 0;
CREATE INDEX IF NOT EXISTS idx_case_stages_stage_status ON case_stage_instances(stage_id, status);

-- 3. Performance indexes on risk assessments & bottlenecks
DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS idx_risk_assessments_score ON risk_assessments(overall_risk_score DESC);
    CREATE INDEX IF NOT EXISTS idx_risk_assessments_level ON risk_assessments(risk_level);
EXCEPTION WHEN undefined_table THEN null;
END $$;
CREATE INDEX IF NOT EXISTS idx_bottlenecks_stage_title ON case_bottlenecks(stage_title);

-- 4. Enable RLS read access for authenticated personnel on views/aggregations
-- (acquisition_cases, case_stage_instances, and case_bottlenecks already have RLS enabled)

-- ============================================================================
-- CANONICAL MIGRATION: 20260920000005_day5_policy_notifications.sql
-- ============================================================================

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

-- ============================================================================
-- CANONICAL MIGRATION: 20260920000006_day1_data_foundation.sql
-- ============================================================================

-- ============================================================================
-- BHOOMIDARPAN MIGRATION: 20260920000006_day1_data_foundation.sql
-- Day 1: Real Data Integration Foundation, Data Source Registry,
-- Provenance Ledger, Administrative Geography & Import Pipeline
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DATA SOURCES REGISTRY
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('database', 'ai', 'geocoding', 'administrative_data', 'gis', 'weather', 'document_source', 'government_open_data')),
    provider TEXT NOT NULL,
    endpoint_ref TEXT,
    env_secret_keys TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured', 'configured', 'operational', 'degraded', 'failed', 'disabled')),
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sync_mode TEXT NOT NULL DEFAULT 'on_demand' CHECK (sync_mode IN ('realtime', 'scheduled', 'manual_import', 'on_demand')),
    last_attempted_sync TIMESTAMPTZ,
    last_successful_sync TIMESTAMPTZ,
    error_details TEXT,
    data_scope TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed institutional foundational data sources (Zero secrets stored in DB)
INSERT INTO data_sources (id, name, type, provider, endpoint_ref, env_secret_keys, status, is_enabled, sync_mode, data_scope, metadata)
VALUES
(
    'supabase_postgres',
    'Primary Statutory Database & Storage Engine',
    'database',
    'Supabase PostgreSQL & Storage',
    'SUPABASE_URL',
    ARRAY['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
    'not_configured',
    TRUE,
    'realtime',
    'Institutional Land Acquisition Records, Audits, Policies & Spatial Data',
    '{"relational": true, "spatial_support": true, "rls_enabled": true}'::jsonb
),
(
    'gemini_flash',
    'Document Intelligence & Statutory Extraction Engine',
    'ai',
    'Google Gemini 1.5 Flash',
    'https://generativelanguage.googleapis.com',
    ARRAY['GEMINI_API_KEY'],
    'not_configured',
    TRUE,
    'on_demand',
    'Gazettes, Notices, Section 11/19 declarations, Valuation records',
    '{"model": "gemini-1.5-flash", "structured_json": true, "server_side_only": true}'::jsonb
),
(
    'nominatim_osm',
    'OpenStreetMap Nominatim Geocoding Adapter',
    'geocoding',
    'OpenStreetMap / Nominatim',
    'https://nominatim.openstreetmap.org',
    '{}',
    'configured',
    TRUE,
    'on_demand',
    'Forward & Reverse Indian Spatial Coordinates & Centroids',
    '{"rate_limit_rps": 1, "attribution": "OpenStreetMap contributors", "cache_hours": 24}'::jsonb
),
(
    'lgd_india',
    'Local Government Directory (LGD) Administrative Hierarchy',
    'administrative_data',
    'Ministry of Panchayati Raj, Govt of India (GODL)',
    'https://lgd.gov.in',
    '{}',
    'not_configured',
    TRUE,
    'manual_import',
    'National Master: States, Districts, Sub-Districts/Tehsils, Villages',
    '{"license": "Government Open Data License - India (GODL)", "hierarchical": true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    provider = EXCLUDED.provider,
    data_scope = EXCLUDED.data_scope,
    updated_at = NOW();

-- ----------------------------------------------------------------------------
-- 2. UNIVERSAL DATA PROVENANCE LEDGER
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_provenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field_name TEXT NOT NULL DEFAULT '*',
    provenance_type TEXT NOT NULL CHECK (provenance_type IN ('USER_ENTERED', 'DATABASE_DERIVED', 'EXTERNALLY_SOURCED', 'AI_EXTRACTED', 'AI_GENERATED_ASSISTED', 'SYSTEM_CALCULATED')),
    source_id TEXT REFERENCES data_sources(id) ON DELETE SET NULL,
    source_record_ref TEXT,
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    observed_at TIMESTAMPTZ,
    verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'human_verified', 'rejected', 'system_verified')),
    verified_by TEXT,
    verified_at TIMESTAMPTZ,
    freshness_state TEXT NOT NULL DEFAULT 'fresh' CHECK (freshness_state IN ('fresh', 'stale', 'expired')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for rapid provenance resolution
CREATE INDEX IF NOT EXISTS idx_provenance_entity ON data_provenance(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_provenance_source ON data_provenance(source_id);
CREATE INDEX IF NOT EXISTS idx_provenance_verification ON data_provenance(verification_status);

-- ----------------------------------------------------------------------------
-- 3. ADMINISTRATIVE GEOGRAPHY HIERARCHY
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS administrative_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES administrative_units(id) ON DELETE CASCADE,
    unit_type TEXT NOT NULL CHECK (unit_type IN ('state', 'district', 'sub_district', 'locality')),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    local_name TEXT,
    state_code TEXT,
    district_code TEXT,
    sub_district_code TEXT,
    centroid JSONB,
    boundary_geojson JSONB,
    source_id TEXT REFERENCES data_sources(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_admin_unit_type_code UNIQUE (unit_type, code)
);

CREATE INDEX IF NOT EXISTS idx_admin_parent ON administrative_units(parent_id);
CREATE INDEX IF NOT EXISTS idx_admin_unit_type ON administrative_units(unit_type);
CREATE INDEX IF NOT EXISTS idx_admin_state_district ON administrative_units(state_code, district_code);

-- ----------------------------------------------------------------------------
-- 4. STRUCTURED DATA IMPORT PIPELINE TRACKING
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT REFERENCES data_sources(id) ON DELETE SET NULL,
    batch_type TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('json', 'csv', 'geojson')),
    total_records INTEGER NOT NULL DEFAULT 0,
    accepted_records INTEGER NOT NULL DEFAULT 0,
    rejected_records INTEGER NOT NULL DEFAULT 0,
    duplicate_records INTEGER NOT NULL DEFAULT 0,
    validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'partially_completed', 'failed')),
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_source ON data_import_batches(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON data_import_batches(status);

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE administrative_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_import_batches ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users for institutional registry
CREATE POLICY "Allow read data_sources for all authenticated"
    ON data_sources FOR SELECT
    USING (true);

CREATE POLICY "Allow update data_sources for authenticated officers"
    ON data_sources FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow read data_provenance for all authenticated"
    ON data_provenance FOR SELECT
    USING (true);

CREATE POLICY "Allow insert data_provenance for all authenticated"
    ON data_provenance FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow update data_provenance for all authenticated"
    ON data_provenance FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow read administrative_units for all authenticated"
    ON administrative_units FOR SELECT
    USING (true);

CREATE POLICY "Allow insert administrative_units for authenticated officers"
    ON administrative_units FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow update administrative_units for authenticated officers"
    ON administrative_units FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow read data_import_batches for all authenticated"
    ON data_import_batches FOR SELECT
    USING (true);

CREATE POLICY "Allow insert data_import_batches for all authenticated"
    ON data_import_batches FOR INSERT
    WITH CHECK (true);

-- ============================================================================
-- CANONICAL MIGRATION: 20260921000007_day2_live_data_observations.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS external_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT REFERENCES data_sources(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    observation_type TEXT NOT NULL CHECK (observation_type IN ('weather', 'geocoding', 'environmental', 'administrative', 'satellite_index')),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    coordinates JSONB,
    observed_at TIMESTAMPTZ NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    raw_payload_ref TEXT,
    normalized_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    units JSONB NOT NULL DEFAULT '{}'::jsonb,
    confidence_score NUMERIC(4, 2) DEFAULT 1.00,
    quality_score NUMERIC(4, 2) DEFAULT 1.00,
    quality_breakdown JSONB DEFAULT '{}'::jsonb,
    freshness_state TEXT NOT NULL DEFAULT 'fresh' CHECK (freshness_state IN ('fresh', 'aging', 'stale', 'expired', 'unknown')),
    provenance_id UUID REFERENCES data_provenance(id) ON DELETE SET NULL,
    request_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_observations_entity ON external_observations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_observations_source ON external_observations(source_id);
CREATE INDEX IF NOT EXISTS idx_observations_type ON external_observations(observation_type);
CREATE INDEX IF NOT EXISTS idx_observations_observed_at ON external_observations(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_retrieved_at ON external_observations(retrieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_freshness ON external_observations(freshness_state);

CREATE TABLE IF NOT EXISTS data_discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    source_a TEXT NOT NULL,
    source_b TEXT NOT NULL,
    compared_field TEXT NOT NULL,
    value_a JSONB NOT NULL,
    value_b JSONB NOT NULL,
    timestamp_a TIMESTAMPTZ,
    timestamp_b TIMESTAMPTZ,
    discrepancy_type TEXT NOT NULL CHECK (discrepancy_type IN ('coordinates_mismatch', 'administrative_boundary_mismatch', 'measurement_variance', 'status_conflict', 'freshness_divergence')),
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolution_state TEXT NOT NULL DEFAULT 'unresolved' CHECK (resolution_state IN ('unresolved', 'acknowledged', 'resolved', 'dismissed')),
    resolution_notes TEXT,
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discrepancies_entity ON data_discrepancies(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_discrepancies_severity ON data_discrepancies(severity);
CREATE INDEX IF NOT EXISTS idx_discrepancies_resolution ON data_discrepancies(resolution_state);
CREATE INDEX IF NOT EXISTS idx_discrepancies_detected_at ON data_discrepancies(detected_at DESC);

INSERT INTO data_sources (id, name, type, provider, endpoint_ref, env_secret_keys, status, is_enabled, sync_mode, data_scope, metadata)
VALUES (
    'open_meteo',
    'Open-Meteo Global Meteorological & Environmental Adapter',
    'weather',
    'Open-Meteo API / WMO National Weather Services',
    'https://api.open-meteo.com/v1/forecast',
    ARRAY[]::text[],
    'operational',
    TRUE,
    'on_demand',
    'High-resolution temperature, precipitation, humidity, wind and atmospheric observations by GIS coordinates',
    '{"attribution": "Open-Meteo.com (CC BY 4.0) & National Weather Services", "rate_limit_rpm": 600, "freshness_policy": {"fresh_seconds": 1800, "aging_seconds": 7200, "stale_seconds": 86400}}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    provider = EXCLUDED.provider,
    updated_at = NOW();

ALTER TABLE external_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_discrepancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read external_observations for all authenticated"
    ON external_observations FOR SELECT
    USING (true);

CREATE POLICY "Allow insert external_observations for all authenticated"
    ON external_observations FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow update external_observations for all authenticated"
    ON external_observations FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow read data_discrepancies for all authenticated"
    ON data_discrepancies FOR SELECT
    USING (true);

CREATE POLICY "Allow insert data_discrepancies for all authenticated"
    ON data_discrepancies FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow update data_discrepancies for all authenticated"
    ON data_discrepancies FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Ensure table permissions for Supabase API roles
GRANT ALL ON TABLE external_observations TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE data_discrepancies TO postgres, anon, authenticated, service_role;

-- Force PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';


