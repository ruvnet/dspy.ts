# dspy-rag — for Codex / MCP clients

This plugin ships an MCP server (`mcp/server.js`, command `node ${CLAUDE_PLUGIN_ROOT}/mcp/server.js`) for DSPy.ts retrieval-augmented generation over AgentDB.

**Tools**
- `dspy_index` — chunk documents (size/overlap), embed (ONNX 384-dim, hashEmbed fallback), store in an AgentDB corpus with HNSW indexing, optional RaBitQ quantization, and a tier (`working`/`short`/`long`).
- `dspy_retrieve` — query a corpus the way `RetrieveModule` would: top-k passages + scores, MMR diversity rerank over an over-fetched candidate set, and the assembled context string. Use this to debug retrieval before tuning the answerer.
- `dspy_rag_run` — run a DSPy.ts RAG program (`Pipeline` of `RetrieveModule → ChainOfThought`) on a question; returns `{answer, citations, passages, context}`.
- `dspy_corpus_status` — corpus stats (vectors, dimension, tier counts, quantization).

**Resources**: `dspy://chunking-strategy`, `dspy://grounding-and-citations`, `dspy://corpus/{path}/stats`.

Handlers shell out to `npx ts-node` against `src/dspy/*` and `dspy.ts`. Slash commands `/dspy-index`, `/dspy-rag-new`, `/dspy-retrieve` wrap the same flows interactively; the `rag-architect` agent designs+builds a full pipeline (corpus → RetrieveModule → ChainOfThought → grounding metric), then hand off to `dspy-optimize`'s `/dspy-mipro`/`/dspy-gepa` to tune the answerer.
