---
description: Define and run a benchmark for a DSPy.ts program — a held-out dataset + metric — scoring the raw program (and any evolved/optimized variants), and recording the result so /dspy-evolve can chart progress across generations.
argument-hint: "<program> <dataset: bench.json> [--variant raw|optimized|evolved|all] [--store path/to/agentdb] [--baseline]"
---
Score `src/dspy/<program>.ts` (and/or its `.optimized.json` / `.evolved.json` variants) over a held-out dataset using the program's `metric`. Parse `$ARGUMENTS` for the program, the dataset (`[{input, output}]`), `--variant` (default `all`), `--store` (AgentDB path to record results into; default `.dspy/evolution`), `--baseline` (mark this run as the baseline to compare future generations against).

1. Load the dataset + `metric`. The benchmark set must be **held out** — never the trainset GEPA reflected on, or you're scoring memorization.
2. For each requested variant: load it (`opt.load(...)` for optimized/evolved; the bare module for raw), run it over the dataset, collect per-example scores.
3. Report: mean (the headline), min/max, the worst N examples (input · got · expected · score) — these are exactly what the next generation's GEPA reflect step will target. If multiple variants, the deltas (`raw → optimized → evolved`).
4. Persist a `benchmark-result` record to `--store` (`hashEmbed`-keyed): `{ program, variant, mean, n, ts, baseline? }`. `/dspy-evolve` and `/dspy-evolution-status` read these to draw the learning curve.
5. A flat curve across generations almost always means the **benchmark or the metric** is the bottleneck (too easy, too noisy, or not measuring what you care about) — not "GEPA can't do better". Fix the benchmark first.
