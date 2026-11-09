---
name: support-answer-quality
version: "0.1.0"
author: rUv
tags: [dspy, appliance, support-bot, metric, groundedness, honesty]
description: >
  How to judge and tune support-bot answer quality with the appliance's metric — helpfulness, groundedness/citations, and honest "I don't know" — and how to build a Q/A set that doesn't teach the bot to bluff.
  Use when: tuning the support bot (`/support-bot-tune`), building its Q/A set, or validating answers.
---
# Support-bot answer quality

The appliance ships `supportMetric` — roughly `0.6 × helpfulness + 0.4 × groundedness`, with a special case: when the KB *can't* answer (`gold.answerable === false`), an honest "I don't know" scores ~1 and a confident answer scores ~0.1.

## What "good" means here
- **Helpful** — actually answers the question. Graded (exact → contains → partial), not binary, so the optimizer has a gradient. (See `dspy-core`'s `metric-design`.)
- **Grounded** — claims trace to the retrieved context; the `citations` output names sources that appear in `context`. A hallucinated citation scores *worse* than no citation. An uncited-but-correct answer is capped (~0.4 on the groundedness axis) — it can't max out.
- **Honest** — "I don't know, try X" is the *correct* output when the KB lacks the answer. The metric and the prompt both allow it; don't penalise it, and don't train it away.

## Building the Q/A tuning set (the part people get wrong)
- Real questions with gold answers — span the question space, not just the top-10 FAQs.
- **Include `answerable:false` cases** — questions the KB deliberately doesn't cover. Without these, every example rewards answering, and tuning will teach the bot to *always* answer (i.e. bluff on the ones it shouldn't). 15–30% unanswerable is reasonable.
- Hold out a slice for validation; never tune on it.
- Watch Goodhart: if the metric over-rewards citations, the bot will citation-stuff. Spot-check top-scoring answers by hand.

## Tuning & validating
- `/support-bot-tune <qa-set>` — MIPROv2 against `supportMetric`, with `replayStore` (warm-start re-tunes) and a `CachingLM` (the search makes many near-identical prompts). Read `tracer.causalChain(runId)` — which instruction change moved the score?
- Flat scores ⇒ metric/Q-A set, not budget. Check: graded metric? `answerable:false` cases present? leakage between tune/validate?
- Want the prompt to keep improving across releases? `dspy-evolution`'s `/dspy-evolve` against a held-out benchmark.
- Validate with `/support-bot-ask` on the held-out slice: grounded? real citations? punts when it should? Debug retrieval misses with `dspy-rag`'s `/dspy-retrieve`.
