#!/usr/bin/env node
/**
 * dspy-appliance-data-pipeline MCP server — a pre-wired DSPy.ts ETL / classification pipeline.
 * Tools: data_pipeline_init (scaffold the appliance: typed PredictModule stages in a Pipeline +
 * CSV/JSONL I/O + row metric + BootstrapFewShot helper), data_pipeline_run (process a batch
 * file → output CSV, errors per-row), data_pipeline_tune (BootstrapFewShot the classify stage
 * from a labeled file + the row metric), data_pipeline_eval (held-out accuracy + confusion matrix
 * for raw vs tuned).
 * Resources: dspy://data-pipeline/template, dspy://typed-pipeline-design, dspy://batch-classification-metrics.
 *
 * Scaffold: handlers shell out to `npx ts-node` against src/dspy/* (the copied appliance)
 * and dspy.ts (PredictModule, Pipeline, BootstrapFewShot, AgentDBClient, CachingLM, MIPROv2).
 * Flesh out the @modelcontextprotocol/sdk stdio wiring + handlers.
 */
'use strict';
const TOOLS = [
  { name: 'data_pipeline_init', description: 'Scaffold the DSPy.ts data-pipeline appliance into a repo: copy the program template to src/dspy/data-pipeline.ts (+ spec) — typed PredictModule stages (clean → classify → extract) in a Pipeline, CSV/JSONL loader, a row metric, a BootstrapFewShot tuning helper. Returns created paths.', inputSchema: { type: 'object', properties: { dest: { type: 'string' }, labels: { type: 'array', items: { type: 'string' }, description: 'the fixed classification label set' }, rawField: { type: 'string' }, stages: { type: 'array', items: { type: 'string', enum: ['clean', 'classify', 'extract'] } } } } },
  { name: 'data_pipeline_run', description: 'Run the data pipeline over a batch file (CSV/JSONL): clean → classify → extract each record. Returns the output rows (one per input; errors captured per-row as {_error}), the path of the written output CSV, and a summary (rows, errors, label distribution, mean confidence).', inputSchema: { type: 'object', properties: { input: { type: 'string', description: 'CSV with a raw-text column, or JSONL of objects' }, program: { type: 'string' }, rawField: { type: 'string' }, out: { type: 'string' }, useOptimized: { type: 'boolean' } }, required: ['input'] } },
  { name: 'data_pipeline_tune', description: 'BootstrapFewShot-tune the classify stage from a labeled file (rows with a text column + a gold label column) and the row metric (labeled + self-bootstrapped demos, optional input-conditioned dynamic demos via AgentDB). Saves <program>.optimized.json; returns {heldOutAccuracyRaw, heldOutAccuracyTuned, delta, confusionMatrix}.', inputSchema: { type: 'object', properties: { labeled: { type: 'string' }, program: { type: 'string' }, textField: { type: 'string' }, labelField: { type: 'string' }, maxLabeledDemos: { type: 'number' }, dynamicStorePath: { type: 'string' }, holdout: { type: 'number' } }, required: ['labeled'] } },
  { name: 'data_pipeline_eval', description: 'Evaluate the classify stage (raw and/or tuned) over a labeled dataset with the row metric: accuracy, per-class precision/recall, confusion matrix, label distribution.', inputSchema: { type: 'object', properties: { labeled: { type: 'string' }, program: { type: 'string' }, variant: { type: 'string', enum: ['raw', 'optimized', 'both'] } }, required: ['labeled'] } },
];
const RESOURCES = [
  { uri: 'dspy://data-pipeline/template', name: 'Data-pipeline program template', description: 'The DSPy.ts data-pipeline appliance source — typed PredictModule stages in a Pipeline + CSV/JSONL I/O + rowMetric + BootstrapFewShot helper.', mimeType: 'text/typescript' },
  { uri: 'dspy://typed-pipeline-design', name: 'Typed pipeline design guide', description: 'Stage boundaries, signature shape, the merge pattern, batch I/O, tunability.', mimeType: 'text/markdown' },
  { uri: 'dspy://batch-classification-metrics', name: 'Batch classification metrics guide', description: 'Row metric design, off-vocab/"other" handling, building a stratified labeled set, reading a confusion matrix.', mimeType: 'text/markdown' },
];
module.exports = { TOOLS, RESOURCES };
// TODO: wire @modelcontextprotocol/sdk StdioServerTransport; handlers shell out to
//       `npx ts-node` against src/dspy/* and dspy.ts (PredictModule, Pipeline, BootstrapFewShot, AgentDBClient, CachingLM, MIPROv2).
if (require.main === module) {
  process.stderr.write('[dspy-appliance-data-pipeline mcp] scaffold — handlers shell out to `npx ts-node` against src/dspy/* and dspy.ts. Tools: ' + TOOLS.map(t => t.name).join(', ') + '\n');
}
