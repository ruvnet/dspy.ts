---
description: Ask the support-bot appliance a question — retrieves KB passages (MMR), answers with ChainOfThought grounded in them, and shows the answer, citations, and the passages used.
argument-hint: "\"<question>\" [--program src/dspy/support-bot.ts] [--k N] [--show-context]"
---
Run the support bot. Parse `$ARGUMENTS` for the question, `--program` (default `src/dspy/support-bot.ts`), `--k` (override passages), `--show-context` (print the assembled context).

1. `const bot = await buildSupportBot({ k });` (from the appliance module) — a `Pipeline` of `RetrieveModule → ChainOfThought`.
2. `const out = await bot.run({ question });`
3. Print: the **answer**; the **citations** (`out.citations`); the **passages** used (rank · score · source · snippet); with `--show-context`, the assembled context string the answerer saw.
4. If the answer is "I don't know" but you expected coverage: the KB is missing it or retrieval isn't surfacing it — `/dspy-retrieve <kb> "<question>"` (from `dspy-rag`) to debug, then index more docs. If the answer is confident but wrong/uncited: that's what `/support-bot-tune` fixes (the metric penalises uncited/hallucinated answers).
