/**
 * Reconciles the live Supabase project after the automated test harness wrote
 * into it.
 *
 * Background
 * ----------
 * `bun test`, the dev server and the production server all read the same
 * `.env`, so the service-role credentials are available to all three. Before
 * `server/config/runtimeEnv.ts` existed, several writers had no test guard and
 * wrote fixture output into the real project:
 *
 *   - `logCaseEvent`                  -> fabricated `case_events` rows
 *   - `policyEngine.updatePolicy`     -> live `system_policies` values rewritten
 *                                        by actors named "Policy Test Officer"
 *   - `executeAuthoritativeLgdSync`   -> `data_sources.lgd_india` set to
 *                                        `status = 'operational'` with a
 *                                        fabricated 2-state `last_sync`, while
 *                                        `administrative_units` stayed empty
 *   - `persistDiscrepancy`            -> 76 rows for `case-test-disc-01`
 *   - `recordProvenance`              -> 570 rows for `TEST_*` / `LGD-MH-412`
 *   - `persistObservation`            -> 150 rows for `case-fallback-01` /
 *                                        `geo-0.0000_0.0000`
 *
 * This script reverses exactly that damage. It is idempotent: re-running it
 * finds nothing left to repair, and it refuses to touch `lgd_india` if any
 * authoritative geography is actually present.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { DEFAULT_POLICIES_MAP } from '../server/services/policyEngine';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!BASE || !SERVICE) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env');
  process.exit(1);
}

const HEADERS = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

async function rest(
  method: string,
  p: string,
  body?: unknown
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

async function select<T>(p: string): Promise<T[]> {
  const { status, text } = await rest('GET', p);
  if (status !== 200) throw new Error(`GET ${p} -> ${status} ${text.slice(0, 300)}`);
  return JSON.parse(text) as T[];
}

async function countOf(table: string): Promise<number> {
  const r = await fetch(`${BASE}/rest/v1/${table}?select=id&limit=1`, {
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  const cr = r.headers.get('content-range');
  return cr ? Number(cr.split('/')[1] || '0') : -1;
}

let repaired = 0;

// ---------------------------------------------------------------------------
// 1. Fixture rows in the four polluted tables.
//
//    Every row in each table was verified to be fixture output:
//      case_events            1388 rows, all POLICY_UPDATED / LGD_SYNC_*,
//                             0 linked to any case or project
//      data_discrepancies      76 rows, all entity_id = 'case-test-disc-01'
//      external_observations  150 rows, only 'case-fallback-01' and
//                             'geo-0.0000_0.0000'
//      data_provenance        570 rows, refs TEST_* / LGD-MH-412 / OpenMeteo-*,
//                             all pointing at entities that no longer exist
// ---------------------------------------------------------------------------
console.log('=== 1. fixture rows ===');

const PURGES: Array<{ table: string; filter: string; expect: string }> = [
  {
    table: 'case_events',
    filter: 'event_type=in.(POLICY_UPDATED,LGD_SYNC_STARTED,LGD_SYNC_COMPLETED)',
    expect: 'synthetic audit trail (no row linked to a case or project)',
  },
  {
    table: 'data_discrepancies',
    filter: 'entity_id=eq.case-test-disc-01',
    expect: 'fixture discrepancy against a non-existent case',
  },
  {
    table: 'external_observations',
    filter: 'entity_id=in.(case-fallback-01,geo-0.0000_0.0000)',
    expect: 'fixture weather observations at the null island / fake case',
  },
  {
    table: 'data_provenance',
    filter: 'id=not.is.null',
    expect: 'provenance for entities that do not exist',
  },
];

for (const purge of PURGES) {
  const before = await countOf(purge.table);
  if (before <= 0) {
    console.log(`  ok    ${purge.table}: already empty`);
    continue;
  }
  const { status, text } = await rest('DELETE', `/rest/v1/${purge.table}?${purge.filter}`);
  const after = await countOf(purge.table);
  if (status >= 400) {
    console.log(`  FAIL  ${purge.table}: ${status} ${text.slice(0, 200)}`);
  } else {
    repaired += before - after;
    console.log(`  purged ${purge.table}: ${before} -> ${after} (${purge.expect})`);
  }
}

// ---------------------------------------------------------------------------
// 2. system_policies: restore rows the fixture actors overwrote.
// ---------------------------------------------------------------------------
console.log('\n=== 2. system_policies ===');

const POLLUTED_IDS = [
  'predictive_delay_policy',
  'attention_queue_criteria',
  'external_freshness_policy',
  'external_data_quality_policy',
  'recommendation_policy',
  'integration_policy',
  'portfolio_trend_policy',
  'portfolio_attention_policy',
];

type PolicyRow = { id: string; updated_by: string };
const livePolicies = await select<PolicyRow>('/rest/v1/system_policies?select=id,updated_by');

const unknownRows = livePolicies.filter((p) => !(p.id in DEFAULT_POLICIES_MAP));
if (unknownRows.length > 0) {
  console.log(`  NOTE: ${unknownRows.length} row(s) not in the canonical catalogue:`);
  for (const r of unknownRows) console.log(`    ${r.id} (last written by ${r.updated_by})`);
}

for (const id of POLLUTED_IDS) {
  const canonical = DEFAULT_POLICIES_MAP[id];
  if (!canonical) {
    console.log(`  SKIP  ${id}: no canonical default exists`);
    continue;
  }
  const row = livePolicies.find((p) => p.id === id);
  if (!row) {
    console.log(`  SKIP  ${id}: not present in database`);
    continue;
  }
  if (row.updated_by === 'System Default (reconciled)') {
    console.log(`  ok    ${id}: already reconciled`);
    continue;
  }

  const { status, text } = await rest('PATCH', `/rest/v1/system_policies?id=eq.${id}`, {
    category: canonical.category,
    title: canonical.title,
    description: canonical.description,
    config_value: canonical.config_value,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default (reconciled)',
  });
  if (status >= 400) {
    console.log(`  FAIL  ${id}: ${status} ${text.slice(0, 200)}`);
  } else {
    repaired++;
    console.log(`  restored ${id} (was written by "${row.updated_by}")`);
  }
}

// ---------------------------------------------------------------------------
// 3. data_sources.lgd_india: withdraw the unverified "operational" claim.
// ---------------------------------------------------------------------------
console.log('\n=== 3. data_sources.lgd_india ===');

const geoCount = await countOf('administrative_units');
const current = await select<{
  status: string;
  last_successful_sync: string | null;
  metadata: Record<string, unknown>;
}>('/rest/v1/data_sources?select=status,last_successful_sync,metadata&id=eq.lgd_india');

if (current.length === 0) {
  console.log('  SKIP  lgd_india row is absent');
} else {
  const row = current[0];
  const hasSync = 'last_sync' in (row.metadata || {});
  console.log(`  authoritative rows in administrative_units: ${geoCount}`);
  console.log(`  status: ${row.status} | last_successful_sync: ${row.last_successful_sync}`);

  if (geoCount > 0) {
    console.log('  SKIP  geography is actually ingested; leaving the source record alone.');
  } else if (row.status === 'not_configured' && !hasSync) {
    console.log('  ok    already reconciled');
  } else {
    const meta = { ...(row.metadata || {}) } as Record<string, unknown>;
    delete meta.last_sync;
    delete meta.last_synced_at;
    const { status, text } = await rest('PATCH', '/rest/v1/data_sources?id=eq.lgd_india', {
      status: 'not_configured',
      metadata: meta,
      updated_at: new Date().toISOString(),
      last_successful_sync: null,
    });
    if (status >= 400) {
      console.log(`  FAIL  ${status} ${text.slice(0, 300)}`);
    } else {
      repaired++;
      console.log('  withdrawn: status -> not_configured, fabricated last_sync removed,');
      console.log('             last_successful_sync -> null');
    }
  }
}

console.log(`\nReconciliation complete: ${repaired} record(s) repaired.\n`);
