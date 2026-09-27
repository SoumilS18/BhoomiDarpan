// @ts-ignore
import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { AdministrativeUnit } from '../../shared/types';
import { parseManifest, selectArchive } from './referenceGeographyProvider';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { REFERENCE_MIRROR_ENDPOINTS } from '../config/geographySourceRegistry';

const DATA_DIR = join(process.cwd(), 'data', 'reference_geography');
const DB_PATH = join(DATA_DIR, 'villages_reference.db');

let sqliteDb: any = null;
let isBuilding = false;

export function isVillageBuilding(): boolean {
  return isBuilding;
}

export function getVillageDatabase(options: { readonly?: boolean } = {}): any {
  if (!sqliteDb) {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    const dbExists = existsSync(DB_PATH);
    if (options.readonly && dbExists) {
      sqliteDb = new Database(DB_PATH, { readonly: true });
    } else {
      sqliteDb = new Database(DB_PATH);
      sqliteDb.run('PRAGMA journal_mode = WAL;');
      sqliteDb.run('PRAGMA synchronous = NORMAL;');
      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS villages (
          code TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          local_name TEXT,
          state_code TEXT NOT NULL,
          district_code TEXT NOT NULL,
          sub_district_code TEXT NOT NULL,
          census_code TEXT,
          village_status TEXT,
          village_category TEXT,
          state_name_english TEXT,
          district_name_english TEXT,
          sub_district_name_english TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_villages_subdist ON villages(sub_district_code);
        CREATE INDEX IF NOT EXISTS idx_villages_name ON villages(name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_villages_dist ON villages(district_code);
      `);
    }
  }
  return sqliteDb;
}

export function isVillageDatabasePopulated(): boolean {
  if (!existsSync(DB_PATH)) return false;
  try {
    const db = getVillageDatabase();
    const row = db.query('SELECT COUNT(*) as count FROM villages').get() as { count: number };
    return row.count > 500000;
  } catch {
    return false;
  }
}

export function getVillageCount(): number {
  try {
    const db = getVillageDatabase();
    const row = db.query('SELECT COUNT(*) as count FROM villages').get() as { count: number };
    return row.count;
  } catch {
    return 0;
  }
}

/**
 * Builds the compressed village storage engine from the verified 7z archive.
 */
export async function buildVillageDatabase(onProgress?: (processed: number, accepted: number) => void): Promise<{ total: number }> {
  if (isBuilding) {
    throw new Error('Village database build already in progress');
  }
  isBuilding = true;

  try {
    const db = getVillageDatabase();
    const manifestUrl = REFERENCE_MIRROR_ENDPOINTS.monthlyManifest;
    const manResp = await fetch(manifestUrl);
    if (!manResp.ok) throw new Error(`Failed to fetch manifest: HTTP ${manResp.status}`);
    const manText = await manResp.text();
    const entries = parseManifest(manText);
    const entry = selectArchive(entries, 'villages');
    const member = 'villages.31May2026.csv';
    const datasetVersion = '2026-05';
    const datasetDate = '2026-05-31';

    console.log(`[VillageStorageEngine] Downloading ${entry.name} (${(entry.size / 1024 / 1024).toFixed(2)} MB)...`);

    const tempDir = await mkdtemp(join(tmpdir(), 'bs-village-db-'));
    const archivePath = join(tempDir, entry.name);

    try {
      const resp = await fetch(entry.url);
      if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      await writeFile(archivePath, buf);

      console.log(`[VillageStorageEngine] Streaming and indexing ${member}...`);

      const winTar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
      const bin = existsSync(winTar) ? winTar : 'tar';
      const args = ['-xOf', archivePath, member];

      const extractor = spawn(bin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO villages (
          code, name, local_name, state_code, district_code, sub_district_code,
          census_code, village_status, village_category, state_name_english,
          district_name_english, sub_district_name_english
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `);

      let processed = 0;
      let buffer = '';
      let headerMap: Record<string, number> | null = null;

      db.run('BEGIN TRANSACTION');

      await new Promise<void>((resolve, reject) => {
        extractor.stdout.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            processed++;

            if (!headerMap) {
              const headers = parseCsvLine(line);
              headerMap = {};
              headers.forEach((h, idx) => {
                headerMap![h.trim().replace(/^"|"$/g, '')] = idx;
              });
              continue;
            }

            const cols = parseCsvLine(line);
            const getVal = (name: string) => {
              const idx = headerMap![name];
              return idx !== undefined && cols[idx] !== undefined ? cols[idx].trim().replace(/^"|"$/g, '') : '';
            };

            const code = getVal('Village Code') || getVal('village_code') || getVal('Code');
            const name = getVal('Village Name (In English)') || getVal('village_name') || getVal('Name');
            const localName = getVal('Village Name (In Local)') || getVal('local_name') || null;
            const stateCode = getVal('State Code') || getVal('state_code');
            const distCode = getVal('District Code') || getVal('district_code');
            const subDistCode = getVal('Sub-District Code') || getVal('subdistrict_code') || getVal('Sub District Code');
            const censusCode = getVal('Census 2011 Code') || getVal('census_code') || null;
            const status = getVal('Village Status') || null;
            const category = getVal('Village Category') || null;
            const stateName = getVal('State Name (In English)') || null;
            const distName = getVal('District Name (In English)') || null;
            const subDistName = getVal('Sub-District Name (In English)') || null;

            if (!code || !name || !subDistCode) continue;

            insertStmt.run(
              code,
              name,
              localName,
              stateCode,
              distCode,
              subDistCode,
              censusCode,
              status,
              category,
              stateName,
              distName,
              subDistName
            );

            if (processed % 10000 === 0) {
              db.run('COMMIT');
              db.run('BEGIN TRANSACTION');
              if (onProgress) onProgress(processed, processed);
            }
          }
        });

        extractor.stderr.on('data', (err: Buffer) => {
          console.warn('[VillageStorageEngine extractor stderr]:', err.toString());
        });

        extractor.on('close', (code) => {
          try {
            if (code === 0) {
              db.run('COMMIT');
              resolve();
            } else {
              try { db.run('ROLLBACK'); } catch {}
              reject(new Error(`Extractor exited with code ${code}`));
            }
          } catch (e: any) {
            reject(e);
          }
        });

        extractor.on('error', (err) => {
          try { db.run('ROLLBACK'); } catch {}
          reject(err);
        });
      });

      const total = getVillageCount();
      console.log(`[VillageStorageEngine] Successfully indexed ${total} villages into SQLite engine.`);
      return { total };
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  } finally {
    isBuilding = false;
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

export function queryVillagesBySubDistrict(
  subDistrictCode: string,
  search?: string,
  limit: number = 50,
  offset: number = 0
): { villages: AdministrativeUnit[]; total: number; page: number; limit: number; totalPages: number } {
  const db = getVillageDatabase();

  let countSql = `SELECT COUNT(*) as count FROM villages WHERE sub_district_code = ?`;
  let dataSql = `SELECT * FROM villages WHERE sub_district_code = ?`;
  const params: any[] = [subDistrictCode];

  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`;
    countSql += ` AND (name LIKE ? OR code LIKE ? OR local_name LIKE ?)`;
    dataSql += ` AND (name LIKE ? OR code LIKE ? OR local_name LIKE ?)`;
    params.push(term, term, term);
  }

  dataSql += ` ORDER BY name ASC LIMIT ? OFFSET ?`;
  const countRow = db.query(countSql).get(...params) as { count: number };
  const total = countRow ? countRow.count : 0;

  const dataRows = db.query(dataSql).all(...params, limit, offset) as any[];

  const villages: AdministrativeUnit[] = dataRows.map((r) => ({
    id: `lgd-village-${r.code}`,
    parent_id: null,
    unit_type: 'village',
    code: r.code,
    name: r.name,
    local_name: r.local_name,
    state_code: r.state_code,
    district_code: r.district_code,
    sub_district_code: r.sub_district_code,
    centroid: null,
    boundary_geojson: null,
    source_id: 'lgd_reference_mirror',
    metadata: {
      provenance: {
        source_id: 'lgd_reference_mirror',
        provider: 'LGD-derived reference mirror (temporary, non-authoritative)',
        dataset_version: '2026-05',
        dataset_date: '2026-05-31',
        authority: 'temporary_reference',
        temporary_reference: true,
        license: 'Government Open Data License – India (GODL-India)',
      },
      source_tier: 'villages',
      village_status: r.village_status,
      village_category: r.village_category,
      state_name_english: r.state_name_english,
      district_name_english: r.district_name_english,
      sub_district_name_english: r.sub_district_name_english,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    census_code: r.census_code,
    is_active: true,
    source_resource_id: '2026-05-31',
    source_record_ref: `villages.31May2026.csv#${r.code}`,
  }));

  const page = Math.floor(offset / limit) + 1;
  return {
    villages,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export function searchVillagesEngine(query: string, limit: number = 20): AdministrativeUnit[] {
  const db = getVillageDatabase();
  const term = `%${query.trim()}%`;
  const sql = `
    SELECT * FROM villages 
    WHERE name LIKE ? OR code LIKE ? OR local_name LIKE ?
    ORDER BY name ASC 
    LIMIT ?
  `;
  const dataRows = db.query(sql).all(term, term, term, limit) as any[];

  return dataRows.map((r) => ({
    id: `lgd-village-${r.code}`,
    parent_id: null,
    unit_type: 'village',
    code: r.code,
    name: r.name,
    local_name: r.local_name,
    state_code: r.state_code,
    district_code: r.district_code,
    sub_district_code: r.sub_district_code,
    centroid: null,
    boundary_geojson: null,
    source_id: 'lgd_reference_mirror',
    metadata: {
      provenance: {
        source_id: 'lgd_reference_mirror',
        provider: 'LGD-derived reference mirror (temporary, non-authoritative)',
        dataset_version: '2026-05',
        dataset_date: '2026-05-31',
        authority: 'temporary_reference',
        temporary_reference: true,
        license: 'Government Open Data License – India (GODL-India)',
      },
      source_tier: 'villages',
      village_status: r.village_status,
      village_category: r.village_category,
      state_name_english: r.state_name_english,
      district_name_english: r.district_name_english,
      sub_district_name_english: r.sub_district_name_english,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    census_code: r.census_code,
    is_active: true,
    source_resource_id: '2026-05-31',
    source_record_ref: `villages.31May2026.csv#${r.code}`,
  }));
}

export function getVillageByCodeEngine(code: string): AdministrativeUnit | null {
  try {
    const db = getVillageDatabase();
    const r = db.query('SELECT * FROM villages WHERE code = ? LIMIT 1').get(code) as any;
    if (!r) return null;

    return {
      id: `lgd-village-${r.code}`,
      parent_id: null,
      unit_type: 'village',
      code: r.code,
      name: r.name,
      local_name: r.local_name,
      state_code: r.state_code,
      district_code: r.district_code,
      sub_district_code: r.sub_district_code,
      centroid: null,
      boundary_geojson: null,
      source_id: 'lgd_reference_mirror',
      metadata: {
        provenance: {
          source_id: 'lgd_reference_mirror',
          provider: 'LGD-derived reference mirror (temporary, non-authoritative)',
          dataset_version: '2026-05',
          dataset_date: '2026-05-31',
          authority: 'temporary_reference',
          temporary_reference: true,
          license: 'Government Open Data License – India (GODL-India)',
        },
        source_tier: 'villages',
        village_status: r.village_status,
        village_category: r.village_category,
        state_name_english: r.state_name_english,
        district_name_english: r.district_name_english,
        sub_district_name_english: r.sub_district_name_english,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      census_code: r.census_code,
      is_active: true,
      source_resource_id: '2026-05-31',
      source_record_ref: `villages.31May2026.csv#${r.code}`,
    };
  } catch {
    return null;
  }
}

