/**
 * RuVector Benchmark Runner
 *
 * Run with: npx ts-node scripts/run-benchmark.ts
 */

import { runBenchmarkSuite, formatBenchmarkResults } from '../src/memory/ruvector/benchmark';

async function main() {
  console.log('Starting RuVector Performance Benchmark...\n');

  try {
    const results = await runBenchmarkSuite({
      dimension: 768,
      vectorCount: 500,
      searchIterations: 50,
      insertIterations: 50,
    });

    console.log('\n' + formatBenchmarkResults(results));
  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  }
}

main();
