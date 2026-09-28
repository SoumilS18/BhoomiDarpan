-- ============================================================================
-- BhoomiDarpan Migration: LGD Reference Mirror Source Registration
-- Migration: 20260927000001_lgd_reference_mirror_source.sql
-- ============================================================================

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
    'lgd_reference_mirror',
    'Local Government Directory (LGD) Reference Mirror (Temporary)',
    'administrative_data',
    'LGD Open Data Mirror / ramSeraph (GODL-India)',
    'https://ramseraph.github.io/opendata/lgd',
    'configured',
    TRUE,
    'manual_import',
    'Temporary reference National Administrative Master: States, Districts, Sub-Districts/Tehsils, Villages',
    '{"license": "Government Open Data License – India (GODL-India)", "authority": "temporary_reference", "authoritative": false, "lineage": "Extracted from the Local Government Directory Download Directory by a published, auditable extractor and republished as dated archives.", "source_url": "https://github.com/ramSeraph/opendata/releases"}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    provider = EXCLUDED.provider,
    endpoint_ref = EXCLUDED.endpoint_ref,
    data_scope = EXCLUDED.data_scope,
    metadata = data_sources.metadata || EXCLUDED.metadata,
    updated_at = NOW();
