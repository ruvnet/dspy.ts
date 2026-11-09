#!/usr/bin/env node
/**
 * dspy-optimize MCP server — exposes DSPy.ts optimizer campaigns as MCP tools.
 * Tools: dspy_mipro (MIPROv2 + experience replay), dspy_gepa (GEPA Pareto
 * evolution), dspy_bootstrap (BootstrapFewShot + dynamic demos), dspy_replay_status
 * (inspect an AgentDB replay/frontier store).
 * Resources: dspy://optimizer-selection, dspy://experience-replay, dspy://traces/{runId}.
 *
 * Scaffold: the handlers shell out to `npx ts-node` against the project's
 * src/dspy/* and to dspy.ts (MIPROv2 / GEPA / BootstrapFewShot, AgentDBClient,
 * CompilationTracer). Flesh out the @modelcontextprotocol/sdk stdio wiring + handlers.
 */
'use strict';
const TOOLS = [
  { name: 'dspy_mipro', description: 'Compile a DSPy.ts program with MIPROv2 (instruction proposal + demo bootstrapping + seeded search); optional AgentDB replayStore warm-starts repeated compiles of the same task. Returns {instruction, demos, score, trials, warmStarted, recalledInstructions}.', inputSchema: { type: 'object', properties: { program: { type: 'string' }, trainset: { type: 'string', description: 'path to [{input,output?}] JSON' }, numTrials: { type: 'number' }, numCandidateInstructions: { type: 'number' }, replayPath: { type: 'string', description: 'AgentDB path for experience replay' }, trace: { type: 'boolean' } }, required: ['program', 'trainset'] } },
  { name: 'dspy_gepa', description: 'Evolve a DSPy.ts program’s prompt with GEPA (reflective Pareto-frontier evolution targeting weak examples); optional AgentDB frontierStore persists + continues the evolution. Returns {best, frontier, reflections, iterations, warmStarted}.', inputSchema: { type: 'object', properties: { program: { type: 'string' }, trainset: { type: 'string' }, numIterations: { type: 'number' }, mutationsPerStep: { type: 'number' }, frontierSize: { type: 'number' }, storePath: { type: 'string', description: 'AgentDB path for the frontier' } }, required: ['program', 'trainset'] } },
  { name: 'dspy_bootstrap', description: 'Compile a DSPy.ts program with BootstrapFewShot (labeled + self-bootstrapped demos); optional AgentDB dynamicDemos store makes the compiled module pick input-conditioned demos at run time. Returns the saved optimized program path.', inputSchema: { type: 'object', properties: { program: { type: 'string' }, trainset: { type: 'string' }, maxLabeledDemos: { type: 'number' }, maxBootstrappedDemos: { type: 'number' }, dynamicPath: { type: 'string' }, k: { type: 'number' } }, required: ['program', 'trainset'] } },
  { name: 'dspy_replay_status', description: 'Inspect an AgentDB experience-replay / GEPA-frontier / dynamic-demo store: vector count, dimension, tier counts, quantization info.', inputSchema: { type: 'object', properties: { storePath: { type: 'string' } }, required: ['storePath'] } },
];
const RESOURCES = [
  { uri: 'dspy://optimizer-selection', name: 'Optimizer selection guide', description: 'BootstrapFewShot vs MIPROv2 vs GEPA — choosing and budgeting.', mimeType: 'text/markdown' },
  { uri: 'dspy://experience-replay', name: 'Experience replay guide', description: 'Wiring an AgentDBClient as replayStore / frontierStore / dynamicDemos.', mimeType: 'text/markdown' },
  { uri: 'dspy://traces/{runId}', name: 'Compilation trace', description: 'CompilationTracer run — trials with causedBy links; causalChain to the best.', mimeType: 'application/json' },
];
module.exports = { TOOLS, RESOURCES };
// TODO: wire @modelcontextprotocol/sdk StdioServerTransport; handlers shell out to
//       `npx ts-node` against src/dspy/* and dspy.ts (MIPROv2/GEPA/BootstrapFewShot, AgentDBClient, CompilationTracer).
if (require.main === module) {
  process.stderr.write('[dspy-optimize mcp] scaffold — handlers shell out to `npx ts-node` against src/dspy/* and dspy.ts. Tools: ' + TOOLS.map(t => t.name).join(', ') + '\n');
}
