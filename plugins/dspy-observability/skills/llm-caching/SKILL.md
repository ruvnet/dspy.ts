---
name: llm-caching
version: "0.1.0"
author: rUv
tags: [dspy, caching, caching-lm, agentdb, cost]
description: >
  How to use CachingLM in DSPy.ts — a fuzzy AgentDB vector cache over an LM that returns a stored completion for near-identical prompts — including threshold/TTL/embed tradeoffs and when it matters most.
  Use when: wrapping an LM with CachingLM (`/dspy-cache`), or cutting the cost/latency of an optimizer search.
---
# CachingLM

`new CachingLM(baseLM, { store, similarityThreshold, ttlMs, embed })` wraps any `LMDriver`. On `generate(prompt)`: embed the prompt, search the `AgentDBClient` store; if the nearest cached prompt is within `similarityThreshold` cosine, return its completion; else call `baseLM`, store the result, return it.

## Knobs
- **`similarityThreshold`** (default ~0.97) — cosine to count as a hit. **Higher = safer, fewer hits.** 0.97–0.99: only near-identical prompts reuse an answer (good). Below ~0.95: prompts that differ in a way that *should* change the answer start reusing stale completions — only do this if you know your prompts vary trivially.
- **`ttlMs`** — entry lifetime. Use it when the "right" answer can change over time (anything time-sensitive, external state). Omit for pure functions of the prompt.
- **`embed`** — `'hash'` (default-ish): deterministic, zero extra calls, but hash-space collisions can cause false hits. `'model'`: embedding-service vectors — far fewer false hits, costs one embed call per prompt. Use `'model'` if you see wrong cache hits with `'hash'`.
- **store** — a persistent `storage.path` to keep the cache across runs; HNSW + `quantization: 'rabitq'` keep lookups fast as it grows; tiers/`evictTier` to cap size.

## When it pays off
- **Optimizer search** — MIPROv2 and GEPA generate *many* prompts that differ only in the instruction prefix or one demo. With caching, the repeated bodies hit the cache. This is the single biggest win; always wrap the LM before a big compile.
- **Re-runs** — re-running the same eval set after a small change reuses most completions.
- **Dev loops** — iterating on a metric while the program/prompts hold steady.

## Watch
- `lm.stats` → `{ hits, misses, hitRate, entries }`. A high `hitRate` during a compile is expected. A *low* one despite obviously-similar prompts ⇒ `similarityThreshold` too high, or switch `embed` to `'model'`.
- Caching hides nondeterminism: if `baseLM` is sampled (temperature > 0), the first answer for a prompt-cluster gets frozen. Fine for optimization (you want stability); be aware for anything that *wants* variety.
