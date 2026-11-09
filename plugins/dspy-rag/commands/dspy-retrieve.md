---
description: Query an AgentDB RAG corpus and show what RetrieveModule would feed the answerer — the top-k passages, their scores, and how MMR re-ranked them for diversity.
argument-hint: "<corpus-path> \"<query>\" [--k N] [--mmr-lambda 0..1] [--no-mmr]"
---
Run a retrieval against the corpus at `<corpus-path>`. Parse `$ARGUMENTS` for the corpus path, the query string, `--k` (default 4), `--mmr-lambda` (default 0.5), `--no-mmr` (plain top-k, no diversity rerank).

1. `const corpus = new AgentDBClient({ vectorDimension: 384, storage: { path: corpusPath } }); await corpus.init();`
2. `const retrieve = new RetrieveModule({ client: corpus, k, useMMR: !noMmr, mmrLambda, overFetchFactor: 3, textField: 'text' });`
3. `const { passages, context } = await retrieve.run({ query });`
4. Print each passage: rank, score, source/metadata, a snippet. Then show the assembled `context` string (what ChainOfThought sees). If MMR is on, note which over-fetched candidates were dropped for redundancy.
5. This is a debugging view — if the right passages aren't in the top-k, fix the corpus (chunking, more sources) or `--k`/`--overfetch` before tuning the answerer.
