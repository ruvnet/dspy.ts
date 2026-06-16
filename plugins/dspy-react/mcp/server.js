#!/usr/bin/env node
/**
 * dspy-react MCP server — exposes DSPy.ts ReAct agents (+ reflexion) as MCP tools.
 * Tools: dspy_react_new (scaffold a ReAct agent + tool registry [+ reflexion]),
 * dspy_react_run (run a ReAct program on a task, return the full trace),
 * dspy_reflexion_recall (lessons + skills for a taskKey), dspy_reflexion_status
 * (reflexion store: lessons/skills/episode counts, tiers).
 * Resources: dspy://tool-design, dspy://reflexion-loop, dspy://reflexion/{path}/lessons.
 *
 * Scaffold: handlers shell out to `npx ts-node` against src/dspy/* and dspy.ts
 * (ReAct, ReActReflexion, AgentDBClient). Flesh out the @modelcontextprotocol/sdk
 * stdio wiring + handlers.
 */
'use strict';
const TOOLS = [
  { name: 'dspy_react_new', description: 'Scaffold a DSPy.ts ReAct agent: a Signature, a tool registry (each tool {name, description, handler}), the ReAct module, and optional ReActReflexion wired to an AgentDB store. Returns the generated file paths.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, signature: { type: 'string', description: '"in1,in2 -> out1" (default "question -> answer")' }, tools: { type: 'array', items: { type: 'string' }, description: 'tool names to stub' }, reflexionPath: { type: 'string', description: 'AgentDB path for the reflexion store' }, maxSteps: { type: 'number' } }, required: ['name'] } },
  { name: 'dspy_react_run', description: 'Run a DSPy.ts ReAct program on a task; returns {answer, reasoning, steps:[{thought,action,observation}], recalledLessons, recordedEpisode, promotedSkill}.', inputSchema: { type: 'object', properties: { program: { type: 'string', description: 'src/dspy/<program>.ts' }, task: { type: 'string' }, useReflexion: { type: 'boolean' }, maxSteps: { type: 'number' } }, required: ['program', 'task'] } },
  { name: 'dspy_reflexion_recall', description: 'For a taskKey, return what ReActReflexion would inject before a run: distilled lessons (from failed episodes) and matched skills (promoted successful sequences).', inputSchema: { type: 'object', properties: { storePath: { type: 'string' }, taskKey: { type: 'string' }, recallK: { type: 'number' } }, required: ['storePath', 'taskKey'] } },
  { name: 'dspy_reflexion_status', description: 'ReActReflexion store stats: lesson count, promoted-skill count, episode count, tier counts, quantization info.', inputSchema: { type: 'object', properties: { storePath: { type: 'string' } }, required: ['storePath'] } },
];
const RESOURCES = [
  { uri: 'dspy://tool-design', name: 'Tool design guide', description: 'Designing the tool registry for a DSPy.ts ReAct agent — names, descriptions, args, error handling.', mimeType: 'text/markdown' },
  { uri: 'dspy://reflexion-loop', name: 'Reflexion loop guide', description: 'How ReActReflexion recalls lessons, records episodes, and promotes skills.', mimeType: 'text/markdown' },
  { uri: 'dspy://reflexion/{path}/lessons', name: 'Reflexion lessons', description: 'Live lessons + promoted skills from a reflexion store.', mimeType: 'application/json' },
];
module.exports = { TOOLS, RESOURCES };
// TODO: wire @modelcontextprotocol/sdk StdioServerTransport; handlers shell out to
//       `npx ts-node` against src/dspy/* and dspy.ts (ReAct, ReActReflexion, AgentDBClient).
if (require.main === module) {
  process.stderr.write('[dspy-react mcp] scaffold — handlers shell out to `npx ts-node` against src/dspy/* and dspy.ts. Tools: ' + TOOLS.map(t => t.name).join(', ') + '\n');
}
