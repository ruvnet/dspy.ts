---
name: benchmark-design
version: "0.1.0"
author: rUv
tags: [dspy, evolution, benchmark, evaluation, gepa, metric]
description: >
  How to design the held-out benchmark + metric that a DSPy.ts self-evolution loop optimizes against — coverage, difficulty spread, leakage, and why a bad benchmark makes GEPA flail.
  Use when: setting up `/dspy-benchmark` / `/dspy-evolve`, or when the evolution learning curve is flat.
---
# Designing an evolution benchmark

GEPA reflects on the *lowest-scoring* examples each iteration. A multi-generation `/dspy-evolve` does that over and over. So the benchmark + metric *are* the objective — get them wrong and you'll evolve a program that's great at the wrong thing.

## Rules of thumb
- **Held out, always.** The benchmark must be disjoint from the slice GEPA reflects/bootstraps on. If they overlap you're measuring (and rewarding) memorization. `/dspy-benchmark` and `/dspy-evolve --benchmark` should point at the held-out set; the reflection slice is separate.
- **Cover the task, not just the easy middle.** Include the edge cases, the ambiguous inputs, the "should say I don't know" cases. The frontier you get is only as broad as the benchmark; uncovered behaviors won't improve (and may regress silently).
- **Spread the difficulty.** If everything scores ~0.9 from generation 1, there's no gradient — the curve is flat because there's nothing to climb, not because GEPA failed. Mix in hard examples so early generations score in the 0.3–0.7 range.
- **Size: enough to be stable, small enough to be cheap.** Each generation evaluates the whole benchmark × GEPA's internal trials. 30–100 examples is a common sweet spot; with a `CachingLM` you can afford more.
- **The metric must be graded** (partial credit in [0,1]), reasonably cheap, deterministic where possible, and aligned with what you actually want — including penalizing confident-wrong and rewarding honest "I don't know". (See `dspy-core`'s `metric-design` and, for RAG, `dspy-rag`'s `grounding-and-citations`.)
- **Pick a baseline** (`/dspy-benchmark --baseline`) before evolving — "generation 5 scored 0.78" is meaningless without "the raw program scored 0.52".
- **Watch for Goodhart.** If the metric is gameable (e.g. rewards length, or keyword presence), evolution *will* find the exploit. Spot-check the highest-scoring frontier candidates by hand; if a high score looks wrong, the metric is wrong.

## Diagnosing a flat learning curve
1. Are benchmark and reflection slices actually disjoint? (leakage → already-saturated scores)
2. Is the metric binary or noisy? (no gradient / chasing noise)
3. Is the benchmark too easy? (everything ~0.9 from gen 1)
4. Only after ruling those out: maybe the task is at the model's ceiling — then a *structural* variant (`--explore-modules`: add Retrieve, switch to ReAct) is the lever, not more GEPA iterations.
