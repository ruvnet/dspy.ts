---
description: Evaluate a DSPy.ts program (raw or optimized) against its metric over a dataset, and report per-example + aggregate scores.
argument-hint: "<program-name> [dataset: path/to/eval.json] [--optimized]"
---
Evaluate `src/dspy/<name>.ts` (or its `.optimized.json` if `--optimized`) over the eval dataset (`[{ input, output }]`) using the program's `metric`.

1. Load the program (or `optimizer.load(...)` the optimized one) + `metric` + the dataset.
2. For each example: `const out = await program.run(ex.input); scores.push(metric(ex.input, out, ex.output));`
3. Report: mean score, min/max, the worst N examples (input + got + expected + score) — these are the candidates a `gepa` reflect step would target.
4. If both raw and optimized exist, run both and print the delta.
