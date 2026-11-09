---
name: metric-design
version: "0.1.0"
author: rUv
tags: [dspy, metric, evaluation, optimizer]
description: >
  How to write metrics for DSPy.ts optimizers — `(input, output, gold?) => number` in [0,1] that gives the search a gradient.
  Use when: setting up BootstrapFewShot / MIPROv2 / GEPA, or when a compile isn't improving.
---
# Metric Design

`type MetricFunction = (input, output, expected?) => number` — return a score in **[0, 1]**.

## Rules of thumb
- **Never 0-or-1 only.** A binary metric gives the optimizer no gradient — most candidates score 0, the search wanders. Reward partial correctness (e.g., `0.3` for "answered, wrong"; `1` for "exact"; in between for "close").
- **Be cheap and deterministic** where possible. The metric runs once per eval example per trial (`numTrials × |trainset|` for MIPROv2). Heavy LM-judge metrics 10× the cost — use them sparingly or on a minibatch (`MIPROv2`'s `minibatchSize`).
- **Score what you care about.** Exact match for closed QA; F1/overlap for extraction; for grounded answers, *also* score citation/faithfulness so the optimizer can't game it by being vague.
- **Use `expected`** when you have gold labels; fall back to a heuristic when you don't (the optimizer still bootstraps demos from unlabeled examples that score high on the heuristic).
- **GEPA needs a good metric most of all** — its reflect step targets the lowest-scoring examples, so a noisy metric sends it chasing noise.

## Example
```ts
const metric = (_in: { question: string }, out: { answer: string }, gold?: { answer: string }) => {
  if (!out?.answer) return 0;
  if (gold && out.answer.trim().toLowerCase() === gold.answer.trim().toLowerCase()) return 1;
  if (gold && out.answer.toLowerCase().includes(gold.answer.toLowerCase())) return 0.6; // partial
  return 0.3; // answered, but not matching gold
};
```
