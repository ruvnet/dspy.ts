---
name: review-context-indexing
version: "0.1.0"
author: rUv
tags: [dspy, appliance, code-review, rag, agentdb, conventions]
description: >
  How to build the AgentDB repo-context index the DSPy.ts code-review appliance retrieves from — what to index (conventions, representative code, ADRs, prior reviews), what NOT to, metadata, and tiers — so the reviewer judges against the project's real patterns.
  Use when: running `/code-review-init` or extending a review context index.
---
# Indexing repo context for code review

The reviewer retrieves a handful of context chunks per diff and judges the change against them. Garbage in ⇒ a reviewer that invents rules or misses real ones.

## Index this
- **Conventions / style docs** — `CONVENTIONS.md`, `CONTRIBUTING.md`, lint config rationale, the project's stated rules. `kind: 'convention'`.
- **ADRs** — architecture decisions the reviewer should hold changes to. `kind: 'adr'`.
- **A representative sample of code** — the modules that *exemplify* the patterns you want enforced (the canonical service, the canonical test, the canonical error-handling). Not the whole repo. `kind: 'code'`.
- **Prior PR reviews** — past review comments (ideally with the diff snippet they were about). This is the highest-signal source: it encodes what this team actually flags and how. `kind: 'review'`.

## Don't index
- The entire source tree — it dilutes retrieval; a 10k-chunk dump means the relevant convention is buried under 9,990 lines of unrelated code.
- Generated code, vendored deps, lockfiles, build output.
- Stale docs / superseded ADRs — or mark them and `evictTier` later, so the reviewer doesn't enforce dead rules.

## Mechanics
- Chunk on natural units (a doc section, a function, a review comment + its snippet), ~500–1000 chars, ~15% overlap. Keep `{ source, kind, title?, line? }` metadata — the reviewer cites the convention/related code, so it needs to know where it came from.
- `storeText(chunk, meta, { tier: 'long' })`. `promote(...)` the conventions/ADRs to `working` (they're always relevant); let one-off review snippets live in `short`/`long`.
- Big index ⇒ `quantization: 'rabitq'` + `coarseThenRerank` (`rerankFactor ≥ 3`).
- Re-index conventions/ADRs when they change (don't just append); old + new competing in retrieval = inconsistent reviews.

## Tuning retrieval
- `k`: 5–8 — enough to bring conventions + related code + a prior review, not so much it floods the prompt.
- `mmrLambda` low-ish (~0.4) and `useMMR: true` — you want *diverse* context (a convention AND related code AND a prior review), not 6 chunks of the same convention. `overFetchFactor ≥ 3`.
- Debug misses with `dspy-rag`'s `/dspy-retrieve <context> "<intent>\n<diff>"`.
