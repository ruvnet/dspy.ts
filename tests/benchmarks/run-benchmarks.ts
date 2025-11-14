/**
 * Benchmark Suite for DSPy.ts
 *
 * Tests performance of core components and compares with targets
 */

import { performance } from 'perf_hooks';
import { DummyLM } from '../../src/lm/dummy';
import { PredictModule } from '../../src/modules/predict';
import { ChainOfThought } from '../../src/modules/chain-of-thought';
import { ReAct } from '../../src/modules/react';
import { Pipeline } from '../../src/core/pipeline';
import { BootstrapFewShot } from '../../src/optimize/bootstrap';
import { configureLM } from '../../src/core';
import { AgentDBClient } from '../../src/memory/agentdb/client';
import { ReasoningBank } from '../../src/memory/reasoning-bank/bank';
import { SwarmOrchestrator } from '../../src/agent/swarm/orchestrator';

/**
 * Benchmark result
 */
interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  opsPerSecond: number;
  target?: number;
  passed?: boolean;
}

/**
 * Run a benchmark
 */
async function benchmark(
  name: string,
  fn: () => Promise<void>,
  iterations: number = 100,
  target?: number
): Promise<BenchmarkResult> {
  const times: number[] = [];

  // Warm-up
  await fn();

  // Run benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const totalTime = times.reduce((sum, t) => sum + t, 0);
  const avgTime = totalTime / iterations;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const opsPerSecond = 1000 / avgTime;

  const passed = target ? avgTime <= target : undefined;

  return {
    name,
    iterations,
    totalTime,
    avgTime,
    minTime,
    maxTime,
    opsPerSecond,
    target,
    passed,
  };
}

/**
 * Print benchmark results
 */
