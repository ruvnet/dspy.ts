---
description: List the optimizer compile runs recorded in an AgentDB trace store, and drill into one — its trials, scores, params, and the causal chain to the best candidate.
argument-hint: "<path/to/agentdb> [--run <runId>] [--chain] [--limit N]"
---
Open the `AgentDBClient` trace store at `<path>` and report its `CompilationTracer` runs. Parse `$ARGUMENTS` for the store path, optional `--run <runId>`, `--chain` (show only the causal chain), `--limit`.

1. `const store = new AgentDBClient({ vectorDimension: 64, storage: { path } }); await store.init(); const tracer = new CompilationTracer({ store });`
2. No `--run`: list `tracer.runIds` / `tracer.runCount` — for each, the optimizer, params, best score, trial count, start/end (`compile-run` / `compile-run-end` records).
3. `--run <id>`: `tracer.getTrace(runId)` — every trial in order: `{ label, params, score, causedBy }`. With `--chain`: `tracer.causalChain(runId)` only — the trial lineage that produced the best.
4. `store.getStats()` for store size. This is the "what did the optimizer actually try" view — pair it with `/dspy-trace` to generate new runs.
