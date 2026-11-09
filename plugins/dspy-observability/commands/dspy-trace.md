---
description: Run an optimizer compile with a CompilationTracer attached, persisting every trial to AgentDB (with causedBy links), then print the run summary and the causal chain to the best candidate.
argument-hint: "<program> <optimizer: mipro|gepa> [trainset: data.json] [--store path/to/agentdb] [--mlflow]"
---
Compile `src/dspy/<program>.ts` under a `CompilationTracer`. Parse `$ARGUMENTS` for the program, the optimizer (`mipro`/`gepa`), a trainset JSON, `--store` (an AgentDB path for the trace; default `.dspy/traces`), `--mlflow` (also mirror runs/metrics to MLflow if `@mlflow/tracking` is installed).

1. `const store = new AgentDBClient({ vectorDimension: 64, storage: { path: tracePath } }); await store.init();`
   `const tracer = new CompilationTracer({ store, mlflow });`
2. Build the optimizer with the tracer: `new MIPROv2(metric, { numTrials, tracer, replayStore: store })` or `new GEPA(metric, { numIterations, frontierStore: store /* tracer hooks too */ })`.
3. `await opt.compile(program, trainset);`
4. Print: the `runId`, `tracer.getTrace(runId)` (each `compile-trial` with `{label, params, score, causedBy}`), and `tracer.causalChain(runId)` — the path of trials leading to the best. Note `tracer.mlflowAvailable`.
5. `opt.save('src/dspy/<program>.optimized.json');` — the saved file also carries the trial trace. Inspect later with `/dspy-runs`.
