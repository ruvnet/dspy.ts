---
name: self-evolution-loop
version: "0.1.0"
author: rUv
tags: [dspy, evolution, gepa, pareto, agentdb, exotic]
description: >
  How DSPy.ts self-evolution works — multi-generation GEPA with a persistent AgentDB Pareto frontier, warm-start across runs, LM caching, and optional structural exploration.
  Use when: running or designing a `/dspy-evolve` campaign, or deciding generations / when to explore structure.
---
# The self-evolution loop

`/dspy-evolve` runs GEPA generation after generation, each one continuing from the last via a persistent frontier in AgentDB.

## The loop
```
for g in 1..generations:
  gepa = new GEPA(metric, { numIterations, mutationsPerStep, frontierSize,
                            frontierStore: persistentStore, seed: 42+g })
  evolved = await gepa.compile(programForGen, reflectionSlice)   # g>1 ⇒ warmStarted
  recordGeneration(g, gepa.result.best.meanScore, gepa.result.frontier)
  if exploreModules and curveStalled: programForGen = proposeStructuralVariant(evolved)  # exotic
  else: programForGen = evolved
  if best meanScore hasn't improved for 2 generations: break
gepa.save('<program>.evolved.json')
```
- **Frontier persistence** — `frontierStore` is an `AgentDBClient`; GEPA writes `gepa-candidate` records and, on a later compile of the same task fingerprint, rebuilds the non-dominated set from them → `result.warmStarted === true`. That's what makes "generation 6 tomorrow" pick up where generation 5 left off.
- **Reflection slice ≠ benchmark** — GEPA reflects on the weakest examples of the slice you pass it; the held-out *benchmark* (`/dspy-benchmark`) is what you score generations against. Keep them disjoint (see `benchmark-design`).
- **Cache the LM** — `CachingLM` (`embed: 'model'`, threshold ~0.985) over a persistent store. Generations produce thousands of prompts that differ only in the instruction prefix; the cache makes that affordable. Track `hitRate`.
- **Tracer** — share the store with a `CompilationTracer` for a per-generation `causalChain`.

## Structural exploration (the exotic part)
Between generations, when the prompt-only curve has stalled, propose a change to the program's *structure*:
- `ChainOfThought → ReAct` + a tool registry — when the task needs lookup/computation the prompt can't supply.
- Prepend a `RetrieveModule` (→ a `Pipeline`) — when answers should be grounded in a corpus.
- Split a fat module into a `Pipeline` of focused ones — when one signature is doing too much.
Let the next generation's GEPA evolve the variant's instructions; **keep it only if it dominates** the incumbent on the benchmark. This is search over architectures, not just prompts — powerful, slow, easy to overfit. Try one variant at a time, only when stalled, and always re-baseline.

## When to use this at all
Single-compile `/dspy-mipro` or `/dspy-gepa` first. Reach for `/dspy-evolve` only when that's plateaued and the task is important enough to spend many generations × an LM budget on. It's the exotic tool — most programs don't need it.
