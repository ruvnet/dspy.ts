# dspy-evolution — for Codex / MCP clients (exotic)

This plugin ships an MCP server (`mcp/server.js`, command `node ${CLAUDE_PLUGIN_ROOT}/mcp/server.js`) for multi-generation GEPA self-evolution of DSPy.ts programs. It's the exotic, expensive tool — reach for it only when a single `/dspy-mipro`/`/dspy-gepa` compile has plateaued.

**Tools**
- `dspy_evolve` — run an N-generation GEPA evolution against a *held-out* benchmark: each generation reflects on the weakest cases, mutates instructions, keeps the Pareto frontier (persisted to AgentDB → warm-starts next run), optionally explores structural variants (`ChainOfThought → ReAct`, prepend `RetrieveModule`, split into a `Pipeline`). Always pass `cachePath` — evolution makes thousands of near-identical prompts.
- `dspy_benchmark_run` — score a program (raw/optimized/evolved) over a held-out dataset using its metric; mean + worst-N + variant deltas; records the result.
- `dspy_evolution_status` — the learning curve across generations, the reflections (`{from, weakExamples, mutated}`) that drove each mutation, warm-start lineage, a generation's causalChain.
- `dspy_frontier_inspect` — the current non-dominated frontier (candidates + per-example scores) to pick a deployable alternative.

**Resources**: `dspy://benchmark-design`, `dspy://self-evolution-loop`, `dspy://evolution/{path}/frontier`.

Handlers shell out to `npx ts-node` against `src/dspy/*` and `dspy.ts` (GEPA, CachingLM, CompilationTracer, AgentDBClient). Slash commands `/dspy-evolve`, `/dspy-benchmark`, `/dspy-evolution-status` wrap the same flows; the `evolution-coordinator` agent runs full campaigns — designs the benchmark, sets generations, decides when to explore structure, reads the curve, decides when to stop. Builds on `dspy-optimize` (GEPA) and `dspy-observability` (tracer, cache).
