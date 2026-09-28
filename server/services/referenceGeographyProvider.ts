/**
 * Temporary, replaceable administrative-geography provider (Phases B, C, D).
 *
 * WHAT THIS IS
 * ------------
 * A *reference* source for the State → District → Sub-District → Village
 * hierarchy used only while official LGD credentials are unavailable. It is
 * registered in `geographySourceRegistry` as `lgd_reference_mirror` with
 * authority `temporary_reference`, and every row it writes says so in its own
 * `metadata.provenance`. Nothing here may ever be described as authoritative
 * LGD.
 *
 * HOW IT IS READ (Phase B: no local bulk download)
 * ------------------------------------------------
 *   1. a small dated manifest is fetched (a few hundred KB),
 *   2. the newest archive for the requested tier is downloaded to a temporary
 *      directory that is removed in a `finally` block,
 *   3. one member is decompressed straight to stdout and consumed line by
 *      line — the decompressed dataset is never written to disk,
 *   4. rows are normalised, parent-validated by *code*, and upserted in
 *      bounded batches.
 *
 * Peak on-disk footprint is therefore one compressed archive (≈10 MB) for the
 * duration of a single tier, not a 60 MB+ decompressed copy of the country.
 *
 * SECURITY (Phase M)
 * ------------------
 * Manifest and archive URLs come from the server-side source registry only —
 * never from a request — so ingestion cannot be pointed at an arbitrary host.
 * No credential is involved, none is logged, and none reaches the client.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import type { LgdAdministrativeTier } from '../config/lgdConfig';
import { REFERENCE_MIRROR_ENDPOINTS, getGeographySource, referenceMirrorVerified } from '../config/geographySourceRegistry';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { isTestEnvironment } from '../config/runtimeEnv';
import type { AdminUnitType, LgdSyncTierSummary } from '../../shared/types';
import type { NormalizedLgdRecord, RowProvenance } from './geographyProviderContract';
import { inMemoryUnitsStore, registerAdministrativeUnit } from './administrativeGeographyService';

// ---------------------------------------------------------------------------
// Tier mapping (kept local so this module never imports the ingestion pipeline)
// ---------------------------------------------------------------------------

const TIER_UNIT_TYPE: Record<LgdAdministrativeTier, AdminUnitType> = {
  states: 'state',
  districts: 'district',
  subDistricts: 'sub_district',
  villages: 'village',
};

const TIER_PARENT_TYPE: Partial<Record<LgdAdministrativeTier, AdminUnitType>> = {
  districts: 'state',
  subDistricts: 'district',
  villages: 'sub_district',
};

/** Manifest component name for each tier. */
const TIER_COMPONENT: Record<LgdAdministrativeTier, string> = {
  states: 'states',
  districts: 'districts',
  subDistricts: 'subdistricts',
  villages: 'villages',
};

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/** Rows per upsert. Bounded so neither memory nor request size grows without limit. */
const DEFAULT_BATCH_SIZE = 500;
/** Parent-id lookups are paged; this is the page size, not a cap on parents. */
const ID_PAGE_SIZE = 1000;
/** Validation detail is capped so one bad tier cannot grow an unbounded list. */
const MAX_REPORTED_ERRORS = 500;
/** Refuse to buffer a manifest or archive larger than this on the server. */
const MAX_MANIFEST_BYTES = 5 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Archive descriptors
// ---------------------------------------------------------------------------

export interface ReferenceArchiveInfo {
  component: string;
  archive_name: string;
  url: string;
  size_bytes: number;
  /** `YYYY-MM` derived from the archive name, e.g. `2026-05`. */
  dataset_version: string;
  /** `YYYY-MM-DD` of the newest snapshot inside the archive. */
  dataset_date: string;
  /** Member actually streamed, e.g. `villages.31May2026.csv`. */
  member: string;
  manifest_url: string;
  retrieved_at: string;
}

export interface ManifestEntry {
  name: string;
  size: number;
  url: string;
}

export function parseManifest(text: string): ManifestEntry[] {
  const lines = text.split(/\r?\n/);
  const out: ManifestEntry[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    // URLs contain commas, so split only on the first two separators.
    const first = line.indexOf(',');
    if (first < 0) continue;
    const second = line.indexOf(',', first + 1);
    if (second < 0) continue;
    const name = line.slice(0, first);
    const size = Number(line.slice(first + 1, second));
    const url = line.slice(second + 1).trim();
    if (!name || !Number.isFinite(size) || !url) continue;
    out.push({ name, size, url });
  }
  return out;
}

