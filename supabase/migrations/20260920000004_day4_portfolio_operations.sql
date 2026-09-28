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
