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
