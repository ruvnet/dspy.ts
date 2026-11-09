---
description: Run a multi-generation GEPA self-evolution of a DSPy.ts program against a held-out benchmark — reflect on the weakest cases, mutate instructions, keep the Pareto frontier, persist it to AgentDB, and resume next time.
argument-hint: "<program> <benchmark: dataset.json> [--generations N] [--iterations-per-gen N] [--mutations N] [--frontier N] [--store path/to/agentdb] [--cache path/to/agentdb] [--explore-modules]"
---
Evolve `src/dspy/<program>.ts`. Parse `$ARGUMENTS` for the program, the benchmark dataset (`[{input, output?}]` — see the `benchmark-design` skill), `--generations` (default 5), `--iterations-per-gen` (GEPA iterations within a generation, default 10), `--mutations` (per step, default 2), `--frontier` (frontier size, default 8), `--store` (AgentDB path → the persistent `frontierStore`; default `.dspy/evolution`), `--cache` (an AgentDB path → wrap the LM in `CachingLM` — strongly recommended, evolution makes thousands of near-identical prompts), `--explore-modules` (also try swapping the answerer module / inserting a Retrieve step between generations — exotic).

1. Set up: `const store = new AgentDBClient({ vectorDimension: 64, storage: { path: storePath } }); await store.init();`
   if `--cache`: `const cache = new AgentDBClient({ vectorDimension: 384, storage: { path: cachePath } }); await cache.init(); configureLM(new CachingLM(getLM(), { store: cache, similarityThreshold: 0.985, embed: 'model' }));`
   `const tracer = new CompilationTracer({ store });`
2. Load the program + its `metric` + the benchmark; split a fixed `eval` slice.
3. For `g` in `1..generations`:
   - `const gepa = new GEPA(metric, { numIterations: iterationsPerGen, mutationsPerStep, frontierSize, frontierStore: store, seed: 42 + g });`
   - `const evolved = await gepa.compile(programForGen, evalSlice);` — `g > 1` ⇒ `gepa.result.warmStarted === true` (the frontier persists in `store`).
   - Record generation `g`'s best `meanScore` (and the frontier) via the tracer / a `gen-result` record. If `--explore-modules`, between generations propose a structural variant (e.g. `ChainOfThought → ReAct`, or prepend a `RetrieveModule`) and let the next generation's GEPA evolve *that* too — keep it only if it dominates.
   - `programForGen = gepa.compiledProgram` (carry the best forward).
4. Stop early if the best `meanScore` hasn't improved for 2 generations (the frontier has converged).
5. `gepa.save('src/dspy/<program>.evolved.json');` Report: per-generation best scores (the learning curve), the final frontier (instruction + meanScore, so the user can pick a non-dominated alternative), `result.warmStarted`, total LM calls (and cache `hitRate`). Re-run with the same `--store` ⇒ evolution continues from where it stopped.
