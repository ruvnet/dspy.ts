---
description: Build (or extend) an AgentDB corpus for RAG — chunk documents, embed them, and store them with HNSW indexing, optional RaBitQ quantization, and tiered storage.
argument-hint: "<corpus-path> <source: dir|glob|file.txt> [--chunk-size N] [--overlap N] [--tier working|short|long] [--rabitq]"
---
Index documents into an `AgentDBClient` at `<corpus-path>`. Parse `$ARGUMENTS` for the corpus path, the source (a directory, a glob, or a file), `--chunk-size` (default ~800 chars), `--overlap` (default ~120), `--tier` (default `long` — the durable tier), `--rabitq` (1-bit quantization, ~32× smaller, `coarseThenRerank` at query time).

1. `const store = new AgentDBClient({ vectorDimension: 384, storage: { path: corpusPath }, performance: { batchEnabled: true${RABITQ:+, quantization: 'rabitq', rerankFactor: 3} } }); await store.init();` (384-dim ⇒ uses the ONNX embedding service; falls back to `hashEmbed` if unavailable).
2. Read each document; chunk it (size/overlap — see the `chunking-strategy` skill); for each chunk: `await store.storeText(chunkText, { source: file, offset, ... }, { tier })` (or `store.batchStore([...])`).
3. Report: documents read, chunks stored, `store.getStats()` (`totalVectors`, dimension), `store.tierCounts()`, and `store.quantizationInfo()` if `--rabitq`.
4. Re-run on the same path to append more sources. Use `store.promote(...)` / `store.evictTier(...)` to manage tiers over time.
