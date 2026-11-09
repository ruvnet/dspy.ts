---
description: Run the data-pipeline appliance over a batch file (CSV/JSONL) — clean → classify → extract each record — and write the results out as CSV (one output row per input, errors captured per-row), with a summary.
argument-hint: "<input.csv|input.jsonl> [--program src/dspy/data-pipeline.ts] [--raw-field raw] [--out out.csv] [--use-optimized]"
---
Process a batch. Parse `$ARGUMENTS` for the input file (CSV with a raw-text column, or JSONL of objects), `--program` (default `src/dspy/data-pipeline.ts`), `--raw-field` (default `raw`), `--out` (output CSV path; default `<input>.out.csv`), `--use-optimized` (load the tuned `classify` stage from `.optimized.json` if present).

1. `const rows = parseDelimited(content, kind);` (from the appliance module).
2. Build the pipeline (`buildDataPipeline()`); if `--use-optimized`, swap in the tuned `classify` (`BootstrapFewShot.load(...)`).
3. `const out = await runBatch(rows, rawField);` — each output row = the input fields + `{ text, label, confidence?, fields }`, or `{ ..., _error }` if a row threw.
4. Write `toCSV(out)` to `--out`. Print a summary: rows processed, errors, the label distribution (counts per class), mean `confidence`, a few sample rows. Flag if "other" dominates (likely the label set is wrong or the prompt is weak) or if confidence is uniformly low.
5. For large batches, consider wrapping the LM in `CachingLM` (`dspy-observability`'s `/dspy-cache`) — many records produce near-identical prompts after the `clean` stage.
