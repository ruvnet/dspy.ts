---
description: Optimize a DSPy.ts program with an optimizer (BootstrapFewShot / MIPROv2 / GEPA) against its metric + a trainset, and save the optimized program.
argument-hint: "<program-name> [optimizer: bootstrap|mipro|gepa] [trainset: path/to/data.json]"
---
Compile (optimize) the DSPy.ts program at `src/dspy/<name>.ts`. Parse `$ARGUMENTS` for the program name, optimizer (default `mipro`), and a trainset JSON path (`[{ input, output? }]`).

1. Load the program + its `metric` from `src/dspy/<name>.ts`; load the trainset.
2. Build the optimizer:
   - `bootstrap` → `new BootstrapFewShot(metric, { maxLabeledDemos, maxBootstrappedDemos })`
   - `mipro` → `new MIPROv2(metric, { numTrials, numCandidateInstructions, replayStore?, tracer? })`
   - `gepa` → `new GEPA(metric, { numIterations, mutationsPerStep, frontierStore? })`
   (offer to wire an `AgentDBClient` for `replayStore` / `frontierStore` so the search warm-starts across runs, and a `CompilationTracer` for the trial trace.)
3. `const compiled = await optimizer.compile(program, trainset);`
4. `optimizer.save('src/dspy/<name>.optimized.json')`; report the best score / trial trace (`optimizer.result`).
5. Show how to load it: `optimizer.load('src/dspy/<name>.optimized.json')`.