function printResults(results: BenchmarkResult[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('BENCHMARK RESULTS');
  console.log('='.repeat(80) + '\n');

  for (const result of results) {
    console.log(`${result.name}:`);
    console.log(`  Iterations:     ${result.iterations}`);
    console.log(`  Total Time:     ${result.totalTime.toFixed(2)}ms`);
    console.log(`  Average Time:   ${result.avgTime.toFixed(2)}ms`);
    console.log(`  Min Time:       ${result.minTime.toFixed(2)}ms`);
    console.log(`  Max Time:       ${result.maxTime.toFixed(2)}ms`);
    console.log(`  Ops/Second:     ${result.opsPerSecond.toFixed(2)}`);

    if (result.target !== undefined) {
      const status = result.passed ? '✓ PASSED' : '✗ FAILED';
      console.log(`  Target:         ${result.target}ms ${status}`);
    }

    console.log('');
  }

  console.log('='.repeat(80) + '\n');
}

/**
 * Module benchmarks
 */
async function benchmarkModules(): Promise<BenchmarkResult[]> {
  console.log('Running module benchmarks...');

  // Setup
  const lm = new DummyLM({
    responses: {
      default: JSON.stringify({ answer: 'test answer', reasoning: 'test reasoning' }),
    },
  });
  await lm.init();
  configureLM(lm);

  const results: BenchmarkResult[] = [];

  // PredictModule benchmark
  const predictModule = new PredictModule({
    name: 'TestPredict',
    signature: {
      inputs: [{ name: 'question', type: 'string', required: true }],
      outputs: [{ name: 'answer', type: 'string', required: true }],
    },
  });

  results.push(
    await benchmark(
      'PredictModule.run()',
      async () => {
        await predictModule.run({ question: 'test' });
      },
      50,
      200 // Target: < 200ms
    )
  );

  // ChainOfThought benchmark
  const cotModule = new ChainOfThought({
    name: 'TestCoT',
    signature: {
      inputs: [{ name: 'question', type: 'string', required: true }],
      outputs: [{ name: 'answer', type: 'string', required: true }],
    },
  });

  results.push(
    await benchmark(
      'ChainOfThought.run()',
      async () => {
        await cotModule.run({ question: 'test' });
      },
      50,
      250 // Target: < 250ms
    )
  );

  await lm.cleanup();
  return results;
}

/**
 * Pipeline benchmarks
 */
async function benchmarkPipeline(): Promise<BenchmarkResult[]> {
  console.log('Running pipeline benchmarks...');

  const lm = new DummyLM({
    responses: {
      default: JSON.stringify({ answer: 'test', intermediate: 'test' }),
    },
  });
  await lm.init();
  configureLM(lm);

  const results: BenchmarkResult[] = [];

  // Create pipeline with 3 modules
  const module1 = new PredictModule({
    name: 'Module1',
    signature: {
      inputs: [{ name: 'input', type: 'string', required: true }],
      outputs: [{ name: 'intermediate', type: 'string', required: true }],
    },
  });

  const module2 = new PredictModule({
    name: 'Module2',
    signature: {
      inputs: [{ name: 'intermediate', type: 'string', required: true }],
      outputs: [{ name: 'output', type: 'string', required: true }],
    },
  });

  const pipeline = new Pipeline([module1, module2], {
    retryAttempts: 0,
  });

  results.push(
    await benchmark(
      'Pipeline (2 modules)',
      async () => {
        await pipeline.run({ input: 'test' });
      },
      50,
      400 // Target: < 400ms for 2 modules
    )
  );

  await lm.cleanup();
  return results;
}

/**
 * Memory system benchmarks
 */
async function benchmarkMemory(): Promise<BenchmarkResult[]> {
  console.log('Running memory system benchmarks...');

  const results: BenchmarkResult[] = [];

  // AgentDB benchmarks
  const agentDB = new AgentDBClient({
    vectorDimension: 768,
    indexType: 'flat', // Use flat for benchmarking
    storage: {
      path: ':memory:',
      inMemory: true,
    },
  });

  await agentDB.init();

  // Store benchmark
  const testVector = new Array(768).fill(0).map(() => Math.random());

  results.push(
    await benchmark(
      'AgentDB.store()',
      async () => {
        await agentDB.store(testVector, { test: 'data' });
      },
      100,
      10 // Target: < 10ms per store
    )
  );

  // Search benchmark
  results.push(
    await benchmark(
      'AgentDB.search()',
      async () => {
        await agentDB.search(testVector, { k: 10 });
      },
      100,
      10 // Target: < 10ms per search
    )
  );

  // ReasoningBank benchmarks
  const reasoningBank = new ReasoningBank(agentDB);
  await reasoningBank.init();

  results.push(
    await benchmark(
      'ReasoningBank.learnFromExperience()',
      async () => {
        await reasoningBank.learnFromExperience({
          input: { question: 'test' },
          output: { answer: 'test' },
          success: true,
          reasoning: ['step 1', 'step 2', 'step 3'],
          context: {
            domain: 'test',
            inputFeatures: {},
            conditions: {},
          },
          timestamp: new Date(),
        });
      },
      50,
      50 // Target: < 50ms
    )
  );

  await reasoningBank.cleanup();
  await agentDB.cleanup();

  return results;
}

/**
 * Agent system benchmarks
 */
async function benchmarkAgents(): Promise<BenchmarkResult[]> {
  console.log('Running agent system benchmarks...');

  const results: BenchmarkResult[] = [];

  // Swarm orchestrator
  const swarm = new SwarmOrchestrator();

  // Add simple agent
  swarm.addAgent({
    id: 'test-agent',
    name: 'TestAgent',
    description: 'Test agent',
    routine: {
      instructions: 'Test',
      tools: [],
      execute: async (input, context) => ({
        output: { result: 'done' },
        success: true,
        context,
      }),
    },
    handoffs: [],
    context: new Map(),
  });

  results.push(
    await benchmark(
      'SwarmOrchestrator.execute()',
      async () => {
        await swarm.execute({
          id: 'test-task',
          input: { test: 'data' },
          startAgent: 'test-agent',
        });
      },
      100,
      50 // Target: < 50ms per task
    )
  );

  return results;
}

/**
 * Optimizer benchmarks
 */
async function benchmarkOptimizers(): Promise<BenchmarkResult[]> {
  console.log('Running optimizer benchmarks...');

  const lm = new DummyLM({
    responses: {
      default: JSON.stringify({ answer: 'test', score: '0.8' }),
    },
  });
  await lm.init();
  configureLM(lm);

  const results: BenchmarkResult[] = [];

  // BootstrapFewShot
  const module = new PredictModule({
    name: 'TestModule',
    signature: {
      inputs: [{ name: 'question', type: 'string', required: true }],
      outputs: [{ name: 'answer', type: 'string', required: true }],
    },
  });

  const trainset = [
    { question: 'Q1', answer: 'A1' },
    { question: 'Q2', answer: 'A2' },
    { question: 'Q3', answer: 'A3' },
  ];

  const metric = (example: any, prediction: any) => {
    return prediction.answer === example.answer ? 1 : 0;
  };

  const optimizer = new BootstrapFewShot(metric, {
    maxLabeledDemos: 2,
    maxBootstrappedDemos: 2,
  });

  results.push(
    await benchmark(
      'BootstrapFewShot.compile()',
      async () => {
        await optimizer.compile(module, trainset);
      },
      10,
      2000 // Target: < 2s per compile
    )
  );

  await lm.cleanup();
  return results;
}

/**
 * Run all benchmarks
 */
async function main() {
  console.log('DSPy.ts Benchmark Suite\n');
  console.log('Starting benchmarks...\n');

  const allResults: BenchmarkResult[] = [];

  try {
    // Run benchmark suites
    allResults.push(...(await benchmarkModules()));
    allResults.push(...(await benchmarkPipeline()));
    allResults.push(...(await benchmarkMemory()));
    allResults.push(...(await benchmarkAgents()));
    allResults.push(...(await benchmarkOptimizers()));

    // Print results
    printResults(allResults);

    // Summary
    const passed = allResults.filter((r) => r.passed === true).length;
    const failed = allResults.filter((r) => r.passed === false).length;
    const total = allResults.filter((r) => r.passed !== undefined).length;

    console.log('SUMMARY:');
    console.log(`  Total Tests:    ${total}`);
    console.log(`  Passed:         ${passed} ✓`);
    console.log(`  Failed:         ${failed} ✗`);
    console.log(`  Success Rate:   ${((passed / total) * 100).toFixed(1)}%`);
    console.log('');

    // Exit with error if any tests failed
    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Benchmark error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { benchmark, benchmarkModules, benchmarkPipeline, benchmarkMemory, benchmarkAgents, benchmarkOptimizers };
