#!/usr/bin/env node
/**
 * dspy-appliance-support-bot MCP server — a pre-wired DSPy.ts support assistant.
 * Tools: support_bot_init (scaffold the appliance into a repo + create the AgentDB KB),
 * support_bot_ask (retrieve KB passages + ChainOfThought answer with citations),
 * support_bot_tune (MIPROv2-tune the answerer against a Q/A set + the quality metric),
 * support_bot_status (KB stats + whether a tuned answerer is loaded).
 * Resources: dspy://support-bot/template (the program template), dspy://support-kb-curation,
 * dspy://support-answer-quality.
 *
 * Scaffold: handlers shell out to `npx ts-node` against src/dspy/* (the copied appliance)
 * and dspy.ts (RetrieveModule, ChainOfThought, Pipeline, AgentDBClient, MIPROv2,
 * CachingLM, CompilationTracer). Flesh out the @modelcontextprotocol/sdk stdio wiring + handlers.
 */
'use strict';
const TOOLS = [
  { name: 'support_bot_init', description: 'Scaffold the DSPy.ts support-bot appliance into a repo: copy the program template to src/dspy/support-bot.ts (+ spec), create the AgentDB knowledge base, optionally index a docs dir/glob. Returns the created paths + KB stats.', inputSchema: { type: 'object', properties: { dest: { type: 'string' }, kbPath: { type: 'string' }, docs: { type: 'string', description: 'dir | glob of KB documents to index now' } } } },
  { name: 'support_bot_ask', description: 'Ask the support-bot a question: retrieves KB passages (MMR), answers with ChainOfThought grounded in them. Returns {answer, citations, passages:[{rank,score,source,snippet}], context}.', inputSchema: { type: 'object', properties: { question: { type: 'string' }, program: { type: 'string' }, k: { type: 'number' } }, required: ['question'] } },
  { name: 'support_bot_tune', description: 'Tune the support-bot answerer with MIPROv2 against a Q/A set ([{input:{question}, output:{answer?, answerable?}}]) and the appliance quality metric (helpfulness + groundedness + honest "I don\'t know"); AgentDB replay store + CompilationTracer. Saves <program>.optimized.json; returns {bestScore, trials, warmStarted, delta, causalChain}.', inputSchema: { type: 'object', properties: { qaSet: { type: 'string' }, program: { type: 'string' }, numTrials: { type: 'number' }, replayPath: { type: 'string' }, cachePath: { type: 'string' } }, required: ['qaSet'] } },
  { name: 'support_bot_status', description: 'Support-bot status: KB AgentDB stats (vectors, dimension, tier counts, quantization), and whether a tuned answerer (<program>.optimized.json) is present.', inputSchema: { type: 'object', properties: { kbPath: { type: 'string' }, program: { type: 'string' } } } },
];
const RESOURCES = [
  { uri: 'dspy://support-bot/template', name: 'Support-bot program template', description: 'The DSPy.ts support-bot appliance source — RetrieveModule → ChainOfThought + supportMetric.', mimeType: 'text/typescript' },
  { uri: 'dspy://support-kb-curation', name: 'Support KB curation guide', description: 'Chunking, citation metadata, coverage, tiers for a support-bot knowledge base.', mimeType: 'text/markdown' },
  { uri: 'dspy://support-answer-quality', name: 'Support answer quality guide', description: 'The quality metric, building a non-bluffing Q/A set, tuning and validating.', mimeType: 'text/markdown' },
];
module.exports = { TOOLS, RESOURCES };
// TODO: wire @modelcontextprotocol/sdk StdioServerTransport; handlers shell out to
//       `npx ts-node` against src/dspy/* and dspy.ts (RetrieveModule, ChainOfThought, Pipeline, AgentDBClient, MIPROv2, CachingLM, CompilationTracer).
if (require.main === module) {
  process.stderr.write('[dspy-appliance-support-bot mcp] scaffold — handlers shell out to `npx ts-node` against src/dspy/* and dspy.ts. Tools: ' + TOOLS.map(t => t.name).join(', ') + '\n');
}
