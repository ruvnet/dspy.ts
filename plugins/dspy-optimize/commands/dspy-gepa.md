---
description: Evolve a DSPy.ts program's prompt with GEPA — reflective mutation of a Pareto frontier, targeting the lowest-scoring examples each iteration; optionally persists the frontier to AgentDB so a later run continues the evolution.
argument-hint: "<program> [trainset: data.json] [--iterations N] [--mutations N] [--frontier N] [--store path/to/agentdb]"
---
Evolve `src/dspy/<program>.ts` with `GEPA`. Parse `$ARGUMENTS` for the program, a trainset JSON, `--iterations` (default 12), `--mutations` (mutations per step, default 2), `--frontier` (frontier size, default 8), `--store` (AgentDB path → `frontierStore`).

1. Load the program + `metric` (GEPA leans hard on a good, graded metric — see the `metric-design` skill in `dspy-core`) + the trainset.
2. `const store = storePath ? new AgentDBClient({ storage: { path: storePath } }) : undefined; await store?.init();`
3. `const opt = new GEPA(metric, { numIterations, mutationsPerStep, frontierSize, frontierStore: store, seed: 42 });`
4. `const compiled = await opt.compile(program, trainset);`
5. `opt.save('src/dspy/<program>.gepa.json');`
6. Report `opt.result` — `{ best.instruction, best.meanScore, frontier.length, reflections (from → weakExamples → mutated per iteration), iterations, warmStarted }`. Show the frontier (instruction + meanScore) so the user can pick a different non-dominated candidate.
7. Re-run with the same `--store` → `warmStarted: true`, evolution continues from the persisted frontier.
