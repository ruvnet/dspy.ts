#!/usr/bin/env node
/**
 * dspy-observability MCP server — exposes DSPy.ts tracing + caching as MCP tools.
 * Tools: dspy_trace (compile with a CompilationTracer attached → run summary + causal chain),
 * dspy_runs (list/inspect compile runs in an AgentDB trace store), dspy_run_chain
 * (causalChain to the best for a runId), dspy_cache_stats (CachingLM hit-rate + store stats).
 * Resources: dspy://compile-tracing, dspy://llm-caching, dspy://traces/{runId}.
 *
 * Scaffold: handlers shell out to `npx ts-node` against src/dspy/* and dspy.ts
 * (CompilationTracer, CachingLM, MIPROv2/GEPA, AgentDBClient). Flesh out the
 * @modelcontextprotocol/sdk stdio wiring + handlers.
 */
'use strict';
const TOOLS = [
  { name: 'dspy_trace', description: 'Compile a DSPy.ts program with a CompilationTracer attached (trials persisted to AgentDB with causedBy links); returns {runId, trials, causalChain, bestScore, mlflowAvailable}.', inputSchema: { type: 'object', properties: { program: { type: 'string' }, optimizer: { type: 'string', enum: ['mipro', 'gepa'] }, trainset: { type: 'string' }, storePath: { type: 'string', description: 'AgentDB path for the trace' }, mlflow: { type: 'boolean' } }, required: ['program', 'optimizer', 'trainset'] } },
  { name: 'dspy_runs', description: 'List the optimizer compile runs in an AgentDB trace store (or inspect one): optimizer, params, best score, trial count, start/end.', inputSchema: { type: 'object', properties: { storePath: { type: 'string' }, runId: { type: 'string' }, limit: { type: 'number' } }, required: ['storePath'] } },
  { name: 'dspy_run_chain', description: 'Return the causal chain (causedBy lineage) of trials that produced the best candidate for a given runId.', inputSchema: { type: 'object', properties: { storePath: { type: 'string' }, runId: { type: 'string' } }, required: ['storePath', 'runId'] } },
  { name: 'dspy_cache_stats', description: 'CachingLM hit-rate stats {hits, misses, hitRate, entries} plus the backing AgentDB store stats (vectors, dimension, tiers, quantization).', inputSchema: { type: 'object', properties: { cachePath: { type: 'string' } }, required: ['cachePath'] } },
];
const RESOURCES = [
  { uri: 'dspy://compile-tracing', name: 'Compile tracing guide', description: 'Instrumenting MIPROv2/GEPA with CompilationTracer; reading getTrace / causalChain.', mimeType: 'text/markdown' },
  { uri: 'dspy://llm-caching', name: 'LLM caching guide', description: 'CachingLM threshold/TTL/embed tradeoffs and when it pays off.', mimeType: 'text/markdown' },
  { uri: 'dspy://traces/{runId}', name: 'Compilation trace', description: 'A CompilationTracer run — trials with causedBy links; causalChain to the best.', mimeType: 'application/json' },
];
module.exports = { TOOLS, RESOURCES };
// TODO: wire @modelcontextprotocol/sdk StdioServerTransport; handlers shell out to
//       `npx ts-node` against src/dspy/* and dspy.ts (CompilationTracer, CachingLM, MIPROv2/GEPA, AgentDBClient).
if (require.main === module) {
  process.stderr.write('[dspy-observability mcp] scaffold — handlers shell out to `npx ts-node` against src/dspy/* and dspy.ts. Tools: ' + TOOLS.map(t => t.name).join(', ') + '\n');
}
