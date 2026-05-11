---
description: Compile a DSPy.ts program with BootstrapFewShot — labeled + self-bootstrapped demos — optionally with input-conditioned dynamic demo selection backed by an AgentDB vector store (the compiled module picks the demos nearest the current input at run time).
argument-hint: "<program> [trainset: data.json] [--labeled N] [--bootstrapped N] [--dynamic path/to/agentdb] [--k N]"
---
Optimize `src/dspy/<program>.ts` with `BootstrapFewShot`. Parse `$ARGUMENTS` for the program, a trainset JSON, `--labeled` (max labeled demos), `--bootstrapped` (max self-bootstrapped demos), `--dynamic` (AgentDB path → `dynamicDemos.store`), `--k` (demos picked per input, default 1–2).

1. Load the program + `metric` + the trainset.
2. `const store = dynamicPath ? new AgentDBClient({ storage: { path: dynamicPath } }) : undefined; await store?.init();`
3. `const opt = new BootstrapFewShot(metric, { maxLabeledDemos, maxBootstrappedDemos, dynamicDemos: store ? { store, k } : undefined });`
4. `const compiled = await opt.compile(program, trainset);` → a `BootstrapOptimizedModule`.
5. `opt.save('src/dspy/<program>.bootstrap.json');`
6. If `--dynamic`: show that `await compiled.selectDemos(input)` returns the k-nearest demos for a given input, and `await compiled.run(input)` builds the prompt from just those (not a fixed set). Otherwise `selectDemos` returns the full fixed set.
