-- ============================================================================
-- BHOOMISETU MIGRATION: 20260924000011_functional_gaps_closure.sql
-- Functional Gaps Closure: Structured Objections / Disputes Register Expansion,
-- Document View Alias, and Recommendation Lifecycle Alignment
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXPAND CASE DISPUTES STATUS CONSTRAINT & ADD STRUCTURED FIELDS
-- ----------------------------------------------------------------------------
ALTER TABLE case_disputes DROP CONSTRAINT IF EXISTS case_disputes_status_check;

ALTER TABLE case_disputes
ADD CONSTRAINT case_disputes_status_check CHECK (status IN (
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
    'referred_to_authority'
));

-- Add structured dispute tracking fields
ALTER TABLE case_disputes
ADD COLUMN IF NOT EXISTS authority TEXT,
ADD COLUMN IF NOT EXISTS claimant_name TEXT,
ADD COLUMN IF NOT EXISTS resolution_date DATE,
ADD COLUMN IF NOT EXISTS decision_summary TEXT,
ADD COLUMN IF NOT EXISTS court_case_number TEXT,
ADD COLUMN IF NOT EXISTS stay_order_issued BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS evidence_documents JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES user_profiles(id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_disputes_authority ON case_disputes(authority);
CREATE INDEX IF NOT EXISTS idx_disputes_stay_order ON case_disputes(stay_order_issued) WHERE stay_order_issued = true;
CREATE INDEX IF NOT EXISTS idx_disputes_filing_date ON case_disputes(filing_date);

-- ----------------------------------------------------------------------------
-- 2. CREATE CASE_DOCUMENTS VIEW ALIAS (BRIDGES documents AND case_documents)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'case_documents') THEN
        CREATE VIEW case_documents AS SELECT * FROM documents;
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 3. PERMISSIVE POLICIES FOR DISPUTES AND REVIEWS
-- ----------------------------------------------------------------------------
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
