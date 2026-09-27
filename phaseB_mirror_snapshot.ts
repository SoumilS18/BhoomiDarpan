/**
 * Phase B — READ-ONLY live snapshot verification of the temporary LGD
 * reference mirror (ramseraph.github.io/opendata), complementing the offline
 * coverage in tests/referenceManifest.test.ts.
 *
 * What it does:
 *   1. Fetches the published manifest and selects the newest archive per tier
 *      through the SAME exported helpers the ingestion path uses
 *      (parseManifest / selectArchive / parseArchivePeriod).
 *   2. For every tier whose archive fits the size cap, downloads it into a
 *      transient temp directory, lists members, picks the newest dated member
 *      (selectMember / parseMemberDate), streams the CSV and checks row
 *      floors, duplicate codes and parent→child referential integrity using
 *      normalizeReferenceRow — exactly the bytes ingestion would read.
 *   3. Deletes its temp directory and prints one final verdict line.
 *
 * It NEVER writes to the database, NEVER prints credentials. Every row it
 * describes is `lgd_reference_mirror` / `temporary_reference` — a stand-in
 * for official LGD, NOT authoritative. The official source remains
 * `requires_credentials` (403 "Key not authorised" last confirmed; gateway
 * timeouts/502 observed during this session).
 *
 * Exit code: 0 = PASS, 1 = FAIL. Final line:
 *   PHASE B MIRROR SNAPSHOT VERDICT: ...
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  parseManifest,
  parseArchivePeriod,
  selectArchive,
  selectMember,
  parseMemberDate,
  splitCsvLine,
  buildColumnIndex,
  normalizeReferenceRow,
} from './server/services/referenceGeographyProvider';
import type { ManifestEntry } from './server/services/referenceGeographyProvider';
import type { LgdAdministrativeTier } from './server/config/lgdConfig';
import type { RowProvenance } from './server/services/geographyProviderContract';
import {
  REFERENCE_MIRROR_ENDPOINTS,
  getActiveGeographySource,
  referenceMirrorVerified,
} from './server/config/geographySourceRegistry';

const TIERS: LgdAdministrativeTier[] = ['states', 'districts', 'subDistricts', 'villages'];

const COMPONENT: Record<LgdAdministrativeTier, string> = {
  states: 'states',
  districts: 'districts',
  subDistricts: 'subdistricts',
  villages: 'villages',
};

/** Which tier's codes each tier's parent_code must resolve against. */
const PARENT_TIER: Record<LgdAdministrativeTier, LgdAdministrativeTier | null> = {
  states: null,
  districts: 'states',
  subDistricts: 'districts',
  villages: 'subDistricts',
};

/**
 * Sanity FLOORS, not fixtures: real LGD-scale counts (28 states + 8 UTs,
 * ~790 districts, ~6k sub-districts, ~6.6 lakh villages). They catch an empty
 * or truncated archive without pretending to predict the source's exact total.
 */
const MIN_ROWS: Record<LgdAdministrativeTier, number> = {
  states: 36,
  districts: 700,
  subDistricts: 4000,
  villages: 400_000,
};

/** Per-archive cap for this verification run (bounded time, disk and RAM). */
const MAX_VERIFY_BYTES = 32 * 1024 * 1024;
const MANIFEST_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const LIST_TIMEOUT_MS = 60_000;
const EXTRACT_TIMEOUT_MS = 120_000;
const EXTRACT_MAX_BUFFER = 512 * 1024 * 1024;

const failures: string[] = [];
const notes: string[] = [];

const log = (line = '') => console.log(line);

