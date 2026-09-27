import dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('=== VERIFYING CONCURRENT API REQUEST PERFORMANCE & THREAD SAFETY ===\n');

  const BASE_URL = 'http://localhost:3001';
  const NUM_REQUESTS = 50;

  console.log(`Firing ${NUM_REQUESTS} parallel requests simultaneously across subdistrict villages and search endpoints...`);
  const startTime = Date.now();

  const promises: Promise<{ id: number; status: number; duration: number; endpoint: string }>[] = [];

  for (let i = 0; i < NUM_REQUESTS; i++) {
    const isSearch = i % 2 === 0;
    const endpoint = isSearch
      ? `${BASE_URL}/api/administration/search?q=kothrud&type=village`
      : `${BASE_URL}/api/administration/subdistricts/4155/villages?limit=10`;

    const reqId = i + 1;
    promises.push(
      (async () => {
        const reqStart = Date.now();
        const res = await fetch(endpoint);
        await res.json();
        return {
          id: reqId,
          status: res.status,
          duration: Date.now() - reqStart,
          endpoint: isSearch ? 'search' : 'villages',
        };
      })()
    );
  }

  const results = await Promise.all(promises);
  const totalDuration = Date.now() - startTime;

  const successful = results.filter((r) => r.status === 200).length;
  const failed = results.filter((r) => r.status !== 200);
  const avgLatency = (results.reduce((sum, r) => sum + r.duration, 0) / results.length).toFixed(1);
  const maxLatency = Math.max(...results.map((r) => r.duration));
  const minLatency = Math.min(...results.map((r) => r.duration));

  console.log('\n--- Concurrency Test Results ---');
  console.log(`Total Requests: ${NUM_REQUESTS}`);
  console.log(`Successful (HTTP 200): ${successful}/${NUM_REQUESTS}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Total Batch Execution Time: ${totalDuration}ms`);
  console.log(`Average Latency: ${avgLatency}ms (Min: ${minLatency}ms, Max: ${maxLatency}ms)`);
  console.log(`Throughput: ${((NUM_REQUESTS / totalDuration) * 1000).toFixed(1)} req/sec`);

  if (failed.length > 0) {
    console.error('Failed requests:', failed);
    process.exit(1);
  }

  console.log('\n=== ALL CONCURRENT REQUESTS PASSED WITH 100% SUCCESS ===');
}

main().catch((err) => {
  console.error('Concurrency test failed:', err);
  process.exit(1);
});
