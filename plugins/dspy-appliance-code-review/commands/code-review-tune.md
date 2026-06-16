---
description: Tune the code-review appliance's reviewer with GEPA (reflective Pareto evolution) against labelled past reviews and the actionability metric — so it catches the real issues, stays specific, and doesn't false-alarm on clean PRs.
argument-hint: "<reviews.json> [--program src/dspy/code-reviewer.ts] [--iterations N] [--frontier .dspy/review-frontier] [--cache .dspy/review-cache] [--mipro]"
---
Optimize the `reviewer` `ChainOfThought` in `src/dspy/code-reviewer.ts`. Parse `$ARGUMENTS` for the labelled set (`[{ input:{diff, intent?}, output:{knownIssues:[{severity, near}], verdict:'ship'|'changes'|'blocked'} }]`), `--program`, `--iterations` (GEPA iterations, default 12), `--frontier` (AgentDB path → `frontierStore`, persists/continues the evolution), `--cache` (AgentDB path → `CachingLM`), `--mipro` (use MIPROv2 instead of GEPA — faster, less aggressive).

1. Build a *training* program: `RetrieveModule(context) → reviewer`, so each example is scored end-to-end (context retrieval + review) via `actionabilityMetric`.
2. Optional: `configureLM(new CachingLM(getLM(), { store: cacheClient, similarityThreshold: 0.985, embed: 'model' }))` — the search makes many near-identical prompts.
3. `--mipro`: `new MIPROv2(actionabilityMetric, { numTrials: iterations, replayStore: store, tracer: new CompilationTracer({ store }) })`. Else: `new GEPA(actionabilityMetric, { numIterations, mutationsPerStep: 2, frontierStore: store })` (recommended — reviews benefit from the prompt genuinely evolving against the weakest cases).
4. `const tuned = await opt.compile(trainingProgram, reviewsSet);` → `opt.save('src/dspy/code-reviewer.gepa.json');`
5. Report `opt.result` (best meanScore; for GEPA the frontier — instruction + meanScore — and the reflections; `warmStarted`), and the delta vs the raw reviewer on a held-out slice. Flat scores ⇒ the labelled set or the metric (do your `knownIssues.near` markers actually match? do you have both `ship` and `changes`/`blocked` cases?), not the budget. For ongoing improvement across releases, this is exactly `dspy-evolution`'s territory — `/dspy-evolve` with a held-out review benchmark.
