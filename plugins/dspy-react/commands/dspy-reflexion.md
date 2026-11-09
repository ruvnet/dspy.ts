---
description: Inspect or manage a DSPy.ts ReActReflexion store — list the lessons learned from failed episodes, the skills promoted from recurring successful sequences, and the raw episode history.
argument-hint: "<path/to/agentdb> [--lessons] [--skills] [--episodes] [--task <taskKey>]"
---
Open the `AgentDBClient` at `<path>` and report what `ReActReflexion` has accumulated. Parse `$ARGUMENTS` for the store path, optional `--task` filter, and which views to show (default: all).

1. `const store = new AgentDBClient({ vectorDimension: 384, storage: { path } }); await store.init(); const reflexion = new ReActReflexion({ store });`
2. `--lessons` — `reflexion.lessonsText(taskKey?)` / `recall(taskKey)`: critiques distilled from failed episodes (the `react-reflexion` records). These are injected before future runs of the same task.
3. `--skills` — `reflexion.getSkills(taskKey?)`: action sequences promoted because they succeeded ≥ `skillThreshold` times (the `react-skill` records).
4. `--episodes` — the raw episode history (vector-searchable via the store).
5. `store.getStats()` / `store.tierCounts()` for size. Note: the store keys by `taskKey`, so lessons from one task don't bleed into another.
6. This is the "what has the agent learned" view — pair it with `/dspy-react-run` to watch new lessons/skills appear.
