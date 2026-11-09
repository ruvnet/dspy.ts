---
description: Run the research-assistant appliance on a question — a ReAct agent (with reflexion) gathers evidence via the tool registry, then a ChainOfThought synthesizer writes a grounded, cited answer with named gaps. Prints the trace and the answer.
argument-hint: "\"<question>\" [--program src/dspy/research-assistant.ts] [--max-steps N] [--no-reflexion] [--show-evidence]"
---
Run a research query. Parse `$ARGUMENTS` for the question, `--program` (default `src/dspy/research-assistant.ts`), `--max-steps` (override the ReAct budget), `--no-reflexion` (skip lesson recall + episode recording this run), `--show-evidence` (print the gathered notes).

1. `const ra = await buildResearchAssistant({ maxSteps });` — `ReAct(gather, reflexion) → ChainOfThought(synthesize)`.
2. Before the loop: print the lessons `reflexion.recall(taskKey)` surfaced (and any matched search-strategy skills) — these go into the ReAct thought prompt.
3. `const out = await ra.run({ question });`
4. Print: each ReAct step `{ thought, action:{tool, args}, observation }`; with `--show-evidence`, the gathered notes (`{ id, source, text }`); then the synthesizer's **answer**, **citations** (`{ source, claim }`), and **gaps**. After: what `recordEpisode` did — episode stored, and whether a `react-skill` (a search strategy that's worked ≥ `skillThreshold` times) was promoted.
5. If it loops without gathering useful evidence: the `search`/`fetch` handlers are stubs or your backend isn't returning anything — wire/fix them (the agent can't research what it can't retrieve). If the answer overclaims or cites evidence it didn't gather: that's what `/research-tune` fixes (the metric penalises ungrounded citations).
