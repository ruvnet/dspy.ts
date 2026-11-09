---
description: Scaffold a DSPy.ts ReAct agent — a Signature, a tool registry (each tool a typed name/description/handler), a ReAct module, and optionally ReActReflexion wired to an AgentDB store so it learns from past episodes.
argument-hint: "<program-name> [signature: question -> answer] [--tools tool1,tool2,...] [--reflexion path/to/agentdb] [--max-steps N]"
---
Scaffold `src/dspy/<program-name>.ts` — a `ReAct` agent. Parse `$ARGUMENTS` for the name, an optional `in -> out` signature (default `question -> answer`), `--tools` (a comma list of tool names to stub), `--reflexion` (an AgentDB path → a `ReActReflexion` store), `--max-steps` (default 6).

1. Imports from `'dspy.ts'`: `ReAct`, `ReActReflexion`, `AgentDBClient`, `configureLM`, types `Signature`, `MetricFunction`.
2. Define the tool registry — for each `--tools` entry: `{ name, description: 'what it does + when to use it', handler: async (args) => /* ... */ }`. (See the `tool-design` skill — descriptions are the only thing the model sees.)
3. `const store = reflexionPath ? new AgentDBClient({ vectorDimension: 384, storage: { path: reflexionPath } }) : undefined; await store?.init();`
   `const reflexion = store ? new ReActReflexion({ store, recallK: 3, skillThreshold: 3 }) : undefined;`
4. `const program = new ReAct({ name, signature, tools, maxSteps, reflexion });` — `run(input)` recalls prior lessons (into the thought prompt), loops thought→action→observation, then records the episode (`recordEpisode(taskKey, { success, steps, critique })`); a recurring successful step sequence (seen ≥ `skillThreshold`) is promoted to a `react-skill` record.
5. Create `src/dspy/<program-name>.spec.ts` — `configureLM(new DummyLM())`, register a trivial tool, run, assert the output shape and that `steps` is an array.
6. Print next steps: implement the tool handlers, then `/dspy-react-run <program-name> "<task>"`; tune the thought prompt with `/dspy-mipro` (the reflexion store grows on its own as you run).
