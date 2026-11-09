---
description: Scaffold a DSPy.ts RAG program — a RetrieveModule (MMR) over an AgentDB corpus feeding a ChainOfThought answerer, composed in a Pipeline, plus a grounding metric.
argument-hint: "<program-name> <corpus-path> [--k N] [--mmr-lambda 0..1] [--overfetch N]"
---
Scaffold `src/dspy/<program-name>.ts` — a `Pipeline` of `RetrieveModule → ChainOfThought`. Parse `$ARGUMENTS` for the name, the corpus path, `--k` (passages, default 4), `--mmr-lambda` (relevance↔diversity, default 0.5), `--overfetch` (over-fetch factor before MMR rerank, default 3).

1. Imports from `'dspy.ts'`: `RetrieveModule`, `ChainOfThought`, `Pipeline`, `AgentDBClient`, `configureLM`, types `Signature`, `MetricFunction`.
2. `const corpus = new AgentDBClient({ vectorDimension: 384, storage: { path: corpusPath } }); await corpus.init();`
3. `const retrieve = new RetrieveModule({ client: corpus, k, useMMR: true, mmrLambda, overFetchFactor: overfetch, textField: 'text' });` — `run({ query })` → `{ passages, context }`.
4. ChainOfThought signature: inputs `{ question, context }`, outputs `{ answer, citations }`; prompt uses `context` and instructs "answer only from context; cite the source of each claim".
5. `const program = new Pipeline([ /* retrieve step (maps {question}→{context}) */, /* cot step */ ]);` Export `program` + a `metric(input, output, gold?)` that scores answer quality **and** citation faithfulness (see the `grounding-and-citations` skill — never a vague-but-uncited answer).
6. Create `src/dspy/<program-name>.spec.ts` — `configureLM(new DummyLM())`, index a tiny corpus, run the program, assert `passages.length <= k` and the output shape.
7. Print next steps: `/dspy-index <corpus-path> ...` to fill the corpus, then `/dspy-compile <program-name> mipro` (or `/dspy-gepa`) to tune the answerer.