async function fetchText(url: string, maxBytes: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} while reading the archive manifest`);
    const text = await res.text();
    if (text.length > maxBytes) {
      throw new Error(`Manifest exceeded the ${maxBytes}-byte bound; refusing to buffer it.`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** `districts.May2026.7z` → { year, month }; unparseable names are skipped. */
export function parseArchivePeriod(name: string, component: string): { year: number; month: number } | null {
  const m = name.match(new RegExp(`^${component}\\.([A-Z][a-z]{2})(\\d{4})\\.7z$`));
  if (!m) return null;
  const month = MONTHS[m[1]];
  if (!month) return null;
  return { year: Number(m[2]), month };
}

/**
 * Picks the newest archive for a tier from a manifest.
 *
 * Only ever returns an entry for that tier's own component, so a manifest entry
 * cannot redirect ingestion to some other dataset.
 */
export function selectArchive(entries: ManifestEntry[], tier: LgdAdministrativeTier): ManifestEntry {
  const component = TIER_COMPONENT[tier];
  let best: { entry: ManifestEntry; period: { year: number; month: number } } | null = null;

  for (const entry of entries) {
    const period = parseArchivePeriod(entry.name, component);
    if (!period) continue;
    if (
      !best ||
      period.year > best.period.year ||
      (period.year === best.period.year && period.month > best.period.month)
    ) {
      best = { entry, period };
    }
  }

  if (!best) {
    throw new Error(
      `No "${component}" archive is published by the reference manifest, so this tier cannot be ingested.`
    );
  }
  return best.entry;
}

async function downloadArchive(entry: ManifestEntry, dest: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000);
  try {
    const res = await fetch(entry.url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} while downloading ${entry.name}`);
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_ARCHIVE_BYTES) {
      throw new Error(`Archive ${entry.name} declares ${declared} bytes; refusing to download it.`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_ARCHIVE_BYTES) {
      throw new Error(`Archive ${entry.name} arrived at ${buf.byteLength} bytes; refusing to keep it.`);
    }
    await writeFile(dest, buf);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Decompression (7z) without installing anything
// ---------------------------------------------------------------------------

interface Extractor {
  bin: string;
  list: (archive: string) => string[];
  extract: (archive: string, member: string) => string[];
}

function extractorFor(bin: string): Extractor {
  const is7z = /7z/i.test(basename(bin));
  return {
    bin,
    list: (archive) => (is7z ? ['l', '-ba', archive] : ['-tf', archive]),
    extract: (archive, member) => (is7z ? ['x', '-so', archive, member] : ['-xOf', archive, member]),
  };
}

function candidateExtractors(): string[] {
  const winTar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  return process.platform === 'win32'
    ? [winTar, 'tar.exe', 'bsdtar', 'tar', '7z', '7za']
    : ['bsdtar', 'tar', '7z', '7za'];
}

interface RunResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  spawnError?: string;
}

function runCapture(bin: string, args: string[], timeoutMs = 120_000): Promise<RunResult> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, { windowsHide: true });
    } catch (err: any) {
      resolve({ ok: false, code: null, stdout: '', stderr: '', spawnError: err?.message || 'spawn failed' });
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      resolve({ ok: false, code: null, stdout, stderr, spawnError: 'extractor timed out' });
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr, spawnError: err.message });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

/**
 * Finds an already-installed tool that can read the archive. Nothing is
 * downloaded or installed: if none can, ingestion reports
 * `EXTRACTOR_UNAVAILABLE` instead of quietly producing a partial hierarchy.
 */
async function findExtractor(archive: string): Promise<Extractor> {
  const failures: string[] = [];
  for (const bin of candidateExtractors()) {
    const probe = await runCapture(bin, extractorFor(bin).list(archive), 60_000);
    if (probe.ok) return extractorFor(bin);
    failures.push(
      `${bin}: ${probe.spawnError || probe.stderr.trim().slice(0, 120) || `exit ${probe.code}`}`
    );
  }
  throw new Error(
    `EXTRACTOR_UNAVAILABLE: no installed tool can read this .7z archive (tried ${failures.length} ` +
      `candidates). Install a 7z-capable archiver such as bsdtar or 7-Zip and retry. ` +
      `Details: ${failures.join('; ')}`
  );
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Splits one CSV line, honouring double-quoted fields that contain commas. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const normaliseHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '');

/** Reads lines from a child process stdout without ever buffering the member. */
async function* readLines(stream: NodeJS.ReadableStream): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of stream as unknown as AsyncIterable<Buffer | string>) {
    buf += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    let nl = buf.indexOf('\n');
    while (nl >= 0) {
      yield buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      nl = buf.indexOf('\n');
    }
  }
  if (buf.length) yield buf.replace(/\r$/, '');
}

