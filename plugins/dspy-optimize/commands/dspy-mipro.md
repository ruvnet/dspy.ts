---
description: Compile a DSPy.ts program with MIPROv2 — instruction proposal + demo bootstrapping + seeded search — optionally with an AgentDB experience-replay store so later compiles of the same task warm-start from the prior best.
argument-hint: "<program> [trainset: data.json] [--trials N] [--candidates N] [--replay path/to/agentdb] [--trace]"
---
Optimize `src/dspy/<program>.ts` with `MIPROv2`. Parse `$ARGUMENTS` for the program, a trainset JSON (`[{input, output?}]`), `--trials` (default 12), `--candidates` (instruction candidates, default ~10), `--replay` (an AgentDB path → an `AgentDBClient` used as `replayStore`), and `--trace` (attach a `CompilationTracer`).

1. Load the program + its `metric` + the trainset.
2. `const store = replayPath ? new AgentDBClient({ storage: { path: replayPath } }) : undefined; await store?.init();`
   `const tracer = trace ? new CompilationTracer({ store }) : undefined;`
3. `const opt = new MIPROv2(metric, { numTrials, numCandidateInstructions, replayStore: store, replayTopK: 3, tracer, seed: 42 });`
4. `const compiled = await opt.compile(program, trainset);`
5. `opt.save('src/dspy/<program>.optimized.json');`
6. Report `opt.result` — `{ instruction, demos.length, score, trials.length, warmStarted, recalledInstructions }`. If `--trace`, print the trial trace and `tracer.causalChain(runId)`.
7. Re-run later with the same `--replay` path → `warmStarted: true` and the search seeds from the prior best instruction.
