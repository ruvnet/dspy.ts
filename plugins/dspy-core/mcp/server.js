#!/usr/bin/env node
/**
 * dspy-core MCP server — exposes DSPy.ts as MCP tools + resources so Claude Code
 * / Codex can compile, evaluate, and run DSPy.ts programs and read the docs.
 *
 * Tools (stdio): dspy_compile (run an optimizer on a program), dspy_eval
 * (score a program over a dataset), dspy_retrieve (RAG over an AgentDB store),
 * dspy_scaffold (emit a program skeleton).
 * Resources: dspy://docs/api, dspy://examples, dspy://signature-design,
 * dspy://metric-design.
 *
 * This is a scaffold: the tool handlers shell out to `npx ts-node` against the
 * project's `src/dspy/*` and to `dspy.ts`. Flesh them out per the plugin's
 * commands. Run: `node plugins/dspy-core/mcp/server.js` (registered via the
 * plugin's `mcpServers` config).
 */
'use strict';
// Minimal MCP stdio scaffold — replace with @modelcontextprotocol/sdk wiring.
const TOOLS = [
  { name: 'dspy_scaffold', description: 'Emit a DSPy.ts program skeleton for a signature spec ("in1,in2 -> out1") and module type.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, signature: { type: 'string' }, module: { type: 'string', enum: ['predict', 'cot', 'react', 'retrieve'] } }, required: ['name', 'signature'] } },
  { name: 'dspy_compile', description: 'Optimize a DSPy.ts program (BootstrapFewShot | MIPROv2 | GEPA) against its metric + a trainset; returns the best score + trial trace.', inputSchema: { type: 'object', properties: { program: { type: 'string' }, optimizer: { type: 'string', enum: ['bootstrap', 'mipro', 'gepa'] }, trainset: { type: 'string', description: 'path to [{input,output?}] JSON' } }, required: ['program', 'trainset'] } },
  { name: 'dspy_eval', description: 'Evaluate a DSPy.ts program (raw or optimized) over a dataset using its metric; returns per-example + aggregate scores.', inputSchema: { type: 'object', properties: { program: { type: 'string' }, dataset: { type: 'string' }, optimized: { type: 'boolean' } }, required: ['program', 'dataset'] } },
  { name: 'dspy_retrieve', description: 'RAG: embed a query and retrieve the top-k passages from an AgentDB store (HNSW + MMR).', inputSchema: { type: 'object', properties: { storePath: { type: 'string' }, query: { type: 'string' }, k: { type: 'number' } }, required: ['query'] } },
];
const RESOURCES = [
  { uri: 'dspy://docs/api', name: 'DSPy.ts API reference', description: 'TypeDoc output (run `npm run docs`).', mimeType: 'text/markdown' },
  { uri: 'dspy://examples', name: 'DSPy.ts examples', description: 'Runnable examples — classification, CoT, ReAct, MIPROv2, GEPA, retrieve.', mimeType: 'text/markdown' },
  { uri: 'dspy://signature-design', name: 'Signature design guide', mimeType: 'text/markdown' },
  { uri: 'dspy://metric-design', name: 'Metric design guide', mimeType: 'text/markdown' },
];
module.exports = { TOOLS, RESOURCES };
// TODO: wire @modelcontextprotocol/sdk StdioServerTransport; implement handlers
//       that call `npx ts-node` against src/dspy/* and dspy.ts optimizers.
if (require.main === module) {
  process.stderr.write('[dspy-core mcp] scaffold — implement the MCP stdio transport + handlers. Tools: ' + TOOLS.map(t => t.name).join(', ') + '\n');
}
