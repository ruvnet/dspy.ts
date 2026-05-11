---
name: typed-pipeline-design
version: "0.1.0"
author: rUv
tags: [dspy, appliance, data-pipeline, pipeline, predict, etl]
description: >
  How to design a DSPy.ts data pipeline as typed PredictModule stages composed in a Pipeline — stage boundaries, signature shape, the merge pattern, error handling, and batch I/O — so each stage is tunable and the batch is robust.
  Use when: building/refactoring the data-pipeline appliance (`/data-pipeline-init`, `/data-pipeline-run`).
---
# Designing a typed DSPy.ts pipeline

A `Pipeline` runs `PredictModule` stages in order; each stage's input is built from the running record, its output `merge`d back in. The appliance ships `clean → classify → extract`.

## Stage boundaries
- **One job per stage.** `clean` normalizes, `classify` picks a label, `extract` pulls fields. Don't make one module do all three — a fat signature optimizes badly and a single bad output drags the whole thing down. If a stage's signature has >~6 fields, it's probably two stages.
- **Order by dependency.** `clean` before `classify` (classify the cleaned text), `classify` before `extract` (extraction depends on the label). Later stages `merge` earlier outputs into their input (`merge: (i, o) => ({ ...i, ...o })`).
- **Add/remove stages freely.** Pure classification? Just `classify`. Need routing? A `route` stage. Need redaction? A `redact` stage early. Each is a separate `PredictModule` you can tune independently.

## Signature shape
- Semantic field names — `text`, `label`, `confidence`, `fields` — not `out1`. The names go into the prompt.
- One output per thing you'll score. If the metric checks the label *and* a confidence, make them two outputs.
- Types are validated at runtime (`Module.validateInput/validateOutput`). `object` covers arrays/maps. A `description` on a field constrains the model (`"one of: a, b, c"`, `"0..1"`).
- A fixed enum (like `LABELS`) belongs in the signature's `description` *and* in the metric (penalise off-vocabulary outputs).

## Batch I/O & robustness
- `parseDelimited(content, 'csv'|'jsonl')` → rows; `runBatch(rows, rawField)` → one output row per input, **errors captured per-row** (`{ ..., _error }`) so one bad record doesn't kill the batch; `toCSV(rows)` out. Wire your real source/sink if not flat files.
- For large batches, wrap the LM in `CachingLM` (`dspy-observability`'s `/dspy-cache`) — after `clean`, many records produce near-identical prompts; the cache turns the run from N calls into ~(distinct prompts).
- Watch the output distribution: if `"other"` dominates, the label set or the `classify` prompt is wrong; if `confidence` is uniformly low, the prompt isn't giving the model enough to decide on.

## Tunability
Because each stage is its own `PredictModule`, you can: `BootstrapFewShot` the `classify` stage from labels (`/data-pipeline-tune`), `MIPROv2` it for instructions + demos (`dspy-optimize`'s `/dspy-mipro`), or evolve the whole pipeline's prompts (`dspy-evolution`'s `/dspy-evolve`). Tune the stage that's the bottleneck — check per-stage error rates first.
