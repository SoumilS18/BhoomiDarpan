/**
 * Ingests the temporary LGD reference mirror into `administrative_units`.
 *
 * Nothing about the snapshot is hardcoded here: `referenceGeographyProvider`
 * reads the mirror's monthly manifest at run time and selects the newest
 * archive for each tier, so the dataset date, filename and row counts always
 * come from the source itself rather than from constants in this file.
 *
 * Every row this script writes is stamped `lgd_reference_mirror` /
 * `temporary_reference` by the provider — the mirror is a stand-in for the
 * official LGD feed, never authoritative, and the UI reports it as such.
 *
 * Usage:
 *   bun scripts/ingestReferenceGeography.ts
 *
 * Gates (all enforced, none bypassable):
 *   - GEOGRAPHY_ACTIVE_SOURCE must resolve to lgd_reference_mirror
 *   - GEOGRAPHY_REFERENCE_MIRROR_ENABLED must not disable the mirror
 *   - GEOGRAPHY_REFERENCE_MIRROR_VERIFIED=1 — the operator's independent
 *     verification decision recorded in configuration before ingestion runs
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  getActiveGeographySource,
  referenceMirrorEnabled,
  referenceMirrorVerified,
} from '../server/config/geographySourceRegistry';
import { ingestReferenceTier } from '../server/services/referenceGeographyProvider';
import { getLgdSyncStatus } from '../server/services/lgdIngestionService';
import type { LgdAdministrativeTier } from '../server/config/lgdConfig';

// Ensure .env is parsed if not already populated in process.env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
    }
  }
}

/** Hierarchy order: every tier resolves its parents against rows already stored. */
const ALL_TIERS: LgdAdministrativeTier[] = ['states', 'districts', 'subDistricts', 'villages'];

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const source = getActiveGeographySource();
  const cliTier = process.argv[2]?.trim();
  const tiersToRun: LgdAdministrativeTier[] =
    cliTier && cliTier !== 'all'
      ? [cliTier as LgdAdministrativeTier]
      : ALL_TIERS;

  console.log('================================================================');
  console.log('BhoomiSetu temporary reference mirror ingestion');
  console.log('================================================================');
  console.log(`Active source : ${source.id}`);
  console.log(`Label         : ${source.label}`);
  console.log(`Authority     : ${source.authority}`);
  console.log(`Availability  : ${source.availability}`);
  console.log(`Tiers to run  : ${tiersToRun.join(', ')}`);
  console.log('');

  if (source.id !== 'lgd_reference_mirror') {
    fail(
      `GEOGRAPHY_ACTIVE_SOURCE resolved to "${source.id}". This script only ingests the ` +
        'temporary reference mirror; set GEOGRAPHY_ACTIVE_SOURCE=lgd_reference_mirror to run it.'
    );
  }
  if (source.authority !== 'temporary_reference') {
    fail(`Source "${source.id}" declares authority "${source.authority}" — refusing to ingest.`);
  }
  if (!referenceMirrorEnabled()) {
    fail('GEOGRAPHY_REFERENCE_MIRROR_ENABLED disables the mirror; there is nothing to ingest.');
  }
  if (!referenceMirrorVerified()) {
    fail(
      'GEOGRAPHY_REFERENCE_MIRROR_VERIFIED=1 is not set. Independently verify the mirror ' +
        '(coverage, licence, hierarchy) before ingesting it, then record that decision in .env.'
    );
  }

  let anyFailed = false;

  for (const tier of tiersToRun) {
    console.log(`\n================== TIER: ${tier.toUpperCase()} ==================`);
    const tierStart = Date.now();
    let lastLog = Date.now();

    const { summary, context } = await ingestReferenceTier(tier, {
      actor: 'scripts/ingestReferenceGeography.ts',
      batchSize: 500,
      concurrency: tier === 'villages' ? 4 : 1,
      onProgress: ({ received, inserted, updated, rejected }) => {
        const now = Date.now();
        if (now - lastLog >= 5000 || received % 25000 === 0) {
          lastLog = now;
          const elapsedSec = (now - tierStart) / 1000;
          const rate = elapsedSec > 0 ? (received / elapsedSec).toFixed(0) : '0';
          console.log(
            `[${tier}] Progress: received=${received.toLocaleString()} ` +
              `inserted=${inserted.toLocaleString()} updated=${updated.toLocaleString()} ` +
              `rejected=${rejected} | speed=${rate} rows/s`
          );
        }
      },
    });

    const archive = context.archive;
    if (archive) {
      console.log(`Archive  : ${archive.archive_name} (dataset ${archive.dataset_version})`);
      console.log(`URL      : ${archive.url}`);
      console.log(`Member   : ${archive.member}`);
    } else {
      console.log('Archive  : (no archive downloaded for this run)');
    }
    console.log(
      `Rows     : received=${summary.records_received.toLocaleString()} ` +
        `inserted=${summary.records_inserted.toLocaleString()} ` +
        `updated=${summary.records_updated.toLocaleString()} ` +
        `unchanged=${summary.records_unchanged.toLocaleString()} ` +
        `rejected=${summary.records_rejected.toLocaleString()} ` +
        `orphans=${summary.orphan_records.toLocaleString()}`
    );
    console.log(
      `Status   : ${summary.status} (provenance: source=${context.provenance.source_id}, ` +
        `authority=${context.provenance.authority})`
    );
    if (summary.count_verification) {
      const check = summary.count_verification;
      console.log(
        `Reconcile: observed=${check.source_total.toLocaleString()} ` +
          `in_db=${check.rows_in_database.toLocaleString()} matched=${check.matched}`
      );
    }
    for (const error of summary.validation_errors) {
      console.error(`  ${error.code}: ${error.message}`);
    }
    console.log(`Duration : ${((Date.now() - tierStart) / 1000).toFixed(1)}s`);
    if (summary.status === 'failed') anyFailed = true;
  }

  const syncStatus = await getLgdSyncStatus();
  console.log('\nSync status:');
  console.log(JSON.stringify(syncStatus, null, 2));
  console.log('');
  console.log('================================================================');
  console.log(anyFailed ? 'Completed WITH FAILURES (see errors above)' : 'Completed successfully');
  console.log('Provenance: every ingested row is lgd_reference_mirror / temporary_reference.');
  console.log('These rows are NOT authoritative LGD and are superseded automatically once');
  console.log('official LGD credentials are configured and a sync runs.');
  console.log('================================================================');
  process.exit(anyFailed ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error('Fatal error during reference mirror ingestion:', error);
  process.exit(1);
});
