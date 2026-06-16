---
name: compile-tracing
version: "0.1.0"
author: rUv
tags: [dspy, observability, tracing, compilation-tracer, mlflow, agentdb]
description: >
  How to instrument DSPy.ts optimizer runs with CompilationTracer — persisted trials, causedBy links, causalChain to the best, optional MLflow — and how to read the trace to understand a compile.
  Use when: attaching tracing to MIPROv2 / GEPA (`/dspy-trace`, `/dspy-runs`), or debugging why a compile landed where it did.
---
# Tracing a compile

`CompilationTracer({ store, mlflow })` records an optimizer run into an `AgentDBClient`.

## What it records
- `startRun(optimizer, params)` → a `runId`, and a `compile-run` record.
- `logTrial(runId, { label, params?, score })` → a `trialId`, and a `compile-trial` record whose `causedBy` is the previous trial's id — so the trials form a lineage, not just a list.
- `endRun(runId, { bestScore, ... })` → a `compile-run-end` record.
- If `mlflow: true` and `@mlflow/tracking` is installed, runs/metrics are mirrored there too (`mlflowAvailable` reports whether it engaged; absence is silently fine).

## Reading it
- `getTrace(runId)` — every trial in order: `{ label, params, score, causedBy }`.
- `causalChain(runId)` — just the lineage of trials that led to the best candidate. This is the useful view: it shows which instruction/demo changes moved the score.
- `runIds` / `runCount` — across runs in this store.

## Setup notes
- Use a **persistent** `storage.path` (e.g. `.dspy/traces`) so traces survive the process; the saved optimizer JSON (`opt.save(...)`) also carries the trial trace inline.
- `vectorDimension: 64` is plenty — trace records are fingerprints, not semantic embeddings.
- Share the *same* `AgentDBClient` for the tracer and the optimizer's `replayStore`/`frontierStore` — one store, correlated history.
- Records use `store.hashEmbed(...)` for their vectors (deterministic), so traces are reproducible.

## What the trace tells you
- **Flat scores down the chain** ⇒ the metric, not the search — binary or noisy metrics give the optimizer nothing to climb. Fix `metric-design` first.
- **Where the best came from** — the chain's score jumps point at the instruction/demo edits that worked; iterate there.
- **Warm-started runs** show their recalled seeds as the first trials — you can see whether prior knowledge actually helped.
