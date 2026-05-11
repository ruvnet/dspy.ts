# ADR-0001: DSPy.ts Claude Code & Codex Plugin Marketplace

- **Status:** Accepted
- **Date:** 2026-05-11
- **Deciders:** rUv
- **Tags:** plugins, marketplace, mcp, claude-code, codex, dx

## Context

DSPy.ts ships a real programming model — typed `Signature`s, modules (`PredictModule`,
`ChainOfThought`, `ReAct`, `RetrieveModule`, `Pipeline`), optimizers
(`BootstrapFewShot`, `MIPROv2`, `GEPA`), and an AgentDB memory layer (HNSW + RaBitQ +
MMR, ReasoningBank, ReActReflexion, CompilationTracer). Today a user has to read the
docs/examples and wire all of that by hand. We want the library to be *usable from
inside an agent* — Claude Code and OpenAI Codex — so an agent can scaffold a program,
compile it with an optimizer, evaluate it, and run RAG/ReAct without the human
hand-assembling the pieces.

Claude Code supports **plugins** (`.claude-plugin/plugin.json` + `commands/`,
`agents/`, `skills/`, and bundled `mcpServers`), distributed through a
**marketplace** (`.claude-plugin/marketplace.json`). Codex consumes the same MCP
servers and reads `AGENTS.md`. So a single repo can publish: a marketplace manifest,
several plugins, and MCP tools/resources that expose the library itself.

## Decision

Publish a **plugin marketplace from the `ruvnet/dspy.ts` repo**:

1. **`.claude-plugin/marketplace.json`** at the repo root lists all plugins.
2. **`plugins/<name>/`** — one directory per plugin, each a valid Claude Code plugin
   (`.claude-plugin/plugin.json`, `commands/*.md`, `agents/*.md`,
   `skills/<name>/SKILL.md`), and where useful a bundled **MCP server** (`mcp/server.js`,
   referenced from `plugin.json`'s `mcpServers`) exposing DSPy.ts as tools
   (`dspy_scaffold`, `dspy_compile`, `dspy_eval`, `dspy_retrieve`, …) and resources
   (`dspy://docs/api`, `dspy://examples`, the design-skill guides). Codex picks up the
   same MCP servers.
3. **Tiers, practical → exotic, plus vertical appliances:**
   - `dspy-core` — scaffold / compile / evaluate; `dspy-architect` agent; signature- &
     metric-design skills; MCP tools for the library. *(shipped first)*
   - `dspy-optimize` — deep optimizer workflows (MIPROv2 + experience replay, GEPA
     Pareto evolution, BootstrapFewShot dynamic demos).
   - `dspy-rag` — `RetrieveModule` over AgentDB (HNSW/RaBitQ/MMR) → ChainOfThought;
     corpus indexing.
   - `dspy-react` — ReAct + tool registries + `ReActReflexion` (recall lessons, record
     episodes, promote skills).
   - `dspy-observability` — `CompilationTracer` causal traces, AgentDB persistence,
     optional MLflow; `CachingLM`.
   - `dspy-evolution` — *(exotic)* GEPA-driven self-evolution loops that evolve a
     program's prompts (and the program) against a benchmark across runs.
   - **Vertical appliances** — pre-wired end-to-end programs:
     `dspy-appliance-support-bot`, `dspy-appliance-code-review`,
     `dspy-appliance-research-assistant`, `dspy-appliance-data-pipeline`.
4. **Build cadence:** `dspy-core` + the marketplace manifest land now; the remaining
   plugins are built one per iteration via a recurring loop, each scaffolded, validated
   (plugin.json parses, frontmatter present, referenced files exist) and committed,
   tracked in a GitHub issue, finishing with a single PR.

## Consequences

**Positive**
- The library becomes operable from Claude Code / Codex with no hand-wiring; agents get
  first-class commands, sub-agents, design skills, and MCP tools/resources.
- One source of truth (this repo) for the marketplace; users add it with
  `/plugin marketplace add ruvnet/dspy.ts`.
- Vertical appliances give a working baseline you can `dspy-compile` further — they
  double as examples.

**Negative / risks**
- More surface to keep in sync with the `dspy.ts` API — mitigated by pinning
  `minClaudeFlowVersion`-style version hints in each `plugin.json` and keeping command
  bodies thin (they orchestrate, the library does the work).
- The bundled MCP servers start as scaffolds (tool schemas + handler stubs that shell
  out to `npx ts-node`) — fleshing out the stdio transport + handlers is follow-up work
  per plugin.

## Alternatives considered

- **Docs only / no plugins** — rejected: doesn't make the library agent-operable.
- **One mega-plugin** — rejected: a 12-field-signature problem; tiers + appliances are
  clearer and let users install only what they need.
- **A separate `dspy-plugins` repo** — rejected: keeps the marketplace away from the
  code it wraps; co-locating means a PR can change both together.

## References

- Tracking issue: roadmap + per-plugin checklist on `ruvnet/dspy.ts`.
- `dspy.ts@2.2.0` API: `configureLM`, `ChainOfThought`, `BootstrapFewShot`, `MIPROv2`,
  `GEPA`, `RetrieveModule`, `AgentDBClient`, `ReActReflexion`, `CachingLM`,
  `CompilationTracer`.
