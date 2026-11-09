---
name: experience-replay
version: "0.1.0"
author: rUv
tags: [dspy, agentdb, experience-replay, warm-start, miprov2, gepa]
description: >
  How DSPy.ts optimizers use an AgentDBClient to remember prior compiles — MIPROv2 `replayStore` (warm-start from prior best instruction), GEPA `frontierStore` (persist + continue the Pareto frontier), BootstrapFewShot `dynamicDemos` (input-conditioned demos).
  Use when: you re-compile a program over time, or want one program's optimization to benefit the next.
---
# Experience replay with AgentDB

DSPy.ts optimizers can take an `AgentDBClient` and persist their search so the *next* compile of the same task starts ahead.

## Set up a store
```ts
import { AgentDBClient } from 'dspy.ts';
const store = new AgentDBClient({
  vectorDimension: 64,                 // small is fine for fingerprints/instructions
  storage: { path: '.dspy/replay' },   // or { inMemory: true } for tests
  performance: { maxConcurrency: 1, cacheSize: 8, batchEnabled: true /*, quantization: 'rabitq', rerankFactor: 3 */ },
});
await store.init();
```

## Wire it
- **MIPROv2** — `new MIPROv2(metric, { numTrials, replayStore: store, replayTopK: 3, tracer: new CompilationTracer({ store }) })`. The optimizer keys by a task fingerprint (signature + program name); a later compile recalls the top-`replayTopK` prior best instructions and seeds the search with them → `result.warmStarted === true`, `result.recalledInstructions >= 1`. Stores one `mipro-best` record per compile.
- **GEPA** — `new GEPA(metric, { numIterations, frontierStore: store })`. Persists `gepa-candidate` records; a later run rebuilds the frontier from them and keeps evolving → `result.warmStarted === true`.
- **BootstrapFewShot** — `new BootstrapFewShot(metric, { dynamicDemos: { store, k: 1 } })`. The compiled `BootstrapOptimizedModule` indexes the demos (`store.hashEmbed` → vectors) and, at run time, `selectDemos(input)` returns the k-nearest — the prompt is built from those, not a fixed set.

## Notes
- A **different** program (different fingerprint) never pulls another task's history.
- Without a store, every compile is a cold start (`warmStarted: false`).
- For real semantic recall over text (not just hash fingerprints), an `AgentDBClient` initialized with an embedding service uses ONNX 384-dim embeddings; HNSW + RaBitQ + tiered storage (`working`/`short`/`long`, `searchTiered`, `promote`) keep it fast as the store grows.
- The `CompilationTracer` shares the same store — `compile-run` / `compile-trial` / `compile-run-end` records, with `causedBy` links you can walk via `tracer.causalChain(runId)`.
