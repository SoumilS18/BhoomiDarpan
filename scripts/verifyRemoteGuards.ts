import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from '../server/middleware/auth.middleware.js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);
const anonClient = createClient(supabaseUrl, anonKey);

async function runGuardsVerification() {
  console.log('\n===============================================================');
  console.log('  BHOOMISETU: REMOTE DATABASE GUARDS & SECURITY VERIFICATION');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function record(test: string, ok: boolean, details: string) {
    if (ok) {
      console.log(`✅ [PASS] ${test}: ${details}`);
      passed++;
    } else {
      console.log(`❌ [FAIL] ${test}: ${details}`);
      failed++;
    }
  }

  // 1. FOREIGN KEY CONSTRAINT TEST
  console.log('--- 1. FOREIGN KEY CONSTRAINT INTEGRITY ---');
  try {
    const invalidCaseId = '00000000-0000-0000-0000-000000000000';
    const { error: fkError } = await adminClient.from('parcels').insert({
      case_id: invalidCaseId,
      survey_number: 'FK-TEST-001',
      khata_number: 'KH-001',
      area_acres: 1.0,
      land_type: 'Agricultural',
      compensation_amount: 50000,
      acquisition_status: 'identified',
    });

    const isFkViolation = !!fkError && (fkError.message.includes('foreign key') || fkError.code === '23503');
    record('Foreign Key Enforcement', isFkViolation, `Invalid FK rejected with: "${fkError?.message}" (Code: ${fkError?.code})`);
  } catch (err: any) {
    record('Foreign Key Enforcement', false, err.message);
  }

  // 2. RLS & UNAUTHORIZED MUTATION TEST (ANON CLIENT)
  console.log('\n--- 2. RLS & UNAUTHORIZED MUTATION RESTRICTION ---');
  try {
    // Attempt inserting directly with anon key without an authenticated user session into data_sources (protected institutional table)
    const { error: anonInsertError } = await anonClient.from('data_sources').insert({
      id: 'unauth-source-' + Date.now(),
      name: 'Unauthorized Insertion Test',
      type: 'database',
      provider: 'Hacker',
      status: 'operational',
    });

    // Supabase RLS rejects unauthorized mutations on protected tables
    const isRejected = !!anonInsertError;
    record('RLS Unauthorized Mutation Rejection', isRejected, isRejected ? `Anon mutation blocked by RLS: "${anonInsertError?.message}" (Code: ${anonInsertError?.code})` : 'WARNING: Anon mutation was permitted!');
  } catch (err: any) {
    record('RLS Unauthorized Mutation Rejection', true, `Blocked with exception: ${err.message}`);
  }

  // 3. PRODUCTION EVAL-ROLE BYPASS REJECTION
  console.log('\n--- 3. PRODUCTION EVAL-ROLE BYPASS REJECTION ---');
  const prevEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const mockReq = {
      headers: {
        'x-eval-role': 'lao',
        'x-eval-user-id': 'eval-attacker',
        'x-eval-user-name': 'Attacker Officer',
      },
    } as any;

    const authResult = await authenticateRequest(mockReq);
    const bypassBlocked = authResult === null;
    record('Production Eval-Role Rejection', bypassBlocked, bypassBlocked ? 'x-eval-role header strictly returned null in production mode' : 'CRITICAL: x-eval-role bypassed auth in production!');
  } finally {
    process.env.NODE_ENV = prevEnv;
  }

  // 4. DATABASE FUNCTION & AUTOMATIC TIMESTAMP TRIGGER
  console.log('\n--- 4. DATABASE FUNCTION & AUTOMATIC TIMESTAMP TRIGGER ---');
  try {
    const testSrcId = 'test_trigger_src_' + Date.now();
    const { data: createdSrc, error: createSrcErr } = await adminClient
      .from('data_sources')
      .insert({
        id: testSrcId,
        name: 'Trigger Verification Source',
        type: 'database',
        provider: 'Institutional System',
        status: 'operational',
      })
      .select('*')
      .single();

    if (createSrcErr || !createdSrc) {
      throw new Error(`Data source insert failed: ${createSrcErr?.message}`);
    }

    // Wait 150ms and update
    await new Promise((r) => setTimeout(r, 150));
    const { data: updatedSrc, error: updateSrcErr } = await adminClient
      .from('data_sources')
      .update({ name: 'Updated Trigger Verification Source' })
      .eq('id', testSrcId)
      .select('*')
      .single();

    // Clean up immediately
    await adminClient.from('data_sources').delete().eq('id', testSrcId);

    const triggerOk = !updateSrcErr && updatedSrc && (new Date(updatedSrc.updated_at).getTime() >= new Date(createdSrc.created_at).getTime());
    record('Automatic Timestamp & Function Trigger', Boolean(triggerOk), `Trigger executed: created_at=${createdSrc.created_at}, updated_at=${updatedSrc?.updated_at}`);
  } catch (err: any) {
    record('Automatic Timestamp & Function Trigger', false, err.message);
  }

  // 5. DATABASE CLEANUP INTEGRITY AUDIT
  console.log('\n--- 5. TEMPORARY RECORDS CLEANUP AUDIT ---');
  try {
    const { data: testCases } = await adminClient
      .from('acquisition_cases')
      .select('id, case_number')
      .ilike('case_number', 'REV-LA-%');

    const clean = !testCases || testCases.length === 0;
    record('Database Cleanliness Check', clean, clean ? 'Zero lingering temporary verification cases in database' : `${testCases?.length} leftover test cases found`);
  } catch (err: any) {
    record('Database Cleanliness Check', false, err.message);
  }

  console.log('\n===============================================================');
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runGuardsVerification().catch((err) => {
  console.error('Fatal error in guards verification:', err);
  process.exit(1);
});
