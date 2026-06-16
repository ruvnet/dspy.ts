# dspy-observability — for Codex / MCP clients

This plugin ships an MCP server (`mcp/server.js`, command `node ${CLAUDE_PLUGIN_ROOT}/mcp/server.js`) for DSPy.ts tracing and caching.

**Tools**
- `dspy_trace` — compile a program with a `CompilationTracer` attached; trials are persisted to AgentDB with `causedBy` links. Returns `{runId, trials, causalChain, bestScore, mlflowAvailable}`.
- `dspy_runs` — list the compile runs in an AgentDB trace store (or inspect one): optimizer, params, best score, trial count, start/end.
- `dspy_run_chain` — the `causalChain` (causedBy lineage) of trials that produced the best candidate for a `runId`.
- `dspy_cache_stats` — `CachingLM` hit-rate (`{hits, misses, hitRate, entries}`) plus the backing AgentDB store stats.

**Resources**: `dspy://compile-tracing`, `dspy://llm-caching`, `dspy://traces/{runId}`.

Handlers shell out to `npx ts-node` against `src/dspy/*` and `dspy.ts`. Slash commands `/dspy-trace`, `/dspy-runs`, `/dspy-cache` wrap the same flows interactively; the `observability-engineer` agent attaches tracing/caching, reads traces, and explains why an optimizer landed where it did. Pairs with `dspy-optimize` (attach the tracer to `/dspy-mipro`/`/dspy-gepa`; wrap the LM with `CachingLM` before a big search).