function check(ok: boolean, label: string, detail = ''): void {
  log(`  ${ok ? 'PASS' : 'FAIL'} | ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
}

function note(text: string): void {
  notes.push(text);
  log(`  NOTE | ${text}`);
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

interface Extractor {
  bin: string;
  is7z: boolean;
}

/** Mirrors candidateExtractors()/extractorFor() in referenceGeographyProvider. */
function candidateExtractors(): Extractor[] {
  const winTar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  const names =
    process.platform === 'win32'
      ? [winTar, 'tar.exe', 'bsdtar', 'tar', '7z', '7za']
      : ['bsdtar', 'tar', '7z', '7za'];
  return names.map((bin) => ({ bin, is7z: /7z/i.test(basename(bin)) }));
}

const listArgs = (e: Extractor, archive: string): string[] =>
  e.is7z ? ['l', '-ba', archive] : ['-tf', archive];

const extractArgs = (e: Extractor, archive: string, member: string): string[] =>
  e.is7z ? ['x', '-so', archive, member] : ['-xOf', archive, member];


interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error: Error | null;
}

function run(bin: string, args: string[], timeoutMs: number, maxBuffer: number): RunResult {
  const res = spawnSync(bin, args, {
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer,
    encoding: 'utf8',
  });
  return {
    status: res.status,
    stdout: typeof res.stdout === 'string' ? res.stdout : '',
    stderr: typeof res.stderr === 'string' ? res.stderr : '',
    error: res.error ?? null,
  };
}

function findExtractor(archive: string): Extractor | null {
  for (const e of candidateExtractors()) {
    const probe = run(e.bin, listArgs(e, archive), LIST_TIMEOUT_MS, 8 * 1024 * 1024);
    if (probe.status === 0 && !probe.error) return e;
  }
  return null;
}

async function download(entry: ManifestEntry, dest: string): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(entry.url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} while downloading ${entry.name}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_VERIFY_BYTES) {
      throw new Error(`${entry.name} arrived at ${buf.byteLength} bytes; over the cap`);
    }
    writeFileSync(dest, buf);
    return buf.byteLength;
  } finally {
    clearTimeout(timer);
  }
}

function report(): number {
  log('');
  log('4. Observations:');
  if (notes.length === 0) log('  (none)');
  for (const n of notes) log(`  - ${n}`);
  log('');
  if (failures.length === 0) {
    log('PHASE B MIRROR SNAPSHOT VERDICT: PASS');
    log(
      'Provenance: every row described here is lgd_reference_mirror / temporary_reference ' +
        '— NOT authoritative LGD. Official LGD (lgd_india) remains requires_credentials.'
    );
    return 0;
  }
  log(`PHASE B MIRROR SNAPSHOT VERDICT: FAIL (${failures.length} problem${failures.length === 1 ? '' : 's'})`);
  for (const f of failures) log(`  - ${f}`);
  return 1;
}

async function main(): Promise<number> {
  log('================================================================');
  log('Phase B — READ-ONLY snapshot verification of the temporary LGD');
  log('reference mirror (no database writes, no credentials printed)');
  log('================================================================');
  const source = getActiveGeographySource();
  log(`Active source: ${source.id} — ${source.label}`);
  log(`Authority: ${source.authority} | availability: ${source.availability}`);
  log(`Mirror verified flag (GEOGRAPHY_REFERENCE_MIRROR_VERIFIED): ${referenceMirrorVerified()}`);
  log('Official LGD (lgd_india): requires_credentials — 403 "Key not authorised"');
  log('last confirmed; api.data.gov.in gateway timed out / 502 this session.');
  log('');

  // ---- 1. Manifest -------------------------------------------------------
  const manifestUrl = REFERENCE_MIRROR_ENDPOINTS.monthlyManifest;
  log(`1. Manifest: ${manifestUrl}`);
  let entries: ManifestEntry[];
  try {
    const text = await fetchText(manifestUrl, MANIFEST_TIMEOUT_MS);
    entries = parseManifest(text);
    check(entries.length >= 1000, 'manifest fetch + parse', `${entries.length} archive entries`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    check(false, 'manifest fetch + parse', message);
    return report();
  }

  // ---- 2. Newest archive per tier ---------------------------------------
  log('2. Newest archive per tier (same selection logic as ingestion):');
  const chosen = new Map<LgdAdministrativeTier, ManifestEntry>();
  for (const tier of TIERS) {
    try {
      const entry = selectArchive(entries, tier);
      const period = parseArchivePeriod(entry.name, COMPONENT[tier]);
      chosen.set(tier, entry);
      const isolated = entry.name.startsWith(`${COMPONENT[tier]}.`);
      const periodText = period
        ? `${period.year}-${String(period.month).padStart(2, '0')}`
        : 'no period';
      check(
        isolated && period !== null,
        `select ${tier}`,
        `${entry.name} (${(entry.size / 1048576).toFixed(1)} MB, ${periodText})`
      );
    } catch (err) {
      check(false, `select ${tier}`, err instanceof Error ? err.message : String(err));
    }
  }

  // ---- 3. Read-only archive verification --------------------------------
  log('3. Archive verification (read-only; 32 MB per-archive cap):');
  const codesByTier = new Map<LgdAdministrativeTier, Set<string>>();
  const workDir = mkdtempSync(join(tmpdir(), 'phaseB_snapshot-'));
  try {
    for (const tier of TIERS) {
      const entry = chosen.get(tier);
      if (!entry) {
        note(`${tier}: no archive selected — deeper checks SKIPPED for this tier`);
        continue;
      }
      if (entry.size > MAX_VERIFY_BYTES) {
        note(
          `${tier}: ${entry.name} is ${(entry.size / 1048576).toFixed(1)} MB (> ` +
            `${MAX_VERIFY_BYTES / 1048576} MB cap) — not downloaded; row/parent checks SKIPPED`
        );
        continue;
      }

      log(`  -- ${tier}: downloading ${entry.name}...`);
      const dest = join(workDir, basename(entry.name));
      let bytes: number;
      try {
        bytes = await download(entry, dest);
      } catch (err) {
        check(false, `${tier} download`, err instanceof Error ? err.message : String(err));
        continue;
      }

      const extractor = findExtractor(dest);
      if (!extractor) {
        check(false, `${tier} extractor`, 'EXTRACTOR_UNAVAILABLE — no installed tool can read .7z');
        continue;
      }

      const listed = run(extractor.bin, listArgs(extractor, dest), LIST_TIMEOUT_MS, 8 * 1024 * 1024);
      if (listed.error || listed.status !== 0) {
        const detail = listed.error
          ? listed.error.message
          : listed.stderr.slice(0, 200) || `exit ${listed.status}`;
        check(false, `${tier} list members`, detail);
        continue;
      }
      const members = listed.stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      let member: string;
      try {
        member = selectMember(members, COMPONENT[tier]);
      } catch (err) {
        check(false, `${tier} select member`, err instanceof Error ? err.message : String(err));
        continue;
      }
      const datasetDate = parseMemberDate(member, COMPONENT[tier]);

      const extracted = run(
        extractor.bin,
        extractArgs(extractor, dest, member),
        EXTRACT_TIMEOUT_MS,
        EXTRACT_MAX_BUFFER
      );
      if (extracted.error || extracted.status !== 0) {
        const detail = extracted.error
          ? extracted.error.message
          : extracted.stderr.slice(0, 200) || `exit ${extracted.status}`;
        check(false, `${tier} extract member`, detail);
        continue;
      }

      const lines = extracted.stdout.split(/\r?\n/);
      const headerIdx = lines.findIndex((l) => l.trim().length > 0);
      if (headerIdx < 0) {
        check(false, `${tier} csv parse`, `${member} is empty`);
        continue;
      }
      const header = buildColumnIndex(splitCsvLine(lines[headerIdx]));
      const provenance: RowProvenance = {
        source_id: 'lgd_reference_mirror',
        provider: source.label,
        dataset: 'Local Government Directory administrative hierarchy (reference extraction)',
        dataset_version: datasetDate,
        acquired_at: new Date().toISOString(),
        source_url: entry.url,
        authority: 'temporary_reference',
        temporary_reference: true,
        license: 'Government Open Data License – India (GODL-India)',
      };

      const codes = new Set<string>();
      const parentRefs: string[] = [];
      const parentTier = PARENT_TIER[tier];
      let rows = 0;
      let rejected = 0;
      let duplicates = 0;
      for (let i = headerIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().length === 0) continue;
        const rec = normalizeReferenceRow(tier, header, splitCsvLine(line), provenance);
        if (!rec) {
          rejected += 1;
          continue;
        }
        rows += 1;
        if (codes.has(rec.code)) duplicates += 1;
        else codes.add(rec.code);
        if (parentTier) parentRefs.push(rec.parent_code ?? '');
      }
      codesByTier.set(tier, codes);

      log(
        `    member=${member} dataset_date=${datasetDate ?? 'unknown'} ` +
          `bytes=${bytes} rejected=${rejected}`
      );
      check(rows >= MIN_ROWS[tier], `${tier} row floor`, `${rows} rows (floor ${MIN_ROWS[tier]})`);
      check(duplicates === 0, `${tier} unique codes`, `${duplicates} duplicate codes`);

      if (parentTier) {
        const parentCodes = codesByTier.get(parentTier);
        if (!parentCodes) {
          note(`${tier}: parent tier ${parentTier} not verified — parent check SKIPPED`);
        } else {
          let orphans = 0;
          for (const pc of parentRefs) {
            if (pc.length === 0 || !parentCodes.has(pc)) orphans += 1;
          }
          check(
            orphans === 0,
            `${tier} parents resolve to ${parentTier}`,
            `${orphans} orphans of ${parentRefs.length} rows`
          );
        }
      }
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  return report();
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
