# dspy-appliance-support-bot — for Codex / MCP clients

A vertical appliance: a pre-wired DSPy.ts support assistant. Ships a ready-to-run program (`templates/support-bot.ts` — `RetrieveModule` MMR over an AgentDB KB → `ChainOfThought` answer with citations + a `supportMetric`) plus tooling to stand it up. MCP server: `mcp/server.js`, command `node ${CLAUDE_PLUGIN_ROOT}/mcp/server.js`.

**Tools**
- `support_bot_init` — copy the appliance program into `src/dspy/support-bot.ts` (+ spec), create the AgentDB knowledge base, optionally index a docs dir/glob.
- `support_bot_ask` — ask a question: retrieves KB passages (MMR), answers with ChainOfThought grounded in them. Returns `{answer, citations, passages, context}`.
- `support_bot_tune` — MIPROv2-tune the answerer against a Q/A set (`[{input:{question}, output:{answer?, answerable?}}]` — include `answerable:false` cases) and the quality metric (helpfulness + groundedness + honest "I don't know"); AgentDB replay + tracer; saves `<program>.optimized.json`.
- `support_bot_status` — KB stats + whether a tuned answerer is loaded.

**Resources**: `dspy://support-bot/template`, `dspy://support-kb-curation`, `dspy://support-answer-quality`.

Handlers shell out to `npx ts-node` against `src/dspy/*` (the copied appliance) and `dspy.ts`. Slash commands `/support-bot-init`, `/support-bot-ask`, `/support-bot-tune` wrap the same flows; the `support-bot-builder` agent stands up and tunes a bot for a specific KB. Builds on `dspy-rag` (index/retrieve), `dspy-optimize` (MIPROv2), `dspy-observability` (tracer, cache), and `dspy-evolution` (`/dspy-evolve` for ongoing prompt evolution).