/** `villages.31May2026.csv` → `2026-05-31`, or `null` when unparseable. */
export function parseMemberDate(member: string, component: string): string | null {
  const m = member.match(new RegExp(`^${component}\\.(\\d{2})([A-Z][a-z]{2})(\\d{4})\\.csv$`));
  if (!m || !MONTHS[m[2]]) return null;
  return `${m[3]}-${String(MONTHS[m[2]]).padStart(2, '0')}-${m[1]}`;
}

export function selectMember(members: string[], component: string): string {
  let best: { member: string; date: string } | null = null;
  for (const member of members) {
    const date = parseMemberDate(member, component);
    if (!date) continue;
    if (!best || date > best.date) best = { member, date };
  }
  if (!best) {
    throw new Error(
      `The archive contains no dated "${component}" snapshot, so no row can be attributed to a dataset date.`
    );
  }
  return best.member;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

export interface ColumnIndex {
  get: (...names: string[]) => number;
  missing: (names: string[]) => string[];
}

export function buildColumnIndex(header: string[]): ColumnIndex {
  const map = new Map<string, number>();
  header.forEach((name, i) => {
    const key = normaliseHeader(name);
    if (key && !map.has(key)) map.set(key, i);
  });
  return {
    get: (...names: string[]) => {
      for (const name of names) {
        const idx = map.get(normaliseHeader(name));
        if (idx !== undefined) return idx;
      }
      return -1;
    },
    missing: (names) => names.filter((name) => !map.has(normaliseHeader(name))),
  };
}

const at = (cells: string[], idx: number): string =>
  idx >= 0 && idx < cells.length ? cells[idx].trim() : '';

/**
 * Reduces one parsed CSV row of the reference archive to a normalised record.
 *
 * `code` is the LGD code carried by the archive — the same identifier official
 * LGD uses — so these rows occupy the same identity space as authoritative
 * ones and can be superseded later without a migration.
 */
export function normalizeReferenceRow(
  tier: LgdAdministrativeTier,
  header: ColumnIndex,
  cells: string[],
  provenance: RowProvenance
): NormalizedLgdRecord | null {
  const census = 'Census 2011 Code';

  if (tier === 'states') {
    const code = at(cells, header.get('State Code'));
    const name = at(cells, header.get('State Name (In English)'));
    if (!code || !name) return null;
    return {
      unit_type: 'state',
      code,
      name,
      local_name: at(cells, header.get('State Name (In Local)')) || null,
      parent_code: null,
      state_code: code,
      census_code: at(cells, header.get(census)) || null,
      source_resource_id: provenance.dataset_version || provenance.source_id,
      metadata: {
        provenance,
        state_or_ut: at(cells, header.get('State or UT')) || null,
        source_tier: tier,
      },
    };
  }

  if (tier === 'districts') {
    const code = at(cells, header.get('District Code'));
    const name = at(cells, header.get('District Name (In English)', 'District Name(In English)'));
    const stateCode = at(cells, header.get('State Code'));
    if (!code || !name) return null;
    return {
      unit_type: 'district',
      code,
      name,
      local_name: at(cells, header.get('District Name (In Local)', 'District Name(In Local)')) || null,
      parent_code: stateCode || null,
      state_code: stateCode || null,
      district_code: code,
      census_code: at(cells, header.get(census)) || null,
      source_resource_id: provenance.dataset_version || provenance.source_id,
      metadata: {
        provenance,
        state_name_english: at(cells, header.get('State Name (In English)', 'State Name')) || null,
        source_tier: tier,
      },
    };
  }

  if (tier === 'subDistricts') {
    const code = at(cells, header.get('Sub-district Code', 'Sub-District Code'));
    const name = at(cells, header.get('Sub-district Name', 'Sub-District Name'));
    const districtCode = at(cells, header.get('District Code'));
    const stateCode = at(cells, header.get('State Code'));
    if (!code || !name) return null;
    return {
      unit_type: 'sub_district',
      code,
      name,
      local_name: null,
      parent_code: districtCode || null,
      state_code: stateCode || null,
      district_code: districtCode || null,
      sub_district_code: code,
      census_code: at(cells, header.get(census)) || null,
      source_resource_id: provenance.dataset_version || provenance.source_id,
      metadata: {
        provenance,
        district_name_english: at(cells, header.get('District Name', 'District Name (In English)')) || null,
        state_name_english: at(cells, header.get('State Name', 'State Name (In English)')) || null,
        source_tier: tier,
      },
    };
  }

  const code = at(cells, header.get('Village Code'));
  const name = at(cells, header.get('Village Name (In English)'));
  const subDistrictCode = at(cells, header.get('Sub-District Code'));
  const districtCode = at(cells, header.get('District Code'));
  const stateCode = at(cells, header.get('State Code'));
  if (!code || !name) return null;
  return {
    unit_type: 'village',
    code,
    name,
    local_name: at(cells, header.get('Village Name (In Local)')) || null,
    parent_code: subDistrictCode || null,
    state_code: stateCode || null,
    district_code: districtCode || null,
    sub_district_code: subDistrictCode || null,
    census_code: at(cells, header.get(census)) || null,
    source_resource_id: provenance.dataset_version || provenance.source_id,
    metadata: {
      provenance,
      village_category: at(cells, header.get('Village Category')) || null,
      village_status: at(cells, header.get('Village Status')) || null,
      district_name_english: at(cells, header.get('District Name (In English)')) || null,
      state_name_english: at(cells, header.get('State Name (In English)')) || null,
      source_tier: tier,
    },
  };
}

/**
 * Columns that must exist for a tier to be ingested at all.
 *
 * Reported by name rather than surfacing later as an inexplicably empty tier:
 * if the source changes its schema, the failure says exactly what disappeared
 * and confirms that nothing was ingested.
 */
const REQUIRED_COLUMNS: Record<LgdAdministrativeTier, string[]> = {
  states: ['State Code', 'State Name (In English)'],
  districts: ['State Code', 'District Code', 'District Name (In English)'],
  subDistricts: ['State Code', 'District Code', 'Sub-district Code', 'Sub-district Name'],
  villages: [
    'State Code',
    'District Code',
    'Sub-District Code',
    'Village Code',
    'Village Name (In English)',
  ],
};

// ---------------------------------------------------------------------------
// Storage helpers — database outside the test harness, memory inside it
// ---------------------------------------------------------------------------

const useDatabase = (): boolean => isSupabaseConfigured && !isTestEnvironment();

interface PendingRow {
  record: NormalizedLgdRecord;
  parent_id: string | null;
}

/** Parent identifiers, keyed by LGD code, used for hierarchy validation. */
async function loadIdMap(unitType: AdminUnitType): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!useDatabase()) {
    for (const unit of inMemoryUnitsStore) {
      if (unit.unit_type === unitType) map.set(unit.code, unit.id);
    }
    return map;
  }
  const client = getSupabase();
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from('administrative_units')
      .select('code,id')
      .eq('unit_type', unitType)
      .range(from, from + ID_PAGE_SIZE - 1);
    if (error) {
      throw new Error(`Could not read ${unitType} identifiers for parent validation: ${error.message}`);
    }
    const rows = (data || []) as Array<{ code: string; id: string }>;
    for (const row of rows) map.set(row.code, row.id);
    if (rows.length < ID_PAGE_SIZE) break;
    from += ID_PAGE_SIZE;
  }
  return map;
}

