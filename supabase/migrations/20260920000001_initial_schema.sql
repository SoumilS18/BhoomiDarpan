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
