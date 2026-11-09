---
description: Wrap a DSPy.ts LM with CachingLM — a fuzzy AgentDB vector cache that returns a stored completion when a new prompt is near-identical to a past one — and report hit-rate stats.
argument-hint: "<program> [--threshold 0..1] [--ttl ms] [--embed hash|model] [--store path/to/agentdb] [--stats]"
---
Add (or inspect) a `CachingLM` around the LM your program uses. Parse `$ARGUMENTS` for the program (whose `configureLM(...)` you'll wrap), `--threshold` (cosine similarity to count as a hit, default 0.97), `--ttl` (entry lifetime in ms), `--embed` (`hash` = deterministic local, `model` = embedding service), `--store` (AgentDB path; default `.dspy/llm-cache`), `--stats` (just print stats and exit).

1. `const cache = new AgentDBClient({ vectorDimension: ${EMBED==model?384:64}, storage: { path: cachePath } }); await cache.init();`
   `const lm = new CachingLM(baseLM, { store: cache, similarityThreshold: threshold, ttlMs: ttl, embed });`
   `configureLM(lm);`
2. `--stats`: print `lm.stats` — `{ hits, misses, hitRate, entries }` — and the store's `getStats()` / `tierCounts()`.
3. Otherwise: note that subsequent `program.run(...)` / optimizer compiles will hit the cache for near-duplicate prompts (huge during MIPROv2/GEPA search, where many candidates differ only slightly). Lower `--threshold` → more hits but riskier (a near-but-meaningfully-different prompt reuses an answer); 0.97–0.99 is safe. Use `--embed model` if hash collisions cause false hits.