async function countTier(unitType: AdminUnitType, sourceId?: string): Promise<number> {
  if (!useDatabase()) {
    return inMemoryUnitsStore.filter(
      (u) => u.unit_type === unitType && (!sourceId || u.source_id === sourceId)
    ).length;
  }
  const client = getSupabase();

  if (unitType === 'village') {
    // Partition by district to avoid PostgREST statement timeout on 676k+ rows
    const { data: districts } = await client
      .from('administrative_units')
      .select('code')
      .eq('unit_type', 'district');

    if (!districts || districts.length === 0) return 0;

    let total = 0;
    const batchSize = 50;
    for (let i = 0; i < districts.length; i += batchSize) {
      const slice = districts.slice(i, i + batchSize);
      const results = await Promise.all(
        slice.map(async (d) => {
          let q = client
            .from('administrative_units')
            .select('id', { count: 'exact', head: true })
            .eq('unit_type', 'village')
            .eq('district_code', d.code);
          if (sourceId) q = q.eq('source_id', sourceId);
          const { count } = await q;
          return count || 0;
        })
      );
      total += results.reduce((a, b) => a + b, 0);
    }
    return total;
  }

  let query = client
    .from('administrative_units')
    .select('id', { count: 'exact', head: true })
    .eq('unit_type', unitType);
  if (sourceId) query = query.eq('source_id', sourceId);
  const { count, error } = await query;
  if (error) throw new Error(`Could not count ${unitType} rows: ${error.message}`);
  return typeof count === 'number' ? count : 0;
}

interface ExistingRow {
  name: string;
  local_name: string | null;
  census_code: string | null;
  state_code: string | null;
  district_code: string | null;
  sub_district_code: string | null;
  parent_id: string | null;
  source_id: string | null;
}

