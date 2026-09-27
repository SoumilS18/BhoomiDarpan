import dotenv from 'dotenv';
dotenv.config();
// @ts-ignore
import { Database } from 'bun:sqlite';
import { statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getSupabase } from '../server/config/supabase';

async function main() {
  console.log('=== OPTION B COMPREHENSIVE PRODUCTION AUDIT ===\n');

  // 1. SQLite Database Inspection
  const dbPath = join(process.cwd(), 'data', 'reference_geography', 'villages_reference.db');
  console.log('1. SQLite Village Store Inspection:');
  console.log('   Database Path:', dbPath);
  console.log('   Database Exists:', existsSync(dbPath));

  if (!existsSync(dbPath)) {
    throw new Error('SQLite database file does not exist at expected path!');
  }

  const stat = statSync(dbPath);
  console.log('   File Size:', (stat.size / (1024 * 1024)).toFixed(2), 'MB');

  const db = new Database(dbPath, { readonly: true });
  const total = db.query('SELECT COUNT(*) as c FROM villages').get() as any;
  const distinctCodes = db.query('SELECT COUNT(DISTINCT code) as c FROM villages').get() as any;
  const nullNames = db.query("SELECT COUNT(*) as c FROM villages WHERE name IS NULL OR name = ''").get() as any;
  const nullSubdistricts = db.query("SELECT COUNT(*) as c FROM villages WHERE sub_district_code IS NULL OR sub_district_code = ''").get() as any;
  const nullDistricts = db.query("SELECT COUNT(*) as c FROM villages WHERE district_code IS NULL OR district_code = ''").get() as any;
  const nullStates = db.query("SELECT COUNT(*) as c FROM villages WHERE state_code IS NULL OR state_code = ''").get() as any;
  const indexes = db.query("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index'").all() as any[];

  console.log('   Metrics:', {
    total_rows: total.c,
    distinct_codes: distinctCodes.c,
    null_names: nullNames.c,
    null_subdistricts: nullSubdistricts.c,
    null_districts: nullDistricts.c,
    null_states: nullStates.c,
    indexes: indexes.map((i) => i.name),
  });

  const planSub = db.query('EXPLAIN QUERY PLAN SELECT * FROM villages WHERE sub_district_code = ?').all('4155');
  const planCode = db.query('EXPLAIN QUERY PLAN SELECT * FROM villages WHERE code = ?').all('551290');
  const planName = db.query('EXPLAIN QUERY PLAN SELECT * FROM villages WHERE name LIKE ?').all('Kothrud%');

  console.log('\n   Query Plans:');
  console.log('   - Sub-District Lookup Plan:', planSub);
  console.log('   - Code Lookup Plan:', planCode);
  console.log('   - Name Search Plan:', planName);

  // 2. Supabase PostgreSQL Quota & Entity Audit
  console.log('\n2. Remote Supabase PostgreSQL State Audit:');
  const supabase = getSupabase();

  const [
    { count: stateCount },
    { count: districtCount },
    { count: subdistrictCount },
    { count: villageCountInPg },
    { count: caseCount },
    { count: projectCount },
    { count: workflowCount },
    { count: parcelCount },
  ] = await Promise.all([
    supabase.from('administrative_units').select('*', { count: 'exact', head: true }).eq('unit_type', 'state'),
    supabase.from('administrative_units').select('*', { count: 'exact', head: true }).eq('unit_type', 'district'),
    supabase.from('administrative_units').select('*', { count: 'exact', head: true }).eq('unit_type', 'sub_district'),
    supabase.from('administrative_units').select('*', { count: 'exact', head: true }).eq('unit_type', 'village'),
    supabase.from('acquisition_cases').select('*', { count: 'exact', head: true }),
    supabase.from('infrastructure_projects').select('*', { count: 'exact', head: true }),
    supabase.from('workflows').select('*', { count: 'exact', head: true }),
    supabase.from('parcels').select('*', { count: 'exact', head: true }),
  ]);

  console.log('   PostgreSQL Counts:', {
    states: stateCount,
    districts: districtCount,
    sub_districts: subdistrictCount,
    bulk_villages_in_pg: villageCountInPg,
    cases: caseCount,
    projects: projectCount,
    workflows: workflowCount,
    parcels: parcelCount,
  });

  // 3. Parent-Child Chain Integrity Verification (Dynamic sampling)
  console.log('\n3. Hierarchy Chain Consistency Check:');
  const { data: sampleState } = await supabase.from('administrative_units').select('code, name').eq('unit_type', 'state').limit(1).single();
  console.log('   Sample State:', sampleState);

  const { data: sampleDistrict } = await supabase.from('administrative_units').select('code, name, state_code').eq('unit_type', 'district').eq('state_code', sampleState?.code).limit(1).single();
  console.log('   Sample District:', sampleDistrict);

  const { data: sampleSubdistrict } = await supabase.from('administrative_units').select('code, name, district_code, state_code').eq('unit_type', 'sub_district').eq('district_code', sampleDistrict?.code).limit(1).single();
  console.log('   Sample Sub-District:', sampleSubdistrict);

  if (sampleSubdistrict) {
    const villagesInSample = db.query('SELECT code, name, local_name, state_code, district_code, sub_district_code FROM villages WHERE sub_district_code = ? LIMIT 5').all(sampleSubdistrict.code);
    console.log(`   Villages for Sub-District ${sampleSubdistrict.name} (${sampleSubdistrict.code}):`, villagesInSample);
  }

  console.log('\n=== AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
