---
name: support-kb-curation
version: "0.1.0"
author: rUv
tags: [dspy, appliance, support-bot, rag, knowledge-base, agentdb]
description: >
  How to curate the AgentDB knowledge base behind the DSPy.ts support-bot appliance — chunking, metadata for citations, coverage, deduplication, and tiers — so the bot answers accurately and admits gaps.
  Use when: building/extending a support-bot KB (`/support-bot-init`, `/dspy-index`).
---
# Curating a support-bot KB

The bot retrieves chunks from this AgentDB corpus and answers *only* from them. So the KB defines what it can answer — and what it correctly says "I don't know" to.

## Rules of thumb
- **Chunk on natural units** — a help-center article section, a FAQ entry, a runbook step group — ~500–1000 chars, ~10–20% overlap. Don't slice mid-procedure. (See `dspy-rag`'s `chunking-strategy`.)
- **Metadata is for citations.** Store `{ source, title, section, url? }` with every chunk. The appliance's answerer outputs `citations` and the `supportMetric` checks them against the retrieved context — no metadata, no real citations.
- **Cover the question space, not the doc tree.** Audit against real support tickets: every common question should map to ≥1 chunk. Uncovered questions become "I don't know" — acceptable, but track the list and fill it.
- **Dedup.** Near-identical chunks (the same answer in three articles) waste the `k` budget; MMR mitigates at query time but it's cheaper not to store them.
- **Tiers.** Index into `tier: 'long'`. `promote(...)` chunks that get hit constantly into `working`. `evictTier('short', { maxAgeMs })` for transient notices (incidents, temporary workarounds) so stale ops don't leak into answers.
- **Big KB ⇒ `quantization: 'rabitq'`** (`coarseThenRerank`, `rerankFactor ≥ 3`) — ~32× smaller, still fast.
- **Versioned / time-sensitive content** — put a date in the metadata; consider re-indexing on doc updates rather than appending, so old answers don't compete with new ones.

## Smell tests
- Bot punts on a question you know is documented ⇒ chunk missing, mis-chunked, or not surfacing — `/dspy-retrieve <kb> "<question>"` to see the top-k.
- Bot answers confidently but the cited source doesn't actually say that ⇒ chunk boundaries split the qualifier off the claim; re-chunk with more overlap.
- Bot answers from a stale chunk ⇒ evict/re-index that content; add a date to metadata.
