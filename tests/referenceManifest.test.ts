import { describe, it, expect } from 'vitest';
import {
  parseManifest,
  parseArchivePeriod,
  selectArchive,
  parseMemberDate,
  selectMember,
  buildColumnIndex,
  normalizeReferenceRow,
  splitCsvLine,
} from '../server/services/referenceGeographyProvider';
import type { RowProvenance } from '../server/services/geographyProviderContract';

/**
 * Phase B — reference-mirror manifest & archive-selection verification.
 *
 * Offline and read-only: the fixture models the published manifest (header
 * row, comma-containing release URLs, malformed rows, decoy datasets) so the
 * tier→component mapping (`TIER_COMPONENT`) and the "newest archive for THIS
 * tier only" rule are pinned without network access. The live mirror itself
 * is verified by `phaseB_mirror_snapshot.ts`, which drives the same exported
 * helpers against real manifest bytes.
 */

const MANIFEST_FIXTURE = [
  'name,size,url',
  'assembly_constituencies.Apr2026.7z,31965,https://example.invalid/releases/lgd-archive-extra1/assembly_constituencies.Apr2026.7z',
  // The URL below contains a comma; only the first two separators may split.
  'states.Jan2024.7z,1000,https://example.invalid/releases/lgd-archive,extra/states.Jan2024.7z',
  'states.Mar2025.7z,2000,https://example.invalid/releases/states.Mar2025.7z',
  'states.Dec2023.7z,900,https://example.invalid/releases/states.Dec2023.7z',
  'districts.Sep2025.7z,3000,https://example.invalid/releases/districts.Sep2025.7z',
  'subdistricts.Aug2025.7z,4000,https://example.invalid/releases/subdistricts.Aug2025.7z',
  'villages.May2026.7z,5000,https://example.invalid/releases/villages.May2026.7z',
  'villages_by_blocks.Sep2024.7z,9229687,https://example.invalid/releases/villages_by_blocks.Sep2024.7z',
  'missing-url-entry.7z,1234',
  'invalid-size-entry.7z,not-a-number,https://example.invalid/releases/invalid-size-entry.7z',
  '',
].join('\n');

const entries = parseManifest(MANIFEST_FIXTURE);

const provenance: RowProvenance = {
  source_id: 'lgd_reference_mirror',
  provider: 'LGD-derived reference mirror (temporary, non-authoritative)',
  dataset: 'Local Government Directory administrative hierarchy (reference extraction)',
  dataset_version: '2026-05-31',
  acquired_at: '2026-06-01T00:00:00.000Z',
  source_url: 'https://example.invalid/releases/states.Mar2025.7z',
  authority: 'temporary_reference',
  temporary_reference: true,
  license: 'Government Open Data License – India (GODL-India)',
};

describe('reference manifest parsing (Phase B)', () => {
  it('parses valid rows, skips malformed ones, and keeps commas inside URLs', () => {
    expect(entries).toHaveLength(8);
    const withComma = entries.find((e) => e.name === 'states.Jan2024.7z');
    expect(withComma?.url).toBe(
      'https://example.invalid/releases/lgd-archive,extra/states.Jan2024.7z'
    );
    expect(withComma?.size).toBe(1000);
    expect(entries.some((e) => e.name === 'missing-url-entry.7z')).toBe(false);
    expect(entries.some((e) => e.name === 'invalid-size-entry.7z')).toBe(false);
  });
});

describe('archive period parsing (Phase B)', () => {
  it('reads MonYYYY from a component-prefixed archive name', () => {
    expect(parseArchivePeriod('states.Mar2025.7z', 'states')).toEqual({ year: 2025, month: 3 });
  });

  it('rejects wrong prefixes, extensions and month tokens', () => {
    expect(parseArchivePeriod('villages_by_blocks.Sep2024.7z', 'villages')).toBeNull();
    expect(parseArchivePeriod('states.Mar2025.zip', 'states')).toBeNull();
    expect(parseArchivePeriod('states.Xyz2025.7z', 'states')).toBeNull();
  });
});

describe('tier → component archive selection (Phase B)', () => {
  it('selects the newest archive for each tier', () => {
    expect(selectArchive(entries, 'states').name).toBe('states.Mar2025.7z');
    expect(selectArchive(entries, 'districts').name).toBe('districts.Sep2025.7z');
    expect(selectArchive(entries, 'subDistricts').name).toBe('subdistricts.Aug2025.7z');
    expect(selectArchive(entries, 'villages').name).toBe('villages.May2026.7z');
  });

  it('never selects a decoy dataset for the tier', () => {
    const villageEntry = selectArchive(entries, 'villages');
    expect(villageEntry.name.startsWith('villages.')).toBe(true);
    expect(villageEntry.name).not.toContain('villages_by_blocks');
    expect(selectArchive(entries, 'subDistricts').name.startsWith('subdistricts.')).toBe(true);
    expect(selectArchive(entries, 'states').name.startsWith('states.')).toBe(true);
  });

  it('fails loudly when the manifest publishes nothing for the tier', () => {
    const withoutDistricts = entries.filter((e) => !e.name.startsWith('districts.'));
    expect(() => selectArchive(withoutDistricts, 'districts')).toThrow(
      /No "districts" archive/
    );
  });
});

describe('archive member selection (Phase B)', () => {
  it('parses member dates and picks the newest snapshot', () => {
    expect(parseMemberDate('states.31May2026.csv', 'states')).toBe('2026-05-31');
    expect(parseMemberDate('states.readme.txt', 'states')).toBeNull();
    const member = selectMember(
      ['states.31Dec2023.csv', 'states.31May2026.csv', 'notes.txt', 'states.01Jan2026.csv'],
      'states'
    );
    expect(member).toBe('states.31May2026.csv');
  });

  it('throws when the archive holds no dated snapshot for the component', () => {
    expect(() => selectMember(['readme.txt', 'data.csv'], 'states')).toThrow(
      /no dated "states" snapshot/
    );
  });
});

describe('row normalisation (Phase B)', () => {
  it('splits quoted CSV cells containing commas', () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
  });

  it('treats header variants as equal and normalises a state row', () => {
    const header = buildColumnIndex([
      'State Code',
      'State Name (In English)',
      'Census 2011 Code',
      'State or UT',
    ]);
    expect(header.missing(['State Name(In English)'])).toEqual([]);
    const rec = normalizeReferenceRow(
      'states',
      header,
      ['27', 'Maharashtra', '27', 'State'],
      provenance
    );
    expect(rec).toMatchObject({
      unit_type: 'state',
      code: '27',
      name: 'Maharashtra',
      state_code: '27',
      census_code: '27',
    });
    expect(rec?.source_resource_id).toBe('2026-05-31');
    expect(rec?.metadata?.provenance.temporary_reference).toBe(true);
    expect(rec?.metadata?.provenance.authority).toBe('temporary_reference');
  });

  it('rejects a row without the identity columns', () => {
    const header = buildColumnIndex(['State Code', 'State Name (In English)']);
    expect(normalizeReferenceRow('states', header, ['', 'No Code'], provenance)).toBeNull();
  });
});


