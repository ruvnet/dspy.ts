# dspy-react — for Codex / MCP clients

This plugin ships an MCP server (`mcp/server.js`, command `node ${CLAUDE_PLUGIN_ROOT}/mcp/server.js`) for DSPy.ts ReAct agents with reflexion.

**Tools**
- `dspy_react_new` — scaffold a ReAct agent: a `Signature`, a tool registry (`{name, description, handler}` each), the `ReAct` module, and optional `ReActReflexion` wired to an AgentDB store.
- `dspy_react_run` — run a ReAct program on a task; returns the full trace: recalled lessons, every `{thought, action:{tool,args}, observation}` step, the final `{answer, reasoning, steps}`, and what was recorded (episode stored, skill promoted).
- `dspy_reflexion_recall` — for a `taskKey`, the lessons (from failed episodes) and skills (promoted successful sequences) that would be injected before a run.
- `dspy_reflexion_status` — reflexion store stats (lessons / skills / episodes / tiers / quantization).

**Resources**: `dspy://tool-design`, `dspy://reflexion-loop`, `dspy://reflexion/{path}/lessons`.

Handlers shell out to `npx ts-node` against `src/dspy/*` and `dspy.ts`. Slash commands `/dspy-react-new`, `/dspy-react-run`, `/dspy-reflexion` wrap the same flows interactively; the `react-engineer` agent designs the tool registry, sets `maxSteps`, wires reflexion, and iterates on traces. Tune the thought prompt with `dspy-optimize`'s `/dspy-mipro`/`/dspy-gepa`.
