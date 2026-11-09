---
description: Run a DSPy.ts ReAct program on a task and show the full trace — recalled lessons, each thought/action/observation step, the final answer, and what (if anything) was recorded to the reflexion store.
argument-hint: "<program-name> \"<task>\" [--no-reflexion] [--max-steps N]"
---
Run `src/dspy/<program-name>.ts`. Parse `$ARGUMENTS` for the program, the task string, `--no-reflexion` (skip recall + recording for this run), `--max-steps` (override).

1. Load the program (and its `ReActReflexion` store, unless `--no-reflexion`).
2. Before the loop: print the lessons `reflexion.recall(taskKey)` surfaced (and any matched skills) — these go into the thought prompt.
3. `const out = await program.run({ /* the task */ });`
4. Print each step: `{ thought, action: { tool, args }, observation }`. Then the final `{ answer, reasoning, steps }`.
5. After the loop: report what `recordEpisode` did — episode stored, and whether a `react-skill` was promoted (a successful step sequence now seen ≥ `skillThreshold` times). Fallback answers count as `reachedAnswer: false`.
6. If it loops without converging: the tool descriptions are usually the problem (the model can't tell which tool to use) — see the `tool-design` skill.
