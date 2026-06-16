# dspy-appliance-code-review — for Codex / MCP clients

A vertical appliance: a pre-wired DSPy.ts code-review pipeline. Ships a ready-to-run program (`templates/code-reviewer.ts` — `RetrieveModule` pulls repo context → `ChainOfThought` produces a structured review + an `actionabilityMetric`) plus tooling to stand it up. MCP server: `mcp/server.js`, command `node ${CLAUDE_PLUGIN_ROOT}/mcp/server.js`.

**Tools**
- `code_review_init` — copy the appliance program into `src/dspy/code-reviewer.ts` (+ spec), build the AgentDB repo-context index (conventions, ADRs, representative modules, prior PR reviews).
- `code_review_run` — review a diff/file: retrieves relevant repo context, returns `{summary, findings:[{severity,location,issue,suggestion}], questions, passages, context}`.
- `code_review_tune` — GEPA-tune (or MIPROv2) the reviewer against a labelled set (`[{input:{diff,intent?}, output:{knownIssues:[{severity,near}], verdict}}]`) and the actionability metric (coverage − noise, specificity, calibration; false alarms on clean PRs penalised); saves `<program>.gepa.json`.
- `code_review_status` — context-index stats + whether a tuned reviewer is loaded.

**Resources**: `dspy://code-reviewer/template`, `dspy://review-context-indexing`, `dspy://review-actionability-metric`.

Handlers shell out to `npx ts-node` against `src/dspy/*` (the copied appliance) and `dspy.ts`. Slash commands `/code-review-init`, `/code-review-run`, `/code-review-tune` wrap the same flows; the `code-review-builder` agent stands up and tunes a reviewer for a specific repo. Builds on `dspy-rag` (index/retrieve), `dspy-optimize` + `dspy-evolution` (GEPA/MIPROv2 tuning), `dspy-observability` (tracer, cache).
