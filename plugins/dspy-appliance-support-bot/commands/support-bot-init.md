---
description: Scaffold the DSPy.ts support-bot appliance into your repo — copy the program template to src/dspy/support-bot.ts (+ spec), create the AgentDB knowledge base, and print the next steps to index docs and tune.
argument-hint: "[--dest src/dspy/support-bot.ts] [--kb .dspy/support-kb] [--docs path/to/docs]"
---
Set up the support-bot appliance. Parse `$ARGUMENTS` for `--dest` (default `src/dspy/support-bot.ts`), `--kb` (AgentDB corpus path, default `.dspy/support-kb`), `--docs` (a directory/glob of knowledge-base documents to index now, optional).

1. Confirm `dspy.ts` is a dependency (`npm i dspy.ts` if not).
2. Copy `${CLAUDE_PLUGIN_ROOT}/templates/support-bot.ts` → `--dest`, and `support-bot.spec.ts` next to it. Rewrite `KB_PATH` / the env default to `--kb`.
3. `const kb = new AgentDBClient({ vectorDimension: 384, storage: { path: kbPath } }); await kb.init();` — create the corpus.
4. If `--docs`: chunk + embed + store them into the KB (the same flow as `dspy-rag`'s `/dspy-index --tier long`). Otherwise tell the user to run `/dspy-index <kb> <docs>` (from the `dspy-rag` plugin) when ready.
5. Print next steps: `/support-bot-ask "<question>"` to try it; create a `tune/support-qa.json` (`[{ input:{question}, output:{answer?, answerable?} }]` — include some `answerable:false` cases to test honesty); then `/support-bot-tune tune/support-qa.json`.
