---
name: chunking-strategy
version: "0.1.0"
author: rUv
tags: [dspy, rag, chunking, agentdb, retrieval]
description: >
  How to chunk documents for a DSPy.ts + AgentDB RAG corpus — size, overlap, metadata, and tier choice — so RetrieveModule + MMR returns useful, citable context.
  Use when: running `/dspy-index`, or when retrieval keeps missing the right passage.
---
# Chunking for RAG

You're filling an `AgentDBClient` corpus that a `RetrieveModule` will query. The chunk is the unit of retrieval *and* the unit of citation.

## Rules of thumb
- **Chunk on natural boundaries.** A section, a paragraph, a list item — not a fixed byte window that slices a sentence in half. Fixed-size is the fallback, not the goal.
- **Size ≈ one coherent thought**, ~500–1000 chars for prose; smaller for dense reference text, larger for narrative. Too small ⇒ no context; too large ⇒ the answerer drowns and `k` passages blow the prompt budget.
- **Overlap ~10–20%** so a fact spanning a boundary appears whole in at least one chunk. `dspy.ts`'s embeddings package supports configurable overlap.
- **Keep metadata: `{ source, offset, title?, section? }`.** The answerer's signature has a `citations` output — it can only cite what you stored. `storeText(text, metadata, { tier })`.
- **Tier on durability/heat.** Index into `long`. `promote(...)` chunks that get hit a lot to `working`. `evictTier('short', { maxAgeMs })` for transient stuff. `searchTiered` queries across tiers.
- **Dedup before indexing.** Near-duplicate chunks waste the `k` budget; MMR helps at query time, but it's cheaper to not store them.
- **Big corpus ⇒ `quantization: 'rabitq'`** (~32× smaller, 1-bit). `coarseThenRerank` over-fetches on the packed bits then re-ranks the shortlist on full vectors — set `rerankFactor` ≥ 3.

## Sizing `RetrieveModule`
- `k`: 4–8. More isn't better — past ~8 the answerer ignores the tail.
- `overFetchFactor`: ≥ 3, so MMR picks `k` diverse passages from `k × factor` candidates.
- `mmrLambda`: ~0.5. Drop toward 0.3 when chunks are repetitive; raise toward 0.7 when on-topic-ness matters more than coverage.
- Validate with `/dspy-retrieve <corpus> "<query>"` *before* tuning the answerer — a retriever that doesn't surface the answer can't be fixed downstream.
