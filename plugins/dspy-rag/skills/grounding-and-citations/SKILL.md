---
name: grounding-and-citations
version: "0.1.0"
author: rUv
tags: [dspy, rag, grounding, citations, metric, faithfulness]
description: >
  How to design the answerer signature, prompt, and metric for a DSPy.ts RAG pipeline so answers are grounded in the retrieved context and cite their sources — and so an optimizer can't game it.
  Use when: writing the ChainOfThought step / metric for a RAG program, or when answers drift off-context.
---
# Grounding & citations

The retriever gives you `{ passages, context }`. The answerer's job is to answer **from that context** and say **where**.

## Signature & prompt
- Signature: inputs `{ question, context }`, outputs `{ answer, citations }` (`citations: object` — e.g. an array of `{ source, span }`).
- The prompt must say, explicitly:
  - "Answer **only** using the context below. If the context doesn't contain the answer, say so."
  - "For each claim in the answer, cite the source it came from."
- Use `ChainOfThought` (not `Predict`) — the reasoning step is where it decides which passages support the answer; that reasoning is visible in the output and useful for the metric.

## Metric — score quality AND faithfulness
A naive `answer === gold ? 1 : 0` metric lets the optimizer produce confident, uncited, sometimes-wrong answers. Score both axes, in [0,1]:
```ts
const metric: MetricFunction = (input, out, gold?) => {
  if (!out?.answer) return 0;
  let q = gold ? scoreAnswer(out.answer, gold.answer) : heuristicAnswerScore(out.answer); // 0..1
  // faithfulness: are the cited sources actually in the retrieved context, and does the answer stick to them?
  const cited = (out.citations ?? []) as { source: string }[];
  const inContext = cited.length > 0 && cited.every(c => input.context.includes(c.source) /* or check passage ids */);
  const f = cited.length === 0 ? 0.4              // answered but didn't cite → capped
          : inContext ? 1.0                       // cited real context
          : 0.2;                                  // cited something not retrieved → hallucinated cite
  return 0.6 * q + 0.4 * f; // never let a great-but-uncited answer hit 1.0
};
```
## Rules of thumb
- **Reward partial correctness** on the quality axis (overlap/F1, not exact-match) — optimizers need a gradient. (See `dspy-core`'s `metric-design`.)
- **Penalise unsupported citations harder than missing ones** — a fake cite is worse than no cite.
- **"I don't know" when the context lacks the answer is the *correct* output** — your metric and prompt should both allow it; don't train the model to bluff.
- Tune the **retriever** (`k`, `mmrLambda`, chunking) by hand against `/dspy-retrieve`; tune the **answerer's instruction** with `/dspy-mipro` or `/dspy-gepa` against this metric.
