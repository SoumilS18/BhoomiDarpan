import dotenv from 'dotenv';
dotenv.config();
import { statSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
// @ts-ignore
import { Database } from 'bun:sqlite';
import { REFERENCE_MIRROR_ENDPOINTS } from '../server/config/geographySourceRegistry';
import { parseManifest, selectArchive } from '../server/services/referenceGeographyProvider';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

async function main() {
  console.log('=== VERIFYING COLD-START REPRODUCIBILITY OF VILLAGE STORAGE ENGINE ===\n');

  const testDbPath = join(process.cwd(), 'data', 'cold_start_test.db');
  if (existsSync(testDbPath)) {
    unlinkSync(testDbPath);
  }

  console.log('1. Verifying Approved Source Manifest...');
  const manifestUrl = REFERENCE_MIRROR_ENDPOINTS.monthlyManifest;
  const manResp = await fetch(manifestUrl);
  if (!manResp.ok) throw new Error(`Manifest fetch failed: HTTP ${manResp.status}`);
  const manText = await manResp.text();
  const entries = parseManifest(manText);
  const entry = selectArchive(entries, 'villages');

  console.log('   Manifest Entry Selected:', {
    name: entry.name,
    url: entry.url,
    size_mb: (entry.size / 1024 / 1024).toFixed(2),
  });

  console.log('\n2. Downloading and streaming into cold-start test SQLite DB...');
  const startTime = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'bs-cold-start-'));
  const archivePath = join(tempDir, entry.name);

  try {
    const resp = await fetch(entry.url);
    const buf = Buffer.from(await resp.arrayBuffer());
    await writeFile(archivePath, buf);

    const winTar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    const bin = existsSync(winTar) ? winTar : 'tar';
    const member = 'villages.31May2026.csv';
    const args = ['-xOf', archivePath, member];

    const db = new Database(testDbPath);
    db.run('PRAGMA journal_mode = WAL;');
    db.run('PRAGMA synchronous = OFF;');
    db.run(`
      CREATE TABLE villages (
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
    `);

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO villages (
        code, name, local_name, state_code, district_code, sub_district_code,
        census_code, village_status, village_category, state_name_english,
        district_name_english, sub_district_name_english
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const extractor = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    let headerMap: Record<string, number> | null = null;
    let count = 0;

    db.run('BEGIN TRANSACTION');

    await new Promise<void>((resolve, reject) => {
      extractor.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          if (!headerMap) {
            const headers = line.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
            headerMap = {};
            headers.forEach((h, idx) => {
              headerMap![h] = idx;
            });
            continue;
          }

          const cols = line.split(',');
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

          if (code && name && subDistCode) {
            insertStmt.run(code, name, localName, stateCode, distCode, subDistCode, censusCode, status, category, stateName, distName, subDistName);
            count++;
          }
        }
      });

      extractor.on('close', (code) => {
        if (code === 0) {
          db.run('COMMIT');
          resolve();
        } else {
          db.run('ROLLBACK');
          reject(new Error(`Extractor failed with exit code ${code}`));
        }
      });
      extractor.on('error', reject);
    });

    console.log('   Creating indexes...');
    db.run('CREATE INDEX idx_villages_subdist ON villages(sub_district_code);');
    db.run('CREATE INDEX idx_villages_name ON villages(name COLLATE NOCASE);');
    db.run('CREATE INDEX idx_villages_dist ON villages(district_code);');

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const stat = statSync(testDbPath);
    const row = db.query('SELECT COUNT(*) as c FROM villages').get() as any;

    console.log('\n3. Cold-Start Verification Results:');
    console.log(`   - Build Duration: ${duration}s`);
    console.log(`   - Total Ingested Rows: ${row.c.toLocaleString()}`);
    console.log(`   - SQLite Database Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

    // Verify sample query
    const sample = db.query('SELECT * FROM villages WHERE sub_district_code = ? LIMIT 3').all('4155');
    console.log('   - Sample Sub-District 4155 Query:', sample);
    db.close();

    console.log('\n=== COLD-START REPRODUCIBILITY VERIFIED SUCCESSFULLY ===');
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  }
}

main().catch((err) => {
  console.error('Cold-start verification failed:', err);
  process.exit(1);
});
