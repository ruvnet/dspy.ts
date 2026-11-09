# dspy-optimize — for Codex / MCP clients

This plugin ships an MCP server (`mcp/server.js`, command `node ${CLAUDE_PLUGIN_ROOT}/mcp/server.js`) that runs DSPy.ts optimizer campaigns.

**Tools**
- `dspy_mipro` — MIPROv2: instruction proposal + demo bootstrapping + seeded search over a DSPy.ts program. Pass `replayPath` (an AgentDB dir) to warm-start later compiles of the same task; `trace: true` attaches a CompilationTracer.
- `dspy_gepa` — GEPA: reflective Pareto-frontier prompt evolution that targets the weakest examples each iteration. Pass `storePath` to persist + continue the frontier across runs. Needs a *graded* metric, not binary.
- `dspy_bootstrap` — BootstrapFewShot: labeled + self-bootstrapped demos. Pass `dynamicPath` so the compiled module picks input-conditioned demos at run time.
- `dspy_replay_status` — inspect an AgentDB replay/frontier/dynamic-demo store (vector count, dimension, tiers, quantization).

**Resources**: `dspy://optimizer-selection`, `dspy://experience-replay`, `dspy://traces/{runId}`.

The handlers shell out to `npx ts-node` against `src/dspy/*` (your program + its `metric`) and to `dspy.ts`. Slash commands `/dspy-mipro`, `/dspy-gepa`, `/dspy-bootstrap` wrap the same flows for interactive use; the `optimizer-engineer` agent runs full campaigns.
