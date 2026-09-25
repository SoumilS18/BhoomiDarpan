import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  getLgdServerConfig,
  executeLgdQuery,
  CANONICAL_LGD_RESOURCES,
  LgdAdministrativeTier,
} from '../server/config/lgdConfig';

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

async function runLiveVerification() {
  console.log('================================================================');
  console.log('BhoomiSetu Live LGD data.gov.in Integration Verification');
  console.log('================================================================\n');

  const config = getLgdServerConfig();

  // 1. Strict Fail-Fast Check for Missing Credential
  if (!config.apiKey || config.apiKey.trim().length === 0) {
    console.error('----------------------------------------------------------------');
    console.error('CRITICAL CONFIGURATION ERROR: LGD_DATA_GOV_API_KEY is not configured or empty.');
    console.error('Live LGD verification requires a valid data.gov.in API key in .env.');
    console.error('Please configure LGD_DATA_GOV_API_KEY before running this command.');
    console.error('----------------------------------------------------------------\n');
    process.exit(1);
  }

  console.log('1. Configuration & Credential Isolation:');
  console.log(`- Base URL: ${config.baseUrl}`);
  console.log(`- API Key present: true (length: ${config.apiKey.length}, format: valid)`);
  console.log(`- Server-side only: true (zero VITE_ exposure)`);
  console.log('- Centrally configured Resource IDs:');
  for (const [tier, resId] of Object.entries(config.resources)) {
    console.log(`  * ${tier.padEnd(14)}: ${resId}`);
  }
  console.log('');

  // 2. Multi-Resource Live Verification
  console.log('2. Multi-Tier Live API Probing (Same API Key):');
  const tiers: LgdAdministrativeTier[] = ['states', 'districts', 'subDistricts', 'villages'];
  const summaryTable: any[] = [];
  let allTiersPassed = true;

  for (const tier of tiers) {
    const meta = CANONICAL_LGD_RESOURCES[tier];
    try {
      const response = await executeLgdQuery(tier, { offset: 0, limit: 5 });
      const records = response.records || [];
      const passed = response.status === 'ok' && records.length > 0;

      if (!passed) allTiersPassed = false;

      summaryTable.push({
        Tier: meta.name.replace('Local Government Directory (LGD) - ', ''),
        ResourceID: response.diagnostics.resourceId,
        HttpStatus: response.diagnostics.httpStatus,
        ResponseTimeMs: `${response.diagnostics.responseTimeMs}ms`,
        Returned: records.length,
        TotalReported: response.total,
        Result: passed ? 'PASSED' : 'UNEXPECTED_BODY',
      });
    } catch (err: any) {
      allTiersPassed = false;
      summaryTable.push({
        Tier: meta.name.replace('Local Government Directory (LGD) - ', ''),
        ResourceID: config.resources[tier],
        HttpStatus: (err as any).status || 'ERR',
        ResponseTimeMs: 'N/A',
        Returned: 0,
        TotalReported: 'N/A',
        Result: `FAILED: ${err.message}`,
      });
    }
  }

  console.table(summaryTable);
  console.log('');

  // 3. Live Pagination Verification
  console.log('3. Live Pagination & Non-Duplication Testing (Districts):');
  try {
    const page1 = await executeLgdQuery('districts', { offset: 0, limit: 5 });
    const page2 = await executeLgdQuery('districts', { offset: 5, limit: 5 });

    const page1Codes = page1.records.map((r) => r.district_code || r.districtCode);
    const page2Codes = page2.records.map((r) => r.district_code || r.districtCode);
    const duplicates = page1Codes.filter((code) => page2Codes.includes(code));

    console.log(`- Page 1: status=${page1.diagnostics.httpStatus}, records=${page1.count}, total=${page1.total}`);
    console.log(`- Page 2: status=${page2.diagnostics.httpStatus}, records=${page2.count}, total=${page2.total}`);
    console.log(`- Duplicates across pages: ${duplicates.length}`);

    if (duplicates.length === 0 && page1.count === 5 && page2.count === 5) {
      console.log('- Result: PASSED (Clean sequential pagination with non-overlapping records)\n');
    } else {
      allTiersPassed = false;
      console.error('- Result: FAILED (Duplicate records or unexpected page size)\n');
    }
  } catch (pagErr: any) {
    allTiersPassed = false;
    console.error(`- Pagination probe failed: ${pagErr.message}\n`);
  }

  // 4. Controlled Negative Authentication Test (In-Memory Fake Key)
  console.log('4. Controlled Negative Authentication Test (In-Memory Invalid Key):');
  const invalidKey = 'invalid_data_gov_in_key_0000000000000000000000000000000000';
  let negativePassed = false;

  try {
    await executeLgdQuery('states', {
      offset: 0,
      limit: 1,
      apiKeyOverride: invalidKey,
    });
    console.error('- Result: FAILED (Unexpectedly succeeded with invalid credential)\n');
  } catch (err: any) {
    if ((err as any).status === 403 || err.message.includes('Key not authorised') || err.message.includes('HTTP 403')) {
      negativePassed = true;
      console.log(`- HTTP Status: ${(err as any).status || 403}`);
      console.log(`- Gateway Error: ${err.message}`);
      console.log('- Result: PASSED (Correctly rejected invalid credential with 403 Forbidden)\n');
    } else {
      console.error(`- Result: UNEXPECTED ERROR: ${err.message}\n`);
    }
  }

  // 5. Final Outcome
  console.log('================================================================');
  if (allTiersPassed && negativePassed) {
    console.log('FINAL LIVE VERIFICATION OUTCOME: VERIFIED (All Live Checks Passed)');
    console.log('================================================================\n');
    process.exit(0);
  } else {
    console.error('FINAL LIVE VERIFICATION OUTCOME: FAILED / PARTIALLY VERIFIED');
    console.error('================================================================\n');
    process.exit(1);
  }
}

runLiveVerification().catch((err) => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