/** Existing values for one batch — read only when the tier already holds rows. */
async function loadExisting(
  unitType: AdminUnitType,
  codes: string[]
): Promise<Map<string, ExistingRow>> {
  const map = new Map<string, ExistingRow>();
  if (codes.length === 0) return map;
  if (!useDatabase()) {
    for (const unit of inMemoryUnitsStore) {
      if (unit.unit_type !== unitType || !codes.includes(unit.code)) continue;
      map.set(unit.code, {
        name: unit.name,
        local_name: unit.local_name ?? null,
        census_code: unit.census_code ?? null,
        state_code: unit.state_code ?? null,
        district_code: unit.district_code ?? null,
        sub_district_code: unit.sub_district_code ?? null,
        parent_id: unit.parent_id ?? null,
        source_id: unit.source_id ?? null,
      });
    }
    return map;
  }
  const { data, error } = await getSupabase()
    .from('administrative_units')
    .select(
      'code,name,local_name,census_code,state_code,district_code,sub_district_code,parent_id,source_id'
    )
    .eq('unit_type', unitType)
    .in('code', codes);
  if (error) return map;
  for (const row of (data || []) as Array<ExistingRow & { code: string }>) map.set(row.code, row);
  return map;
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

export interface ReferenceIngestOptions {
  batchSize?: number;
  concurrency?: number;
  maxRecordsPerTier?: number;
  /**
   * Deterministic fixture: raw CSV lines ingested instead of fetching an
   * archive, so the replacement path can be exercised with no network at all.
   * Set only by tests — never accepted from an HTTP request.
   */
  referenceCsvLines?: string[];
  actor?: string;
  onProgress?: (progress: { received: number; inserted: number; updated: number; rejected: number }) => void;
}

export interface ReferenceIngestContext {
  archive: ReferenceArchiveInfo | null;
  provenance: RowProvenance;
}

const REFERENCE_SOURCE_ID = 'lgd_reference_mirror';

function buildProvenance(archive: ReferenceArchiveInfo | null): RowProvenance {
  const source = getGeographySource(REFERENCE_SOURCE_ID);
  return {
    source_id: REFERENCE_SOURCE_ID,
    provider: source?.label || 'LGD-derived reference mirror (temporary, non-authoritative)',
    dataset: 'Local Government Directory administrative hierarchy (reference extraction)',
    dataset_version: archive ? archive.dataset_date : null,
    acquired_at: new Date().toISOString(),
    source_url: archive ? archive.url : source?.source_url || REFERENCE_MIRROR_ENDPOINTS.monthlyManifest,
    authority: 'temporary_reference',
    temporary_reference: true,
    license: source?.license || 'Government Open Data License – India (GODL-India)',
  };
}

/**
 * Ensures lgd_reference_mirror is registered in data_sources table before ingestion writes.
 */
export async function ensureReferenceSourceRegistered(): Promise<void> {
  if (!useDatabase() || isTestEnvironment()) return;
  try {
    const client = getSupabase();
    const descriptor = getGeographySource('lgd_reference_mirror');
    await client.from('data_sources').upsert(
      {
        id: 'lgd_reference_mirror',
        name: 'Local Government Directory (LGD) Reference Mirror (Temporary)',
        type: 'administrative_data',
        provider: 'LGD Open Data Mirror / ramSeraph (GODL-India)',
        endpoint_ref: 'https://ramseraph.github.io/opendata/lgd',
        env_secret_keys: [],
        status: referenceMirrorVerified() ? 'configured' : 'requires_credentials',
        is_enabled: true,
        sync_mode: 'manual_import',
        data_scope:
          'Temporary reference National Administrative Master: States, Districts, Sub-Districts/Tehsils, Villages',
        metadata: {
          license: descriptor?.license || 'Government Open Data License – India (GODL-India)',
          authority: descriptor?.authority || 'temporary_reference',
          authoritative: false,
          lineage: descriptor?.lineage || '',
          source_url: descriptor?.source_url || 'https://github.com/ramSeraph/opendata/releases',
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch {}
}

/**
 * Streams one tier of the reference hierarchy into `administrative_units`.
 *
 * Parent-child validation happens by *code* against identifiers already in
 * storage — the same join a verifier runs over the archive — so a row whose
 * parent is absent is rejected and counted rather than inserted loose.
 */
export async function ingestReferenceTier(
  tier: LgdAdministrativeTier,
  options: ReferenceIngestOptions = {}
): Promise<{ summary: LgdSyncTierSummary; context: ReferenceIngestContext }> {
  const startedAt = Date.now();
  const unitType = TIER_UNIT_TYPE[tier];
  const parentType = TIER_PARENT_TYPE[tier];
  const batchSize = Math.min(1000, Math.max(1, options.batchSize || DEFAULT_BATCH_SIZE));
  const concurrency = Math.min(8, Math.max(1, options.concurrency || (tier === 'villages' ? 4 : 1)));
  const maxRecords = options.maxRecordsPerTier;
  let provenance = buildProvenance(null);

  const summary: LgdSyncTierSummary = {
    tier,
    resource_id: '',
    total_available: 0,
    records_received: 0,
    records_inserted: 0,
    records_updated: 0,
    records_unchanged: 0,
    records_rejected: 0,
    orphan_records: 0,
    duration_ms: 0,
    status: 'completed',
    validation_errors: [],
  };

  let suppressedErrors = 0;
  const pushError = (entry: { code: string; message: string; data?: any }) => {
    if (summary.validation_errors.length < MAX_REPORTED_ERRORS) summary.validation_errors.push(entry);
    else suppressedErrors++;
  };

  const fail = (code: string, message: string) => {
    summary.status = 'failed';
    summary.duration_ms = Date.now() - startedAt;
    summary.validation_errors.push({ code, message });
    return { summary, context: { archive: null, provenance } };
  };

  if (!referenceMirrorVerified()) {
    return fail(
      'SOURCE_NOT_VERIFIED',
      'The temporary reference mirror is not recorded as independently verified. Set ' +
        'GEOGRAPHY_REFERENCE_MIRROR_VERIFIED=1 only after coverage, LGD codes, parent-child links, ' +
        'dataset date, lineage and licensing have each been checked. Nothing was ingested.'
    );
  }

  if (useDatabase() === false && !isTestEnvironment()) {
    return fail('NO_DATABASE', 'No database is configured, so reference geography cannot be ingested.');
  }

  await ensureReferenceSourceRegistered();

  let parentMap: Map<string, string> | null = null;
  if (parentType) {
    try {
      parentMap = await loadIdMap(parentType);
    } catch (err: any) {
      return fail('PARENT_INDEX_FAILED', err.message);
    }
  }

  let tierHadRows = 0;
  try {
    tierHadRows = await countTier(unitType);
  } catch (err: any) {
    return fail('TIER_COUNT_FAILED', err.message);
  }

  // If tier has existing rows that fit in a reasonable in-memory index, load them up-front
  // to avoid redundant round-trip queries per batch during streaming upsert.
  let existingMap: Map<string, ExistingRow> | null = null;
  if (tierHadRows > 0 && tierHadRows <= 100_000 && useDatabase()) {
    try {
      existingMap = new Map<string, ExistingRow>();
      const client = getSupabase();
      let from = 0;
      while (true) {
        const { data, error } = await client
          .from('administrative_units')
          .select('code,name,local_name,census_code,state_code,district_code,sub_district_code,parent_id,source_id')
          .eq('unit_type', unitType)
          .range(from, from + ID_PAGE_SIZE - 1);
        if (error || !data || data.length === 0) break;
        for (const row of data as Array<ExistingRow & { code: string }>) {
          existingMap.set(row.code, row);
        }
        if (data.length < ID_PAGE_SIZE) break;
        from += ID_PAGE_SIZE;
      }
    } catch {
      existingMap = null;
    }
  }

  let archive: ReferenceArchiveInfo | null = null;
  let tempDir: string | null = null;
  let headerIndex: ColumnIndex | null = null;
  let pending: PendingRow[] = [];
  const inFlightBatches = new Set<Promise<void>>();

  const processBatch = async (batch: PendingRow[]) => {
    if (batch.length === 0) return;
    const acquiredAt = new Date().toISOString();

    if (!useDatabase()) {
      // Test harness only: the in-memory store is the database of record here.
      for (const { record, parent_id } of batch) {
        registerAdministrativeUnit({
          parent_id,
          unit_type: record.unit_type,
          code: record.code,
          name: record.name,
          local_name: record.local_name ?? null,
          state_code: record.state_code ?? null,
          district_code: record.district_code ?? null,
          sub_district_code: record.sub_district_code ?? null,
          census_code: record.census_code ?? null,
          is_active: true,
          source_id: REFERENCE_SOURCE_ID,
          source_resource_id: record.source_resource_id,
          source_record_ref: `${archive?.member || 'fixture'}#${record.code}`,
          last_synced_at: acquiredAt,
          metadata: record.metadata || {},
        } as any);
      }
      summary.records_inserted += batch.length;
      return;
    }

    const client = getSupabase();
    const payload = batch.map(({ record, parent_id }) => ({
      parent_id,
      unit_type: record.unit_type,
      code: record.code,
      name: record.name,
      local_name: record.local_name ?? null,
      state_code: record.state_code ?? null,
      district_code: record.district_code ?? null,
      sub_district_code: record.sub_district_code ?? null,
      census_code: record.census_code ?? null,
      is_active: true,
      source_id: REFERENCE_SOURCE_ID,
      source_resource_id: record.source_resource_id,
      source_record_ref: `${archive?.member || 'fixture'}#${record.code}`,
      last_synced_at: acquiredAt,
      metadata: record.metadata || {},
    }));

    let lastError: any = null;
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        const { error } = await client
          .from('administrative_units')
          .upsert(payload, { onConflict: 'unit_type,code' });
        if (!error) {
          lastError = null;
          break;
        }
        lastError = error;
      } catch (err: any) {
        lastError = err;
      }
      if (attempt < 6) {
        await new Promise((r) => setTimeout(r, Math.min(5000, 500 * Math.pow(2, attempt - 1))));
      }
    }

    if (lastError) {
      summary.records_rejected += batch.length;
      pushError({
        code: 'UPSERT_FAILED',
        message: `Storage rejected a batch of ${batch.length} ${unitType} rows: ${lastError.message || String(lastError)}`,
      });
      return;
    }

    if (existingMap) {
      for (const { record } of batch) {
        const before = existingMap.get(record.code);
        if (!before) summary.records_inserted++;
        else if (
          before.name === record.name &&
          (before.local_name ?? null) === (record.local_name ?? null) &&
          (before.census_code ?? null) === (record.census_code ?? null) &&
          (before.state_code ?? null) === (record.state_code ?? null) &&
          (before.district_code ?? null) === (record.district_code ?? null) &&
          (before.sub_district_code ?? null) === (record.sub_district_code ?? null)
        ) {
          summary.records_unchanged++;
        } else {
          summary.records_updated++;
        }
      }
    } else {
      summary.records_inserted += batch.length;
    }

    if (options.onProgress) {
      options.onProgress({
        received: summary.records_received,
        inserted: summary.records_inserted,
        updated: summary.records_updated,
        rejected: summary.records_rejected,
      });
    }
  };

  const flushBatch = async () => {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];

    const promise: Promise<void> = processBatch(batch).finally(() => {
      inFlightBatches.delete(promise);
    });
    inFlightBatches.add(promise);

    if (inFlightBatches.size >= concurrency) {
      await Promise.race(inFlightBatches);
    }
  };

  const handleLine = async (line: string, lineNumber: number) => {
    if (!line.trim()) return;

    if (!headerIndex) {
      const header = splitCsvLine(line);
      const index = buildColumnIndex(header);
      const missing = index.missing(REQUIRED_COLUMNS[tier]);
      if (missing.length > 0) {
        throw new Error(
          `SCHEMA_CHECK_FAILED: tier "${tier}" is missing required column(s) ` +
            `${missing.map((c) => `"${c}"`).join(', ')}. The source published: ` +
            `${header.map((c) => `"${c}"`).join(', ')}. Nothing was ingested for this tier.`
        );
      }
      headerIndex = index;
      return;
    }

    if (maxRecords && summary.records_received >= maxRecords) return;

    const record = normalizeReferenceRow(tier, headerIndex, splitCsvLine(line), provenance);
    if (!record) {
      summary.records_rejected++;
      pushError({
        code: 'ROW_NORMALIZATION_FAILED',
        message: `Row ${lineNumber} of ${archive?.member || 'fixture'} has no LGD code or name.`,
      });
      return;
    }

    summary.records_received++;

    let parentId: string | null = null;
    if (parentType) {
      parentId = parentMap?.get(record.parent_code || '') ?? null;
      if (!parentId) {
        summary.orphan_records++;
        summary.records_rejected++;
        pushError({
          code: 'MISSING_PARENT_HIERARCHY',
          message:
            `Parent ${parentType} code "${record.parent_code}" is not in storage for ` +
            `${unitType} "${record.name}" (code ${record.code}). Row rejected.`,
        });
        return;
      }
    }

    pending.push({ record, parent_id: parentId });
    if (pending.length >= batchSize) {
      await flushBatch();
    }
  };

  try {
    if (options.referenceCsvLines) {
      summary.resource_id = 'deterministic-test-fixture';
      const lines = options.referenceCsvLines;
      for (let i = 0; i < lines.length; i++) {
        await handleLine(lines[i], i + 1);
        if (maxRecords && summary.records_received >= maxRecords) break;
      }
    } else {
      const manifestUrl = REFERENCE_MIRROR_ENDPOINTS.monthlyManifest;
      const entries = parseManifest(await fetchText(manifestUrl, MAX_MANIFEST_BYTES));
      const entry = selectArchive(entries, tier);
      const period = parseArchivePeriod(entry.name, TIER_COMPONENT[tier]);
      if (!period) throw new Error(`Could not read the dataset period from "${entry.name}".`);

      tempDir = await mkdtemp(join(tmpdir(), 'bhoomidarpan-lgd-'));
      const archivePath = join(tempDir, entry.name);
      await downloadArchive(entry, archivePath);

      const extractor = await findExtractor(archivePath);
      const listed = await runCapture(extractor.bin, extractor.list(archivePath), 120_000);
      if (!listed.ok) {
        throw new Error(`Could not list the archive contents: ${listed.stderr.trim().slice(0, 300)}`);
      }
      const members = listed.stdout
        .split(/\r?\n/)
        .map((m) => m.trim())
        .filter(Boolean);
      const member = selectMember(members, TIER_COMPONENT[tier]);
      const memberDate = parseMemberDate(member, TIER_COMPONENT[tier]);

      archive = {
        component: TIER_COMPONENT[tier],
        archive_name: entry.name,
        url: entry.url,
        size_bytes: entry.size,
        dataset_version: `${period.year}-${String(period.month).padStart(2, '0')}`,
        dataset_date: memberDate || `${period.year}-${String(period.month).padStart(2, '0')}`,
        member,
        manifest_url: manifestUrl,
        retrieved_at: new Date().toISOString(),
      };
      provenance = buildProvenance(archive);
      summary.resource_id = entry.name;

      const child = spawn(extractor.bin, extractor.extract(archivePath, member), { windowsHide: true });
      let spawnError: string | null = null;
      child.on('error', (err) => {
        spawnError = err.message;
      });
      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });

      let lineNumber = 0;
      try {
        for await (const line of readLines(child.stdout)) {
          lineNumber++;
          await handleLine(line, lineNumber);
          if (maxRecords && summary.records_received >= maxRecords) break;
        }
      } finally {
        try {
          child.kill();
        } catch {
          /* already exited */
        }
      }

      if (spawnError) throw new Error(`Extractor failed to start: ${spawnError}`);
      if (lineNumber === 0) {
        throw new Error(
          `Extractor produced no output for ${member}: ${stderr.trim().slice(0, 300) || 'unknown error'}`
        );
      }
    }

    if (pending.length > 0) {
      await flushBatch();
    }
    await Promise.all(inFlightBatches);
  } catch (err: any) {
    summary.status = summary.records_received > 0 ? 'partial' : 'failed';
    pushError({ code: 'REFERENCE_INGESTION_ERROR', message: err.message });
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }

  if (suppressedErrors > 0) {
    pushError({
      code: 'VALIDATION_ERRORS_TRUNCATED',
      message:
        `${suppressedErrors} further validation error(s) were counted but not listed ` +
        `(cap of ${MAX_REPORTED_ERRORS} reported entries).`,
    });
  }

  // Reconciliation: what the archive contained versus what actually landed.
  try {
    const observed = summary.records_received;
    const fromSource = await countTier(unitType, REFERENCE_SOURCE_ID);
    const total = await countTier(unitType);
    const missing = Math.max(0, observed - fromSource);
    const orphans = summary.orphan_records;

    summary.total_available = observed;
    summary.count_verification = {
      source_total: observed,
      rows_in_database: total,
      matched: summary.status === 'completed' && missing === 0,
      checked_at: new Date().toISOString(),
    };
    summary.completeness = {
      tier,
      unit_type: unitType,
      source_rows_observed: observed,
      // The manifest publishes names and byte sizes, never row counts, so the
      // only honest total is what was actually read out of the archive.
      source_total_kind: 'observed_rows',
      source_total_note:
        'The reference manifest publishes archive names and byte sizes but no machine-readable ' +
        'row total, so `source_rows_observed` counts rows read from the archive rather than a ' +
        'figure the source advertised. No published or reference expectation was substituted.',
      rows_in_database_total: total,
      rows_in_database_from_source: fromSource,
      rows_missing_from_database: missing,
      rows_from_other_sources: Math.max(0, total - fromSource),
      orphan_rows_rejected: orphans,
      parent_integrity:
        observed === 0 ? 'not_checked' : orphans === 0 ? 'verified' : 'failed',
      complete: summary.status === 'completed' && missing === 0,
      checked_at: new Date().toISOString(),
    };
    if (summary.status === 'completed' && missing > 0) summary.status = 'partial';
  } catch (err: any) {
    summary.completeness = {
      tier,
      unit_type: unitType,
      source_rows_observed: summary.records_received,
      source_total_kind: 'observed_rows',
      source_total_note: `Reconciliation could not be completed: ${err.message}`,
      rows_in_database_total: -1,
      rows_in_database_from_source: -1,
      rows_missing_from_database: -1,
      rows_from_other_sources: -1,
      orphan_rows_rejected: summary.orphan_records,
      parent_integrity:
        summary.records_received === 0 ? 'not_checked' : summary.orphan_records === 0 ? 'verified' : 'failed',
      complete: false,
      checked_at: new Date().toISOString(),
    };
    summary.status = 'partial';
  }

  summary.duration_ms = Date.now() - startedAt;
  return { summary, context: { archive, provenance } };
}
