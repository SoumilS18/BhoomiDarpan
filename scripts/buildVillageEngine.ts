import { buildVillageDatabase, getVillageCount, isVillageDatabasePopulated, queryVillagesBySubDistrict, searchVillagesEngine } from '../server/services/villageStorageEngine';

async function main() {
  console.log('=== BUILDING COMPRESSED VILLAGE STORAGE ENGINE ===\n');

  if (isVillageDatabasePopulated()) {
    console.log(`Engine is already populated with ${getVillageCount()} villages.`);
  } else {
    console.log('Starting streaming build into SQLite...');
    const startTime = Date.now();
    const result = await buildVillageDatabase((processed) => {
      if (processed % 50000 === 0) {
        console.log(`  Indexed ${processed.toLocaleString()} villages...`);
      }
    });
    console.log(`\nBuild completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s! Total villages: ${result.total.toLocaleString()}`);
  }

  console.log('\n--- Verifying Queries ---');
  // 1. Sub-district query (Haveli: 4155)
  console.time('queryVillagesBySubDistrict');
  const haveliVillages = queryVillagesBySubDistrict('4155', undefined, 10, 0);
  console.timeEnd('queryVillagesBySubDistrict');
  console.log(`Haveli (4155) total villages: ${haveliVillages.total}, fetched: ${haveliVillages.villages.length}`);
  console.log('Sample village:', haveliVillages.villages[0]?.name, `(code: ${haveliVillages.villages[0]?.code})`);

  // 2. Search query (Kothrud)
  console.time('searchVillages');
  const searchRes = searchVillagesEngine('kothrud', 5);
  console.timeEnd('searchVillages');
  console.log(`Search for "kothrud" found: ${searchRes.length} villages:`);
  searchRes.forEach((v) => console.log(`  - ${v.name} (Code: ${v.code}, SubDistrict: ${v.sub_district_code}, State: ${v.state_code})`));
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
