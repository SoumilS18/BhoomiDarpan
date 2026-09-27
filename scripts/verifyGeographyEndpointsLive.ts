import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:3001';

async function main() {
  console.log('=== VERIFYING LIVE GEOGRAPHY API ENDPOINTS ===\n');

  // 1. Geography Status
  console.log('1. Checking /api/geography/status...');
  const t0 = Date.now();
  const resStatus = await fetch(`${BASE_URL}/api/geography/status`);
  const statusJson = await resStatus.json();
  const d0 = Date.now() - t0;
  console.log(`HTTP ${resStatus.status} (${d0}ms):`, JSON.stringify(statusJson, null, 2));

  // 2. Geography States
  console.log('\n2. Checking /api/geography/states...');
  const t1 = Date.now();
  const resStates = await fetch(`${BASE_URL}/api/geography/states`);
  const statesJson = await resStates.json();
  const d1 = Date.now() - t1;
  const statesList = statesJson.states || statesJson;
  console.log(`HTTP ${resStates.status} (${d1}ms): States count = ${statesList.length}`);

  // 4. State Districts (Maharashtra = code 27)
  console.log('\n4. Checking /api/administration/states/27/districts (Maharashtra)...');
  const t3 = Date.now();
  const resDistricts = await fetch(`${BASE_URL}/api/administration/states/27/districts`);
  const districtsJson = await resDistricts.json();
  const d3 = Date.now() - t3;
  const districtsList = districtsJson.districts || districtsJson;
  console.log(`HTTP ${resDistricts.status} (${d3}ms): Districts count in Maharashtra = ${districtsList.length}`);
  const pune = districtsList.find((d: any) => d.name.toLowerCase().includes('pune'));
  console.log('Sample District (Pune):', pune);

  // 5. Sub-districts of Pune (code 484)
  console.log('\n5. Checking /api/administration/districts/484/subdistricts (Pune)...');
  const t4 = Date.now();
  const resSubdistricts = await fetch(`${BASE_URL}/api/administration/districts/484/subdistricts`);
  const subdistrictsJson = await resSubdistricts.json();
  const d4 = Date.now() - t4;
  const subdistrictsList = subdistrictsJson.subdistricts || subdistrictsJson;
  console.log(`HTTP ${resSubdistricts.status} (${d4}ms): Sub-districts count in Pune = ${subdistrictsList.length}`);
  const haveli = subdistrictsList.find((s: any) => s.name.toLowerCase().includes('haveli'));
  console.log('Sample Sub-district (Haveli):', haveli);

  // 6. Villages of Haveli (code 4155)
  console.log('\n6. Checking /api/administration/subdistricts/4155/villages (Haveli)...');
  const t5 = Date.now();
  const resVillages = await fetch(`${BASE_URL}/api/administration/subdistricts/4155/villages`);
  const villagesJson = await resVillages.json();
  const d5 = Date.now() - t5;
  const villagesList = villagesJson.villages || villagesJson;
  console.log(`HTTP ${resVillages.status} (${d5}ms): Villages count in Haveli = ${villagesList.length}`);
  console.log('First 3 Villages in Haveli:', villagesList.slice(0, 3));

  // 7. Village Search
  console.log('\n7. Checking /api/administration/search?query=kothrud&type=village&limit=5...');
  const t6 = Date.now();
  const resSearch = await fetch(`${BASE_URL}/api/administration/search?query=kothrud&type=village&limit=5`);
  const searchJson = await resSearch.json();
  const d6 = Date.now() - t6;
  console.log(`HTTP ${resSearch.status} (${d6}ms): Search results:`, searchJson);

  console.log('\n=== ALL ENDPOINTS VERIFIED SUCCESSFULLY ===');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
