---
description: Scaffold the DSPy.ts research-assistant appliance into your repo — copy the program template to src/dspy/research-assistant.ts (+ spec), create the AgentDB reflexion store, and print next steps to wire your real search/fetch backends and tune.
argument-hint: "[--dest src/dspy/research-assistant.ts] [--reflexion .dspy/research-reflexion] [--max-steps N]"
---
Set up the research-assistant appliance. Parse `$ARGUMENTS` for `--dest` (default `src/dspy/research-assistant.ts`), `--reflexion` (AgentDB store path, default `.dspy/research-reflexion`), `--max-steps` (ReAct step budget, default 8).

1. Confirm `dspy.ts` is a dependency.
2. Copy `${CLAUDE_PLUGIN_ROOT}/templates/research-assistant.ts` → `--dest` (+ `research-assistant.spec.ts`); rewrite `REFLEXION_PATH` to `--reflexion`.
3. `const store = new AgentDBClient({ vectorDimension: 384, storage: { path: reflexionPath } }); await store.init();` — create the reflexion store (it starts empty; lessons/skills accrue as you run).
4. Tell the user: the `search` / `fetch` tools in the template are stubs — wire them to your real backend (a web search API, your doc corpus, an `AgentDBClient` retriever, etc.). The `note` tool is the bridge to the synthesizer — the agent must `note(source, text)` every fact it'll cite.
5. Print next steps: implement the tool handlers; `/research-ask "<question>"` to try it; build `tune/research-qa.json` (`[{ input:{question}, output:{mustCover:[...subtopics], answerable} }]` — include an `answerable:false` case); then `/research-tune tune/research-qa.json`.
