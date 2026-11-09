---
description: Tune the data-pipeline's classify stage with BootstrapFewShot from a labeled CSV/JSONL and the row metric — labeled + self-bootstrapped demos, optionally input-conditioned via an AgentDB vector store — then report held-out accuracy.
argument-hint: "<labeled.csv|labeled.jsonl> [--program src/dspy/data-pipeline.ts] [--text-field text] [--label-field label] [--labeled N] [--dynamic .dspy/data-demos] [--holdout 0.2]"
---
Tune the `classify` stage in `src/dspy/data-pipeline.ts`. Parse `$ARGUMENTS` for the labeled file (rows with a text column and a gold label column), `--program`, `--text-field` (default `text` — if your file has only `raw`, run the `clean` stage first to produce `text`), `--label-field` (default `label`), `--labeled` (max labeled demos, default 8), `--dynamic` (AgentDB path → input-conditioned demo selection), `--holdout` (fraction held out for evaluation, default 0.2).

1. Load the file; build `trainset: [{ input:{text}, output:{label} }]`. Split off a held-out slice (`--holdout`).
2. `const tuned = await tuneClassify(trainset, { maxLabeledDemos, dynamicStorePath });` (from the appliance module) — `BootstrapFewShot(rowMetric, { maxLabeledDemos, maxBootstrappedDemos: 4, dynamicDemos })` → a `BootstrapOptimizedModule`.
3. Save it: `opt.save('src/dspy/data-pipeline.optimized.json')` (the helper exposes the optimizer; or re-run `BootstrapFewShot` directly to get a handle). Then `/data-pipeline-run --use-optimized` swaps it in.
4. Evaluate: run the raw `classify` and the tuned one over the held-out slice with `rowMetric`; report accuracy each + the delta + a confusion matrix (which classes get mixed up). If `--dynamic`, note that `tuned.selectDemos(input)` picks the k-nearest demos per row at run time.
5. Flat / no improvement ⇒ usually the *labels* (overlapping classes — split or merge them), the *label balance* (one class dominates — stratify), or *not enough labeled demos*. For a stronger pass (instructions + demos, not just demos), `dspy-optimize`'s `/dspy-mipro` on the `classify` stage; for the whole pipeline's prompts, `/dspy-evolve`.
