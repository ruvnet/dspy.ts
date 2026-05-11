---
name: synthesis-and-grounding
version: "0.1.0"
author: rUv
tags: [dspy, appliance, research-assistant, synthesis, grounding, citations, metric]
description: >
  How the DSPy.ts research-assistant synthesizes a grounded, cited answer from gathered evidence, how the groundedness/coverage metric scores it, and how to build a research set that doesn't teach it to overclaim.
  Use when: tuning the synthesizer (`/research-tune`), building its graded set, or validating answers.
---
# Synthesis & grounding

The gatherer hands the synthesizer a bundle of notes (`{ source, text }`). The synthesizer (`ChainOfThought`) writes the answer, the `citations` (every claim → a source id), and `gaps` (sub-questions the evidence didn't answer).

## What "good" means here
- **Grounded** — every substantive claim is backed by a citation, and every cited `source` actually appears in the gathered evidence. A citation to evidence that wasn't gathered scores *worse* than no citation (it's a hallucinated source). Uncited claims are capped (~0.3 on the groundedness axis).
- **Covers the question** — touches the required sub-topics (`gold.mustCover`). A polished answer to half the question isn't good.
- **Calibrated** — on thin/conflicting evidence, says so and lists `gaps`; doesn't paper over. When the evidence genuinely can't answer (`gold.answerable === false`), an honest "the evidence is insufficient" is the *correct* output (scores ~1); a confident fabricated answer scores ~0.1.

`groundedAnswerMetric` ≈ `0.4 × grounded + 0.4 × coverage + 0.2 × calibration`.

## Building the graded set (the part people get wrong)
- Questions with `mustCover` sub-topic markers (the metric checks the answer mentions them) and a `verdict`/`answerable` flag.
- **Include `answerable:false` cases** — questions your sources can't answer. ~15–25%. Without them every example rewards producing an answer, and tuning yields an assistant that *always* answers — i.e. fabricates when it shouldn't. This is the single most important thing in the set.
- Span the kinds of questions you care about (factual lookup, multi-hop synthesis, "compare X and Y"); the tuned assistant is only as good as what's represented.
- Hold out a slice; never tune on it.
- Goodhart watch: the metric can be gamed (citation-stuff, keyword-drop the `mustCover` terms). Spot-check top-scoring answers — do they read like a careful researcher's, or like metric-bait?

## Tuning & validating
- `/research-tune <set>` — MIPROv2 against `groundedAnswerMetric`, `replayStore` + a `CachingLM`. Tune `--target synthesizer` first (cheap: run the real gatherer once per example, then optimize the synthesizer prompt); tune `--target gatherer` (the ReAct thought prompt) if gathering is the weak link. Read `tracer.causalChain(runId)`.
- Flat scores ⇒ the graded set / metric, or the gatherer is returning empty evidence (a synthesizer can't be grounded on nothing — fix the tools first). Not the budget.
- Ongoing evolution across iterations: `dspy-evolution`'s `/dspy-evolve` with a held-out research benchmark.
- Validate with `/research-ask` on held-out questions: claims backed by gathered evidence (real `source` ids)? sub-topics covered? gaps named? hedges when evidence is thin?
