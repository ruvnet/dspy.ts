---
name: review-actionability-metric
version: "0.1.0"
author: rUv
tags: [dspy, appliance, code-review, metric, gepa]
description: >
  How the DSPy.ts code-review appliance scores a review — coverage of real issues minus noise, specificity (located + concrete fix), severity calibration, no false alarms on clean PRs — and how to build a labelled review set that doesn't teach the reviewer to nitpick.
  Use when: tuning the reviewer (`/code-review-tune`), building its labelled set, or validating reviews.
---
# Scoring a code review

The appliance ships `actionabilityMetric` ≈ `0.4 × coverage + 0.35 × specificity + 0.25 × calibration`:
- **Coverage** — against `gold.knownIssues`: did it flag the real problems (recall), without burying them in noise (penalty for findings beyond the known set)? When `gold.verdict === 'ship'`: any `blocker`/`major` finding tanks coverage (false alarm on a clean PR).
- **Specificity** — fraction of findings that have a `location` AND a concrete `suggestion`. "Consider refactoring" with no location scores ~0; "src/a.ts:12 — unhandled null on `user`; guard with `if (!user) return`" scores 1.
- **Calibration** — some spread of severities is healthy when there are findings; all-nits or all-blockers is suspect. (Zero findings on a `ship` PR is perfectly calibrated.)

## Building the labelled set (the part people get wrong)
- From real past PRs: `{ input:{diff, intent}, output:{knownIssues:[{severity, near}], verdict:'ship'|'changes'|'blocked'} }`. `near` is a hint (file/symbol/keyword) the metric uses to check whether a finding matches a known issue.
- **Include clean PRs** — `verdict:'ship'`, empty `knownIssues`. ~25% is reasonable. Without them every example rewards finding problems, and tuning produces a reviewer that *always* finds problems. The single most important thing in this set.
- Span the kinds of issues you care about (correctness, security, convention violations, test gaps) — the tuned reviewer is only as good at catching what's represented.
- Hold out a slice; never tune on it.
- Goodhart watch: the metric can be gamed by emitting one perfectly-formatted finding per PR. Spot-check — does the tuned reviewer's output read like a senior engineer's, or like metric-bait?

## Tuning & validating
- `/code-review-tune <set>` — GEPA against `actionabilityMetric` (the prompt benefits from evolving against the weakest cases), `frontierStore` + a `CachingLM`. `--mipro` for a faster, gentler pass. Read the reflections (`dspy-evolution`'s `/dspy-evolution-status --reflections` if you used `frontierStore`): which instruction change made findings more specific / cut the noise?
- Flat scores ⇒ the labelled set or the metric — do `near` markers actually match findings? both `ship` and `changes`/`blocked` cases present? leakage? — not the budget.
- Validate with `/code-review-run` on held-out diffs: recall on known issues, false-alarm rate on clean PRs, are findings located + actionable, does it cite real conventions.
