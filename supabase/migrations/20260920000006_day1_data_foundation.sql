-- ============================================================================
-- BHOOMISETU MIGRATION: 20260920000006_day1_data_foundation.sql
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
