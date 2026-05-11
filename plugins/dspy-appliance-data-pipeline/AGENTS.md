# dspy-appliance-data-pipeline — for Codex / MCP clients

A vertical appliance: a pre-wired DSPy.ts ETL / classification pipeline. Ships a ready-to-run program (`templates/data-pipeline.ts` — typed `PredictModule` stages (clean → classify → extract) in a `Pipeline`, a CSV/JSONL batch loader, a `rowMetric`, a `BootstrapFewShot` tuning helper) plus tooling to stand it up. MCP server: `mcp/server.js`, command `node ${CLAUDE_PLUGIN_ROOT}/mcp/server.js`.

**Tools**
- `data_pipeline_init` — copy the appliance program into `src/dspy/data-pipeline.ts` (+ spec); set the fixed label set, the raw-text field, which stages to keep.
- `data_pipeline_run` — process a batch file (CSV/JSONL): clean → classify → extract each record. Returns the output rows (one per input; errors captured per-row), the written output-CSV path, and a summary (rows, errors, label distribution, mean confidence).
- `data_pipeline_tune` — `BootstrapFewShot`-tune the `classify` stage from a labeled file + the row metric (labeled + self-bootstrapped demos; optional input-conditioned dynamic demos via AgentDB); saves `<program>.optimized.json`; returns held-out accuracy raw vs tuned + a confusion matrix.
- `data_pipeline_eval` — evaluate the classify stage (raw / optimized / both): accuracy, per-class precision/recall, confusion matrix, label distribution.

**Resources**: `dspy://data-pipeline/template`, `dspy://typed-pipeline-design`, `dspy://batch-classification-metrics`.

Handlers shell out to `npx ts-node` against `src/dspy/*` (the copied appliance) and `dspy.ts`. Slash commands `/data-pipeline-init`, `/data-pipeline-run`, `/data-pipeline-tune` wrap the same flows; the `data-pipeline-builder` agent designs the stages, wires batch I/O, defines the metric, and tunes from labels. Builds on `dspy-optimize` (BootstrapFewShot / MIPROv2 / `/dspy-evolve` for stronger tuning) and `dspy-observability` (`CachingLM` for big batches).
