-- ============================================================================
-- BhoomiSetu Migration: LGD Authoritative Administrative Geography
-- Migration: 20260925000012_lgd_administrative_geography.sql
-- ============================================================================

-- 1. Extend unit_type check constraint on administrative_units to include 'village'
ALTER TABLE administrative_units 
DROP CONSTRAINT IF EXISTS administrative_units_unit_type_check;

ALTER TABLE administrative_units 
ADD CONSTRAINT administrative_units_unit_type_check 
CHECK (unit_type IN ('state', 'district', 'sub_district', 'locality', 'village'));

-- 2. Add supplementary authoritative LGD & sync metadata columns to administrative_units
ALTER TABLE administrative_units
ADD COLUMN IF NOT EXISTS census_code TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS source_resource_id TEXT,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS source_record_ref TEXT;

-- 3. Create high-performance indexes on administrative_units for hierarchical lookups
CREATE INDEX IF NOT EXISTS idx_admin_code ON administrative_units(code);
CREATE INDEX IF NOT EXISTS idx_admin_parent ON administrative_units(parent_id);
CREATE INDEX IF NOT EXISTS idx_admin_unit_type ON administrative_units(unit_type);
CREATE INDEX IF NOT EXISTS idx_admin_state_code ON administrative_units(state_code);
CREATE INDEX IF NOT EXISTS idx_admin_district_code ON administrative_units(district_code);
CREATE INDEX IF NOT EXISTS idx_admin_subdistrict_code ON administrative_units(sub_district_code);
CREATE INDEX IF NOT EXISTS idx_admin_type_code ON administrative_units(unit_type, code);

-- 4. Add official LGD code foreign references to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS state_lgd_code TEXT,
ADD COLUMN IF NOT EXISTS district_lgd_code TEXT,
ADD COLUMN IF NOT EXISTS subdistrict_lgd_code TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_lgd_state ON projects(state_lgd_code);
CREATE INDEX IF NOT EXISTS idx_projects_lgd_district ON projects(district_lgd_code);

-- 5. Add official LGD code references to acquisition_cases table
ALTER TABLE acquisition_cases
ADD COLUMN IF NOT EXISTS state_lgd_code TEXT,
ADD COLUMN IF NOT EXISTS district_lgd_code TEXT,
ADD COLUMN IF NOT EXISTS subdistrict_lgd_code TEXT,
ADD COLUMN IF NOT EXISTS village_lgd_code TEXT;

CREATE INDEX IF NOT EXISTS idx_cases_lgd_state ON acquisition_cases(state_lgd_code);
CREATE INDEX IF NOT EXISTS idx_cases_lgd_district ON acquisition_cases(district_lgd_code);
CREATE INDEX IF NOT EXISTS idx_cases_lgd_subdistrict ON acquisition_cases(subdistrict_lgd_code);
CREATE INDEX IF NOT EXISTS idx_cases_lgd_village ON acquisition_cases(village_lgd_code);

-- 6. Add official LGD territorial jurisdiction codes to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS jurisdiction_state_lgd_code TEXT,
ADD COLUMN IF NOT EXISTS jurisdiction_district_lgd_code TEXT,
ADD COLUMN IF NOT EXISTS jurisdiction_subdistrict_lgd_code TEXT;

CREATE INDEX IF NOT EXISTS idx_users_jurisdiction_lgd_district ON user_profiles(jurisdiction_district_lgd_code);

-- 7. Ensure lgd_india entry in data_sources is configured with proper metadata
INSERT INTO data_sources (
    id,
    name,
    type,
    provider,
    endpoint_ref,
    status,
    is_enabled,
    sync_mode,
    data_scope,
    metadata
) VALUES (
    'lgd_india',
    'Local Government Directory (LGD) Authoritative Hierarchy',
    'administrative_data',
    'Ministry of Panchayati Raj / Open Government Data (data.gov.in)',
    'https://api.data.gov.in/resource',
    'not_configured',
    TRUE,
    'on_demand',
    'Authoritative National Administrative Master: States, Districts, Sub-Districts/Tehsils, Villages',
    '{"license": "Government Open Data License - India (GODL)", "canonical_provider": "data.gov.in", "server_side_only": true}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    provider = EXCLUDED.provider,
    endpoint_ref = EXCLUDED.endpoint_ref,
    data_scope = EXCLUDED.data_scope,
    metadata = administrative_units.metadata || EXCLUDED.metadata;
