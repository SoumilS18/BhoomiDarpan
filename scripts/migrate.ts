import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase', 'migrations');

// Canonical tables expected across Day 1 and Day 2 migrations
export const EXPECTED_TABLES = [
  'user_profiles',
  'projects',
  'workflows',
  'workflow_stages',
  'stage_dependencies',
  'acquisition_cases',
  'case_stage_instances',
  'parcels',
  'documents',
  'document_extractions',
  'case_events',
  'risk_assessments',
  'recommendations',
  'scenarios',
  'case_bottlenecks',
  'system_policies',
  'case_notifications',
  'data_sources',
  'data_provenance',
  'administrative_units',
  'data_import_batches',
  'external_observations',
  'data_discrepancies',
];

export function getMigrationFiles(): { filename: string; fullPath: string; sequence: number }[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found at: ${MIGRATIONS_DIR}`);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort() // Sequential numeric sorting: 20260920000001 < 000002 < ...
    .map((filename, idx) => ({
      filename,
      fullPath: path.join(MIGRATIONS_DIR, filename),
      sequence: idx + 1,
    }));

  return files;
}

export async function verifySchemaViaSupabaseClient(): Promise<{
  allPresent: boolean;
  tableStatus: Record<string, boolean>;
  missingTables: string[];
}> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-supabase-project')) {
    return {
      allPresent: false,
      tableStatus: Object.fromEntries(EXPECTED_TABLES.map((t) => [t, false])),
      missingTables: EXPECTED_TABLES,
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const tableStatus: Record<string, boolean> = {};
  const missingTables: string[] = [];

  for (const table of EXPECTED_TABLES) {
    try {
      const { error } = await supabase.from(table).select('*').limit(1);
      if (
        error &&
        (error.code === '42P01' ||
          error.code === 'PGRST205' ||
          error.message.includes('does not exist') ||
          error.message.includes('in the schema cache'))
      ) {
        tableStatus[table] = false;
        missingTables.push(table);
      } else if (error) {
        tableStatus[table] = false;
        missingTables.push(table);
      } else {
        tableStatus[table] = true;
      }
    } catch {
      tableStatus[table] = false;
      missingTables.push(table);
    }
  }

  return {
    allPresent: missingTables.length === 0,
    tableStatus,
    missingTables,
  };
}

export async function executeMigrationsViaPg(connectionString: string): Promise<{ success: boolean; applied: string[]; error?: string }> {
  const { Client } = await import('pg');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  const applied: string[] = [];

  try {
    await client.connect();
    console.log('Connected to PostgreSQL endpoint successfully.');

    // Ensure migration history table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _bhoomidarpan_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const { rows: appliedRows } = await client.query('SELECT filename FROM _bhoomidarpan_migrations;');
    const alreadyApplied = new Set(appliedRows.map((r: any) => r.filename));

    const files = getMigrationFiles();

    for (const file of files) {
      if (alreadyApplied.has(file.filename)) {
        console.log(`  ⏩ Skipping already applied: ${file.filename}`);
        continue;
      }

      console.log(`  ⏳ Applying [${file.sequence}]: ${file.filename}...`);
      const sql = fs.readFileSync(file.fullPath, 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _bhoomidarpan_migrations (filename) VALUES ($1);', [file.filename]);
        await client.query('COMMIT');
        applied.push(file.filename);
        console.log(`  ✅ Successfully applied: ${file.filename}`);
      } catch (sqlErr: any) {
        await client.query('ROLLBACK');
        console.error(`  ❌ Failed applying ${file.filename}:`, sqlErr.message);
        return { success: false, applied, error: `${file.filename}: ${sqlErr.message}` };
      }
    }

    return { success: true, applied };
  } catch (connErr: any) {
    return { success: false, applied, error: `Connection failed: ${connErr.message}` };
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  console.log('===========================================================');
  console.log('  BhoomiDarpan Canonical Database Migration & Schema Tool');
  console.log('===========================================================\n');

  const files = getMigrationFiles();
  console.log(`Found ${files.length} canonical numbered migrations in sequence:`);
  files.forEach((f) => {
    console.log(`  [${f.sequence}] ${f.filename}`);
  });

  const isVerifyOnly = process.argv.includes('--verify');
  const isApply = process.argv.includes('--apply');

  if (isApply) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl || dbUrl.includes('your-database-url')) {
      console.error('\n❌ ERROR: DATABASE_URL is not configured in .env.');
      console.error('Please configure DATABASE_URL in .env to apply migrations automatically.');
      process.exit(1);
    }
    console.log('\nApplying canonical migrations via PostgreSQL...');
    const res = await executeMigrationsViaPg(dbUrl);
    if (!res.success) {
      console.error(`\n❌ Migration failed: ${res.error}`);
      process.exit(1);
    }
    console.log(`\n🎉 Applied ${res.applied.length} new migrations successfully.`);
  }

  if (isVerifyOnly || isApply) {
    console.log('\nVerifying remote schema status against configured Supabase endpoint...');
    const result = await verifySchemaViaSupabaseClient();
    console.log(`\nTable Existence Audit (${EXPECTED_TABLES.length} tables total):`);
    for (const [table, exists] of Object.entries(result.tableStatus)) {
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);
    }

    if (result.allPresent) {
      console.log('\n🎉 ALL 23 canonical database tables verified successfully in remote database!');
      process.exit(0);
    } else {
      console.log(`\n⚠️  ${result.missingTables.length} tables not found or pending migration:`);
      console.log(`   ${result.missingTables.join(', ')}`);
      if (isVerifyOnly) process.exit(1);
    }
  }

  if (!isApply && !isVerifyOnly) {
    console.log('\nTo apply migrations:');
    console.log('1. If DATABASE_URL is configured in .env: "bun run scripts/migrate.ts --apply"');
    console.log('2. Or run via Supabase CLI: "bun x supabase db push"');
    console.log('3. Run verification anytime: "bun run scripts/migrate.ts --verify"\n');
  }
}

if (import.meta.main || process.argv[1]?.includes('migrate')) {
  main().catch((err) => {
    console.error('Migration runner error:', err);
    process.exit(1);
  });
}
