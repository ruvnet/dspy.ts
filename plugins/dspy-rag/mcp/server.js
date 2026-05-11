#!/usr/bin/env node
/**
 * dspy-rag MCP server — exposes DSPy.ts retrieval-augmented generation as MCP tools.
 * Tools: dspy_index (chunk + embed + store a corpus in AgentDB), dspy_retrieve
 * (top-k + MMR for a query), dspy_rag_run (run a Retrieve→ChainOfThought program),
 * dspy_corpus_status (corpus stats: vectors, dimension, tiers, quantization).
 * Resources: dspy://chunking-strategy, dspy://grounding-and-citations, dspy://corpus/{path}/stats.
 *
 * Scaffold: handlers shell out to `npx ts-node` against src/dspy/* and dspy.ts
 * (RetrieveModule, ChainOfThought, Pipeline, AgentDBClient). Flesh out the
 * @modelcontextprotocol/sdk stdio wiring + handlers.
 */
'use strict';
const TOOLS = [
  { name: 'dspy_index', description: 'Build/extend an AgentDB RAG corpus: chunk documents (size/overlap), embed (ONNX 384-dim, hashEmbed fallback), store with HNSW + optional RaBitQ + tier. Returns {documents, chunks, totalVectors, tierCounts}.', inputSchema: { type: 'object', properties: { corpusPath: { type: 'string' }, source: { type: 'string', description: 'dir | glob | file' }, chunkSize: { type: 'number' }, overlap: { type: 'number' }, tier: { type: 'string', enum: ['working', 'short', 'long'] }, rabitq: { type: 'boolean' } }, required: ['corpusPath', 'source'] } },
  { name: 'dspy_retrieve', description: 'Query an AgentDB RAG corpus the way RetrieveModule would: top-k passages with scores, MMR diversity rerank over an over-fetched candidate set, and the assembled context string.', inputSchema: { type: 'object', properties: { corpusPath: { type: 'string' }, query: { type: 'string' }, k: { type: 'number' }, mmrLambda: { type: 'number' }, useMMR: { type: 'boolean' }, overFetchFactor: { type: 'number' } }, required: ['corpusPath', 'query'] } },
  { name: 'dspy_rag_run', description: 'Run a DSPy.ts RAG program (a Pipeline of RetrieveModule → ChainOfThought) on a question; returns {answer, citations, passages, context}.', inputSchema: { type: 'object', properties: { program: { type: 'string', description: 'src/dspy/<program>.ts' }, question: { type: 'string' } }, required: ['program', 'question'] } },
  { name: 'dspy_corpus_status', description: 'AgentDB corpus stats: totalVectors, vectorDimension, tier counts, RaBitQ quantization info.', inputSchema: { type: 'object', properties: { corpusPath: { type: 'string' } }, required: ['corpusPath'] } },
];
const RESOURCES = [
  { uri: 'dspy://chunking-strategy', name: 'Chunking strategy guide', description: 'Chunk size/overlap/metadata/tier choices for a DSPy.ts + AgentDB RAG corpus.', mimeType: 'text/markdown' },
  { uri: 'dspy://grounding-and-citations', name: 'Grounding & citations guide', description: 'Answerer signature/prompt/metric for grounded, cited RAG answers.', mimeType: 'text/markdown' },
  { uri: 'dspy://corpus/{path}/stats', name: 'Corpus stats', description: 'Live AgentDB corpus stats for a given path.', mimeType: 'application/json' },
];
module.exports = { TOOLS, RESOURCES };
// TODO: wire @modelcontextprotocol/sdk StdioServerTransport; handlers shell out to
//       `npx ts-node` against src/dspy/* and dspy.ts (RetrieveModule, ChainOfThought, Pipeline, AgentDBClient).
if (require.main === module) {
  process.stderr.write('[dspy-rag mcp] scaffold — handlers shell out to `npx ts-node` against src/dspy/* and dspy.ts. Tools: ' + TOOLS.map(t => t.name).join(', ') + '\n');
}
