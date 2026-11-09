---
description: Tune the support-bot's answerer with MIPROv2 against a Q/A set and the appliance's quality metric (helpfulness + groundedness + honest "I don't know"), with AgentDB experience replay and a CompilationTracer.
argument-hint: "<qa-set.json> [--program src/dspy/support-bot.ts] [--trials N] [--replay .dspy/support-replay] [--cache .dspy/support-cache]"
---
Optimize the `answerer` `ChainOfThought` in `src/dspy/support-bot.ts`. Parse `$ARGUMENTS` for the Q/A set (`[{ input:{question}, output:{answer?, answerable?} }]` — include `answerable:false` cases), `--program`, `--trials` (default 12), `--replay` (AgentDB path → `replayStore`, warm-starts re-tunes), `--cache` (AgentDB path → wrap the LM in `CachingLM`).

1. Build a *training* program: `RetrieveModule(KB) → answerer`, so each Q/A example is scored end-to-end (retrieval + answer) via `supportMetric` from the appliance module.
2. Optional: `configureLM(new CachingLM(getLM(), { store: cacheClient, similarityThreshold: 0.98, embed: 'model' }))`.
3. `const store = replayPath ? new AgentDBClient({ vectorDimension: 64, storage: { path: replayPath } }) : undefined; await store?.init(); const tracer = new CompilationTracer({ store });`
4. `const opt = new MIPROv2(supportMetric, { numTrials, numCandidateInstructions: 6, replayStore: store, replayTopK: 3, tracer }); const tuned = await opt.compile(trainingProgram, qaSet);`
5. `opt.save('src/dspy/support-bot.optimized.json');` — load it in `support-bot-ask` via `opt.load(...)` to swap in the tuned answerer.
6. Report `opt.result` (best score, trials, `warmStarted`), the trial trace (`tracer.causalChain(runId)`), and the score delta vs the raw answerer on a held-out slice. If scores are flat, look at the metric/Q-A set before adding trials (and make sure you've got `answerable:false` cases — without them the bot learns to always answer). For more aggressive prompt evolution, run `dspy-evolution`'s `/dspy-evolve` against a held-out benchmark instead.
