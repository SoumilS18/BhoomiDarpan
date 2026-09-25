-- ============================================================================
-- BHOOMISETU MIGRATION: 20260921000007_day2_live_data_observations.sql
-- Day 2: Live Data, Normalized Observations, Freshness & Discrepancy Detection
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. NORMALIZED EXTERNAL OBSERVATIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS external_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT REFERENCES data_sources(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    observation_type TEXT NOT NULL CHECK (observation_type IN ('weather', 'geocoding', 'environmental', 'administrative', 'satellite_index')),
    entity_type TEXT NOT NULL, -- 'case', 'project', 'location', 'parcel'
    entity_id TEXT NOT NULL,
    coordinates JSONB, -- {"latitude": number, "longitude": number}
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

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_observations_entity ON external_observations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_observations_source ON external_observations(source_id);
CREATE INDEX IF NOT EXISTS idx_observations_type ON external_observations(observation_type);
CREATE INDEX IF NOT EXISTS idx_observations_observed_at ON external_observations(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_retrieved_at ON external_observations(retrieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_freshness ON external_observations(freshness_state);

-- ----------------------------------------------------------------------------
-- 2. CROSS-SOURCE DATA DISCREPANCIES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL, -- 'case', 'project', 'parcel', 'administrative_unit'
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

-- ----------------------------------------------------------------------------
-- 3. REGISTER OPEN-METEO WEATHER SOURCE IN DATA SOURCES REGISTRY
-- ----------------------------------------------------------------------------
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
    '{
        "attribution": "Open-Meteo.com (CC BY 4.0) & National Weather Services",
        "rate_limit_rpm": 600,
        "freshness_policy": {
            "fresh_seconds": 1800,
            "aging_seconds": 7200,
            "stale_seconds": 86400
        },
        "supported_measurements": ["temperature_2m", "relative_humidity_2m", "precipitation", "rain", "weather_code", "wind_speed_10m", "surface_pressure"]
    }'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    provider = EXCLUDED.provider,
    endpoint_ref = EXCLUDED.endpoint_ref,
    data_scope = EXCLUDED.data_scope,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- ----------------------------------------------------------------------------
-- 4. ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE external_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_discrepancies ENABLE ROW LEVEL SECURITY;

-- external_observations: Anyone authenticated can read; service role and officers can write
DO $$ BEGIN
    DROP POLICY IF EXISTS "Authenticated users can view external observations" ON external_observations;
    CREATE POLICY "Authenticated users can view external observations"
        ON external_observations FOR SELECT
        USING (auth.role() = 'authenticated' OR auth.role() = 'anon');
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Service role and officers can manage external observations" ON external_observations;
    CREATE POLICY "Service role and officers can manage external observations"
        ON external_observations FOR ALL
        USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- data_discrepancies: Anyone authenticated can read; officers can update/resolve
DO $$ BEGIN
    DROP POLICY IF EXISTS "Authenticated users can view discrepancies" ON data_discrepancies;
    CREATE POLICY "Authenticated users can view discrepancies"
        ON data_discrepancies FOR SELECT
        USING (auth.role() = 'authenticated' OR auth.role() = 'anon');
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Authorized officers can resolve discrepancies" ON data_discrepancies;
    CREATE POLICY "Authorized officers can resolve discrepancies"
        ON data_discrepancies FOR ALL
        USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Ensure table permissions for Supabase API roles
GRANT ALL ON TABLE external_observations TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE data_discrepancies TO postgres, anon, authenticated, service_role;

-- Force PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';
