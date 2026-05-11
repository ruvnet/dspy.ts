---
name: optimizer-selection
version: "0.1.0"
author: rUv
tags: [dspy, optimizer, miprov2, gepa, bootstrap]
description: >
  How to choose and budget a DSPy.ts optimizer — BootstrapFewShot vs MIPROv2 vs GEPA — and when to wire AgentDB replay / frontier persistence.
  Use when: setting up `dspy-compile` / `dspy-mipro` / `dspy-gepa` / `dspy-bootstrap`, or when a compile won't improve.
---
# Choosing a DSPy.ts optimizer

| | `BootstrapFewShot` | `MIPROv2` | `GEPA` |
|---|---|---|---|
| What it tunes | demos (labeled + bootstrapped) | instruction **and** demos, via seeded search | instruction, via reflective Pareto evolution |
| Cost | minutes | `numTrials × |trainset|` metric calls | `numIterations × mutationsPerStep` LM calls + evals |
| AgentDB hook | `dynamicDemos: { store, k }` — input-conditioned demos at run time | `replayStore` + `replayTopK` — warm-start repeated compiles of the same task | `frontierStore` — persist + continue evolution |
| Best when | quick win, you have a few good examples | non-trivial task, you'll re-compile as data grows | you have a strong graded metric and want the prompt to evolve |
| Determinism | yes | yes (fixed `seed`) | yes (fixed `seed`) |

## Rules of thumb
- **Start with BootstrapFewShot.** If it's enough, stop. Add `dynamicDemos` only if inputs are heterogeneous.
- **Reach for MIPROv2** when one instruction won't cover the task. Always attach a `CompilationTracer` so trials are inspectable; attach a `replayStore` if you'll re-compile.
- **Reach for GEPA** last — it's the most expensive and the most metric-sensitive, but it's the one that *rewrites* the prompt. Don't run it on a binary metric.
- **A flat `result.score` is almost always the metric, not the budget.** Binary metrics give no gradient; noisy metrics send GEPA chasing noise. Fix the metric (`dspy-core`'s `metric-design` skill) before adding trials.
- **Warm-start is per task fingerprint** — a different program (different signature/name) won't pull another task's bests.
- Always `opt.save(...)` the result; `opt.load(...)` restores the compiled program + the trace.
