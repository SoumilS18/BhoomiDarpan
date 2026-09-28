-- ============================================================================
-- BHOOMIDARPAN MIGRATION: 20260923000010_day7_disputes_and_outcomes.sql
-- Day 7: Objections & Disputes Register, Recommendation Outcome Feedback
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND RECOMMENDATIONS TABLE WITH OBSERVED IMPACT (FEEDBACK LOOP)
-- ----------------------------------------------------------------------------
ALTER TABLE recommendations
ADD COLUMN IF NOT EXISTS observed_impact JSONB;

-- ----------------------------------------------------------------------------
-- 2. CREATE CASE DISPUTES & OBJECTIONS TABLE (RFCTLARR SEC 15/64/76 COMPLIANCE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES acquisition_cases(id) ON DELETE CASCADE,
    parcel_id UUID REFERENCES parcels(id) ON DELETE SET NULL,
    dispute_type TEXT NOT NULL CHECK (dispute_type IN (
        'title_ownership',
        'compensation_quantum',
        'boundary_encroachment',
        'statutory_eligibility',
        'tribunal_reference',
        'other'
    )),
    complainant_name TEXT NOT NULL,
    complainant_contact TEXT,
    filing_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT NOT NULL,
    statutory_provision TEXT, -- e.g. "Section 15(1)", "Section 64", "Section 76"
    claimed_amount NUMERIC(15, 2) DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status TEXT NOT NULL DEFAULT 'filed' CHECK (status IN (
        'filed',
        'hearing_scheduled',
        'under_investigation',
        'referred_to_authority',
        'settled',
        'dismissed'
    )),
    hearing_date DATE,
    resolution_notes TEXT,
    settled_compensation NUMERIC(15, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for dispute query performance
CREATE INDEX IF NOT EXISTS idx_disputes_case_status ON case_disputes(case_id, status);
CREATE INDEX IF NOT EXISTS idx_disputes_parcel ON case_disputes(parcel_id) WHERE parcel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_disputes_priority ON case_disputes(priority);

-- RLS
ALTER TABLE case_disputes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow authenticated read case_disputes" ON case_disputes;
    CREATE POLICY "Allow authenticated read case_disputes"
        ON case_disputes FOR SELECT
        TO authenticated
        USING (true);

    DROP POLICY IF EXISTS "Allow authenticated insert case_disputes" ON case_disputes;
    CREATE POLICY "Allow authenticated insert case_disputes"
        ON case_disputes FOR INSERT
        TO authenticated
        WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow authenticated update case_disputes" ON case_disputes;
    CREATE POLICY "Allow authenticated update case_disputes"
        ON case_disputes FOR UPDATE
        TO authenticated
        USING (true);
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;
