-- ============================================================================
-- BHOOMIDARPAN MIGRATION: 20260923000009_day6_gis_spatial_intelligence.sql
-- Day 6: GIS & Spatial Intelligence Layer Extensions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND PROJECTS TABLE WITH SPATIAL BOUNDARY & DISTRICT
-- ----------------------------------------------------------------------------
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS geojson_boundary JSONB,
ADD COLUMN IF NOT EXISTS district TEXT;

-- ----------------------------------------------------------------------------
-- 2. SPATIAL & ADMINISTRATIVE QUERY PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_projects_state ON projects(state);
CREATE INDEX IF NOT EXISTS idx_projects_district ON projects(district);
CREATE INDEX IF NOT EXISTS idx_cases_state_district ON acquisition_cases(state, district);

-- JSONB GIN indexes for efficient spatial boundary queries
CREATE INDEX IF NOT EXISTS idx_cases_geojson ON acquisition_cases USING gin(geojson_boundary) WHERE geojson_boundary IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parcels_geojson ON parcels USING gin(geojson_geometry) WHERE geojson_geometry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_geojson ON projects USING gin(geojson_boundary) WHERE geojson_boundary IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. SEED DAY 6 SPATIAL POLICY
-- ----------------------------------------------------------------------------
INSERT INTO system_policies (id, category, title, description, config_value, updated_by)
VALUES (
    'spatial_policy',
    'attention',
    'Spatial Analysis & Proximity Clustering Policy',
    'Statutory search radii, spatial clustering thresholds, geodetic precision and geographic attention trigger thresholds.',
    '{
        "nearby_search_radius_km": 25,
        "max_search_radius_km": 100,
        "spatial_cluster_distance_km": 15,
        "spatial_freshness_window_hours": 72,
        "spatial_concentration_min_cases": 3,
        "geographic_attention_threshold_delay_days": 15,
        "default_map_zoom": 5,
        "coordinate_precision_decimals": 6
    }'::jsonb,
    'System Day 6'
)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    config_value = EXCLUDED.config_value,
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by;
