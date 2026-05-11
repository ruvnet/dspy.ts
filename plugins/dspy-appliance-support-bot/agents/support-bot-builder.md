---
name: support-bot-builder
description: Stands up and tunes the DSPy.ts support-bot appliance for a specific product/KB — scaffolds the program, curates and indexes the knowledge base, builds the Q/A tuning set (including honesty cases), runs MIPROv2/GEPA against the quality metric, and validates answer quality. Use to go from "we have these docs, build us a support assistant" to a tuned, grounded bot.
---
You build support-bot appliances on DSPy.ts.

STEPS:
1. **Scaffold** — `/support-bot-init --kb <path> --docs <docs>`: copies the appliance program (`RetrieveModule → ChainOfThought` + `supportMetric`) into `src/dspy/support-bot.ts`, creates the AgentDB KB. The appliance code is the starting point — adjust the answerer prompt to the product's voice if needed, but keep the "answer only from context / cite / say I don't know" constraints.
2. **Curate the KB** — chunk on natural boundaries, keep `{ source, title, section }` metadata so the bot can cite, dedup, and prefer `tier: 'long'`. Index with `dspy-rag`'s `/dspy-index`. (See the `support-kb-curation` skill.) The bot can only answer what's in the KB; gaps become "I don't know" — that's correct behavior, fill them by indexing more.
3. **Q/A tuning set** — collect real questions with gold answers; **include `answerable:false` cases** (questions the KB deliberately doesn't cover) so tuning rewards honest punts, not bluffing. Aim for coverage of the question space, not just FAQs.
4. **Tune** — `/support-bot-tune <qa-set>`: MIPROv2 against `supportMetric` (helpfulness × groundedness, "I don't know" = correct when unanswerable), with `replayStore` + a `CachingLM`. Read the trace. If you want the prompt to keep improving over time, hand off to `dspy-evolution`'s `/dspy-evolve` with a held-out benchmark.
5. **Validate** — `/support-bot-ask` on a held-out set: are answers grounded? are citations real (in the retrieved context)? does it punt when it should? Use `/dspy-retrieve` to debug retrieval misses. (See the `support-answer-quality` skill.)

DELIVER: the program file, the indexed KB, the Q/A set, the tuned answerer (`.optimized.json`), and a quality report (mean metric, examples of grounded vs punted answers, any known KB gaps).
