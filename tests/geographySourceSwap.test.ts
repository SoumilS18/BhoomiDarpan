import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ingestLgdTier, resetLgdSyncLockForTests } from '../server/services/lgdIngestionService';
import {
  getGeographyProvenance,
  clearInMemoryUnits,
  inMemoryUnitsStore,
} from '../server/services/administrativeGeographyService';
import { getGeographySource } from '../server/config/geographySourceRegistry';

/**
 * Phase G (data-quality) + Phase H (reference → authoritative swap).
 *
 * The active geography source is resolved per ingestion run from
 * `GEOGRAPHY_ACTIVE_SOURCE`, so a test can ingest the same bytes once as
 * temporary reference rows and once as official LGD. That exercises the
 * `sourceChanged` re-stamp in `lgdIngestionService`: rows whose content is
 * identical must still be re-attributed when their source changes, and
 * `getGeographyProvenance()` has to follow the rows — never a constant.
 */

const STATES = [
  { state_code: 27, state_name_english: 'Maharashtra', state_or_ut: 'S' },
  { state_code: 32, state_name_english: 'Kerala', state_or_ut: 'S' },
];

const DISTRICTS = [
  { state_code: 27, district_code: 521, district_name_english: 'Pune', district_census2011_code: '521' },
  { state_code: 32, district_code: 555, district_name_english: 'Ernakulam', district_census2011_code: '595' },
];

let savedActiveSource: string | undefined;

const setActiveSource = (id: 'lgd_india' | 'lgd_reference_mirror'): void => {
  process.env.GEOGRAPHY_ACTIVE_SOURCE = id;
};

beforeEach(() => {
  savedActiveSource = process.env.GEOGRAPHY_ACTIVE_SOURCE;
  clearInMemoryUnits();
  resetLgdSyncLockForTests();
});

afterEach(() => {
  if (savedActiveSource === undefined) delete process.env.GEOGRAPHY_ACTIVE_SOURCE;
  else process.env.GEOGRAPHY_ACTIVE_SOURCE = savedActiveSource;
  clearInMemoryUnits();
  resetLgdSyncLockForTests();
});

describe('1. Data-quality invariants hold for temporary reference rows', () => {
  it('every ingested row carries a registered source id and a traceable resource id', async () => {
    setActiveSource('lgd_reference_mirror');
    await ingestLgdTier('states', { recordsOverride: STATES });
    await ingestLgdTier('districts', { recordsOverride: DISTRICTS });

    expect(inMemoryUnitsStore.length).toBe(4);
    for (const unit of inMemoryUnitsStore) {
      expect(getGeographySource(String(unit.source_id))).not.toBeNull();
      expect(unit.source_resource_id).toBeTruthy();
      expect(unit.source_id).toBe('lgd_reference_mirror');
    }
  });

  it('provenance row buckets reconcile exactly with the store and the hierarchy stays orphan-free', async () => {
    setActiveSource('lgd_reference_mirror');
    await ingestLgdTier('states', { recordsOverride: STATES });
    await ingestLgdTier('districts', { recordsOverride: DISTRICTS });

    const provenance = await getGeographyProvenance();
    const bucketed =
      provenance.source_rows.lgd_india +
      provenance.source_rows.lgd_reference_mirror +
      provenance.source_rows.other;
    expect(bucketed).toBe(inMemoryUnitsStore.length);
    expect(provenance.units_in_database).toBe(inMemoryUnitsStore.length);
    expect(provenance.counts.states + provenance.counts.districts).toBe(inMemoryUnitsStore.length);

    // No orphan districts: each district's state must exist in the same store.
    const stateCodes = new Set(
      inMemoryUnitsStore.filter((u) => u.unit_type === 'state').map((u) => String(u.code))
    );
    const orphanDistricts = inMemoryUnitsStore.filter(
      (u) => u.unit_type === 'district' && !stateCodes.has(String(u.state_code))
    );
    expect(orphanDistricts.length).toBe(0);
  });
});

describe('2. Reference → authoritative swap re-stamps provenance', () => {
  it('re-ingesting identical rows under the official source re-stamps every row and flips provenance to authoritative', async () => {
    setActiveSource('lgd_reference_mirror');
    const refRun = await ingestLgdTier('states', { recordsOverride: STATES });
    expect(refRun.records_inserted).toBe(2);

    const refProvenance = await getGeographyProvenance();
    expect(refProvenance.status).toBe('temporary_reference');
    expect(refProvenance.authoritative).toBe(false);
    expect(refProvenance.active_source).toBe('lgd_reference_mirror');
    expect(refProvenance.source_rows).toEqual({ lgd_india: 0, lgd_reference_mirror: 2, other: 0 });
    expect(refProvenance.requires).toBeTruthy();

    // The same bytes now arrive from the official source: content is
    // identical, but provenance must be re-stamped anyway.
    setActiveSource('lgd_india');
    const officialRun = await ingestLgdTier('states', { recordsOverride: STATES });
    expect(officialRun.records_inserted).toBe(0);
    expect(officialRun.records_unchanged).toBe(0);
    expect(officialRun.records_updated).toBe(2);

    expect(inMemoryUnitsStore.every((u) => u.source_id === 'lgd_india')).toBe(true);

    const officialProvenance = await getGeographyProvenance();
    expect(officialProvenance.status).toBe('authoritative');
    expect(officialProvenance.authoritative).toBe(true);
    expect(officialProvenance.active_source).toBe('lgd_india');
    expect(officialProvenance.source_rows).toEqual({ lgd_india: 2, lgd_reference_mirror: 0, other: 0 });
    expect(officialProvenance.requires).toBeNull();
  });

  it('reports mixed provenance while tiers were ingested from different sources', async () => {
    setActiveSource('lgd_india');
    await ingestLgdTier('states', { recordsOverride: STATES });
    setActiveSource('lgd_reference_mirror');
    await ingestLgdTier('districts', { recordsOverride: DISTRICTS });

    const provenance = await getGeographyProvenance();
    expect(provenance.status).toBe('mixed');
    expect(provenance.authoritative).toBe(false);
    expect(provenance.active_source).toBe('mixed');
    expect(provenance.source_rows).toEqual({ lgd_india: 2, lgd_reference_mirror: 2, other: 0 });
    expect(provenance.source).toContain('Mixed sources');
    expect(provenance.message).toMatch(/NOT fully authoritative/i);
    expect(provenance.requires).toBeTruthy();
  });

  it('re-running the SAME source stays idempotent (unchanged, never a spurious re-stamp)', async () => {
    setActiveSource('lgd_reference_mirror');
    await ingestLgdTier('states', { recordsOverride: STATES });
    const repeat = await ingestLgdTier('states', { recordsOverride: STATES });

    expect(repeat.records_inserted).toBe(0);
    expect(repeat.records_updated).toBe(0);
    expect(repeat.records_unchanged).toBe(2);
    expect(inMemoryUnitsStore.length).toBe(2);
  });
});

