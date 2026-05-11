#!/usr/bin/env node
/**
 * dspy-appliance-code-review MCP server — a pre-wired DSPy.ts code-review pipeline.
 * Tools: code_review_init (scaffold the appliance + build the repo-context index),
 * code_review_run (retrieve repo context for a diff + ChainOfThought structured review),
 * code_review_tune (GEPA/MIPROv2-tune the reviewer against labelled reviews + the actionability metric),
 * code_review_status (context index stats + whether a tuned reviewer is loaded).
 * Resources: dspy://code-reviewer/template, dspy://review-context-indexing, dspy://review-actionability-metric.
 *
 * Scaffold: handlers shell out to `npx ts-node` against src/dspy/* (the copied appliance)
 * and dspy.ts (RetrieveModule, ChainOfThought, Pipeline, AgentDBClient, GEPA, MIPROv2,
 * CachingLM, CompilationTracer). Flesh out the @modelcontextprotocol/sdk stdio wiring + handlers.
 */
'use strict';
const TOOLS = [
  { name: 'code_review_init', description: 'Scaffold the DSPy.ts code-review appliance into a repo: copy the program template to src/dspy/code-reviewer.ts (+ spec), build the AgentDB repo-context index (conventions, ADRs, representative modules, prior PR reviews). Returns created paths + index stats.', inputSchema: { type: 'object', properties: { dest: { type: 'string' }, contextPath: { type: 'string' }, include: { type: 'string', description: 'comma globs of repo material to index' }, priorReviews: { type: 'string', description: 'JSON of past PR reviews to index' } } } },
  { name: 'code_review_run', description: 'Review a diff or file: retrieves relevant repo context (conventions, related code, prior reviews), produces a structured review. Returns {summary, findings:[{severity,location,issue,suggestion}], questions, passages, context}.', inputSchema: { type: 'object', properties: { target: { type: 'string', description: 'path to a .diff/.patch, a source file, or "-" for git diff/stdin' }, intent: { type: 'string' }, program: { type: 'string' }, severityMin: { type: 'string', enum: ['nit', 'minor', 'major', 'blocker'] } }, required: ['target'] } },
  { name: 'code_review_tune', description: 'Tune the code-review reviewer with GEPA (or MIPROv2) against a labelled set ([{input:{diff,intent?}, output:{knownIssues:[{severity,near}], verdict}}]) and the actionability metric (coverage − noise, specificity, calibration; false alarms on clean PRs penalised). Saves <program>.gepa.json; returns {bestScore, frontier|trials, reflections, warmStarted, delta}.', inputSchema: { type: 'object', properties: { reviewsSet: { type: 'string' }, program: { type: 'string' }, iterations: { type: 'number' }, frontierPath: { type: 'string' }, cachePath: { type: 'string' }, useMipro: { type: 'boolean' } }, required: ['reviewsSet'] } },
  { name: 'code_review_status', description: 'Code-review appliance status: repo-context AgentDB index stats (vectors, dimension, tiers, quantization) and whether a tuned reviewer (<program>.gepa.json / .optimized.json) is present.', inputSchema: { type: 'object', properties: { contextPath: { type: 'string' }, program: { type: 'string' } } } },
];
const RESOURCES = [
  { uri: 'dspy://code-reviewer/template', name: 'Code-reviewer program template', description: 'The DSPy.ts code-review appliance source — RetrieveModule → ChainOfThought + actionabilityMetric.', mimeType: 'text/typescript' },
  { uri: 'dspy://review-context-indexing', name: 'Review context indexing guide', description: 'What to index (conventions/ADRs/representative code/prior reviews), metadata, tiers, retrieval tuning.', mimeType: 'text/markdown' },
  { uri: 'dspy://review-actionability-metric', name: 'Review actionability metric guide', description: 'How a review is scored, building a non-nitpicky labelled set, tuning and validating.', mimeType: 'text/markdown' },
];
module.exports = { TOOLS, RESOURCES };
// TODO: wire @modelcontextprotocol/sdk StdioServerTransport; handlers shell out to
//       `npx ts-node` against src/dspy/* and dspy.ts (RetrieveModule, ChainOfThought, Pipeline, AgentDBClient, GEPA, MIPROv2, CachingLM, CompilationTracer).
if (require.main === module) {
  process.stderr.write('[dspy-appliance-code-review mcp] scaffold — handlers shell out to `npx ts-node` against src/dspy/* and dspy.ts. Tools: ' + TOOLS.map(t => t.name).join(', ') + '\n');
}
