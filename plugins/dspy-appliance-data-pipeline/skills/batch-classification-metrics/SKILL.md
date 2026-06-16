---
name: batch-classification-metrics
version: "0.1.0"
author: rUv
tags: [dspy, appliance, data-pipeline, metric, classification, evaluation]
description: >
  How to design the row-level metric for a DSPy.ts data pipeline and read its batch evaluation — graded accuracy, off-vocabulary/"other" handling, confusion matrices, label balance — so BootstrapFewShot/MIPROv2 have a gradient and you can see what's actually wrong.
  Use when: tuning the classify stage (`/data-pipeline-tune`), building the labeled set, or reading a batch run.
---
# Row metrics & batch evaluation

The appliance's `rowMetric` scores the `classify` stage per record, in [0,1]: exact gold label = 1; off-vocabulary label = ~0.1; confusing a real class with `"other"` (either direction) = ~0.2; wrong-but-a-real-class = ~0.3; no gold = ~0.5 (a confident specific label) / ~0.3 (`"other"`).

## Designing the metric
- **Graded, not binary.** Exact-match-only gives the optimizer no gradient — most candidates score 0 and BootstrapFewShot/MIPROv2 wander. Partial credit for a real attempt is what lets the search climb. (See `dspy-core`'s `metric-design`.)
- **Penalise off-vocabulary hard.** A label not in your fixed set is broken output; cap it near 0 so the optimizer learns to stay in vocabulary.
- **Encode your cost model.** Not all confusions are equal — if mislabeling `billing` as `bug` is far worse than `bug` as `feature_request`, weight the metric (e.g. a small confusion-cost table) so tuning optimizes what you actually care about.
- **`"other"` is a trap.** A model under pressure dumps everything into `"other"`. Penalise real↔`"other"` confusion in both directions, and watch the output distribution.
- **Multi-output stages** — if `classify` also outputs `confidence`, you can add a calibration term (reward confidence that tracks correctness), but keep it secondary; accuracy first.

## Building the labeled set
- **Stratify** — cover every class, roughly proportional to reality (or oversample rare classes if you care about recall on them). A set that's 90% one class teaches the model to always guess that class.
- Real examples, not synthetic — the model needs to see the actual phrasing it'll face.
- Hold out a slice (`--holdout`); never tune on it.
- Goodhart watch — if the metric over-weights one class, the tuned classifier will over-predict it. Spot-check the confusion matrix.

## Reading a batch evaluation
`/data-pipeline-tune` reports raw vs tuned accuracy on the held-out slice, the delta, and a **confusion matrix** — read it:
- A whole row/column dominated by `"other"` ⇒ the label set is wrong (a class is missing, or two should be merged) or the prompt is weak.
- Two classes that swap a lot ⇒ they overlap; sharpen the signature `description` (what distinguishes them) or merge them.
- Flat delta after tuning ⇒ labels/balance/not-enough-demos, not budget. Try `dspy-optimize`'s `/dspy-mipro` (instructions + demos) before throwing more data at it.
- `/data-pipeline-run` also prints the live label distribution + mean confidence — a fast smell test on unlabeled batches.
