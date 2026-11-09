# dspy-appliance-research-assistant — for Codex / MCP clients

A vertical appliance: a pre-wired DSPy.ts research assistant. Ships a ready-to-run program (`templates/research-assistant.ts` — a `ReAct` agent over a search/fetch/note tool registry with `ReActReflexion` → a `ChainOfThought` synthesizer that writes a grounded, cited answer + a `groundedAnswerMetric`) plus tooling to stand it up. MCP server: `mcp/server.js`, command `node ${CLAUDE_PLUGIN_ROOT}/mcp/server.js`.

**Tools**
- `research_init` — copy the appliance program into `src/dspy/research-assistant.ts` (+ spec), create the AgentDB reflexion store. The `search`/`fetch` tools are stubs — wire them to a real backend (web search API, your corpus, an AgentDB retriever); the `note` tool is the bridge to the synthesizer.
- `research_ask` — run a research query: ReAct gathers evidence (search → fetch → note), ChainOfThought synthesizes. Returns `{answer, citations:[{source,claim}], gaps, steps, evidence, recalledLessons, promotedSkill}`.
- `research_tune` — MIPROv2-tune the `synthesizer` (cheap) or `gatherer` (ReAct thought prompt) or `both` against a graded set (`[{input:{question}, output:{mustCover:[...], answerable}}]` — include `answerable:false` cases) and the groundedness/coverage metric; AgentDB replay + tracer; saves `<program>.optimized.json`.
- `research_status` — reflexion store stats + whether a tuned synthesizer is loaded.

**Resources**: `dspy://research-assistant/template`, `dspy://research-tool-registry`, `dspy://synthesis-and-grounding`.

Handlers shell out to `npx ts-node` against `src/dspy/*` (the copied appliance) and `dspy.ts`. Slash commands `/research-init`, `/research-ask`, `/research-tune` wrap the same flows; the `research-assistant-builder` agent stands up and tunes an assistant for a specific domain/backend. Builds on `dspy-react` (ReAct + reflexion), `dspy-rag` (a retriever backend for the tools), `dspy-optimize` + `dspy-evolution` (tuning), `dspy-observability` (tracer, cache).
