#!/usr/bin/env node
/**
 * dspy-evolution MCP server — exotic: multi-generation GEPA self-evolution for DSPy.ts.
 * Tools: dspy_evolve (run an N-generation GEPA evolution against a held-out benchmark,
 * persistent AgentDB frontier, optional LM cache, optional structural exploration),
 * dspy_benchmark_run (score a program/variant over a held-out dataset, record the result),
 * dspy_evolution_status (learning curve / reflections / warm-start lineage from an evolution store),
 * dspy_frontier_inspect (the current Pareto frontier: candidates with per-example scores).
 * Resources: dspy://benchmark-design, dspy://self-evolution-loop, dspy://evolution/{path}/frontier.
 *
 * Scaffold: handlers shell out to `npx ts-node` against src/dspy/* and dspy.ts
 * (GEPA, CachingLM, CompilationTracer, AgentDBClient, RetrieveModule/ReAct for variants).
 * Flesh out the @modelcontextprotocol/sdk stdio wiring + handlers.
 */
'use strict';
const TOOLS = [
  { name: 'dspy_evolve', description: 'Run a multi-generation GEPA self-evolution of a DSPy.ts program against a held-out benchmark: each generation reflects on the weakest cases, mutates instructions, keeps the Pareto frontier (persisted to AgentDB → warm-starts next run), optionally explores structural variants (module swap / insert Retrieve). Returns {generations:[{best, meanScore}], frontier, warmStarted, lmCalls, cacheHitRate}.', inputSchema: { type: 'object', properties: { program: { type: 'string' }, benchmark: { type: 'string', description: 'held-out [{input,output?}] JSON' }, generations: { type: 'number' }, iterationsPerGen: { type: 'number' }, mutationsPerStep: { type: 'number' }, frontierSize: { type: 'number' }, storePath: { type: 'string', description: 'AgentDB path for the persistent frontier' }, cachePath: { type: 'string', description: 'AgentDB path for the CachingLM (recommended)' }, exploreModules: { type: 'boolean', description: 'also try structural variants between generations (exotic)' } }, required: ['program', 'benchmark'] } },
  { name: 'dspy_benchmark_run', description: 'Score a DSPy.ts program (raw / optimized / evolved) over a HELD-OUT dataset using its metric; reports mean, min/max, the worst N examples, and (if multiple) variant deltas; records a benchmark-result to the evolution store.', inputSchema: { type: 'object', properties: { program: { type: 'string' }, dataset: { type: 'string' }, variant: { type: 'string', enum: ['raw', 'optimized', 'evolved', 'all'] }, storePath: { type: 'string' }, baseline: { type: 'boolean' } }, required: ['program', 'dataset'] } },
  { name: 'dspy_evolution_status', description: 'Inspect an evolution store: the per-generation learning curve, the GEPA reflections that drove each mutation ({from, weakExamples, mutated}), warm-start lineage, and a generation’s causalChain.', inputSchema: { type: 'object', properties: { storePath: { type: 'string' }, gen: { type: 'number' }, view: { type: 'string', enum: ['curve', 'reflections', 'all'] } }, required: ['storePath'] } },
  { name: 'dspy_frontier_inspect', description: 'The current non-dominated Pareto frontier in an evolution store: each candidate {instruction, meanScore, perExampleScores} so a caller can pick a deployable alternative.', inputSchema: { type: 'object', properties: { storePath: { type: 'string' } }, required: ['storePath'] } },
];
const RESOURCES = [
  { uri: 'dspy://benchmark-design', name: 'Benchmark design guide', description: 'Designing the held-out benchmark + metric a self-evolution loop optimizes against.', mimeType: 'text/markdown' },
  { uri: 'dspy://self-evolution-loop', name: 'Self-evolution loop guide', description: 'Multi-generation GEPA, persistent frontier, warm-start, caching, structural exploration.', mimeType: 'text/markdown' },
  { uri: 'dspy://evolution/{path}/frontier', name: 'Evolution frontier', description: 'Live Pareto frontier + learning curve for an evolution store.', mimeType: 'application/json' },
];
module.exports = { TOOLS, RESOURCES };
// TODO: wire @modelcontextprotocol/sdk StdioServerTransport; handlers shell out to
//       `npx ts-node` against src/dspy/* and dspy.ts (GEPA, CachingLM, CompilationTracer, AgentDBClient, RetrieveModule/ReAct).
if (require.main === module) {
  process.stderr.write('[dspy-evolution mcp] scaffold — handlers shell out to `npx ts-node` against src/dspy/* and dspy.ts. Tools: ' + TOOLS.map(t => t.name).join(', ') + '\n');
}
