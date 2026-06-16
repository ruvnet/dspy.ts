---
description: Inspect a DSPy.ts evolution store — the learning curve across generations, the current Pareto frontier, the reflections that drove each mutation, and warm-start lineage.
argument-hint: "<path/to/agentdb> [--curve] [--frontier] [--reflections] [--gen N]"
---
Open the `AgentDBClient` evolution store at `<path>` and report what `/dspy-evolve` has accumulated. Parse `$ARGUMENTS` for the store path, optional `--gen N`, and which views (default: all).

1. `const store = new AgentDBClient({ vectorDimension: 64, storage: { path } }); await store.init(); const tracer = new CompilationTracer({ store });`
2. `--curve` — the per-generation best `meanScore` from the `gen-result` / `benchmark-result` records: the learning curve. Flat ⇒ benchmark/metric problem (see the `benchmark-design` skill).
3. `--frontier` — the current non-dominated `gepa-candidate` set: each `{ instruction, meanScore, perExampleScores }`. The user can pick a different non-dominated candidate (e.g. one that's slightly lower mean but stronger on a sub-slice they care about).
4. `--reflections` — for `--gen N` (or all): the GEPA reflections — `{ from, weakExamples, mutated }` — i.e. *why* each instruction was changed. This is the "what did it learn and how" trail.
5. `--gen N` also shows that generation's `causalChain` via the tracer (which trials led to that gen's best). `store.getStats()` / `tierCounts()` for size.
