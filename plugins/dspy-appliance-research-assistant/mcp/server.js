#!/usr/bin/env node
/**
 * dspy-appliance-research-assistant MCP server — a pre-wired DSPy.ts research assistant.
 * Tools: research_init (scaffold the appliance + create the AgentDB reflexion store),
 * research_ask (ReAct gathers evidence via the tool registry + ChainOfThought synthesizes a
 * grounded, cited answer), research_tune (MIPROv2-tune the synthesizer / ReAct thought prompt
 * against a graded set + the groundedness metric), research_status (reflexion store stats +
 * whether a tuned synthesizer is loaded).
 * Resources: dspy://research-assistant/template, dspy://research-tool-registry, dspy://synthesis-and-grounding.
 *
 * Scaffold: handlers shell out to `npx ts-node` against src/dspy/* (the copied appliance)
 * and dspy.ts (ReAct, ReActReflexion, ChainOfThought, Pipeline, AgentDBClient, MIPROv2,
 * CachingLM, CompilationTracer). Flesh out the @modelcontextprotocol/sdk stdio wiring + handlers.
 */
'use strict';
const TOOLS = [
  { name: 'research_init', description: 'Scaffold the DSPy.ts research-assistant appliance into a repo: copy the program template to src/dspy/research-assistant.ts (+ spec), create the AgentDB reflexion store. The search/fetch tools are stubs to wire to a real backend; the note tool is the bridge to the synthesizer. Returns created paths.', inputSchema: { type: 'object', properties: { dest: { type: 'string' }, reflexionPath: { type: 'string' }, maxSteps: { type: 'number' } } } },
  { name: 'research_ask', description: 'Run a research query: a ReAct agent (with reflexion) gathers evidence via search/fetch/note, then ChainOfThought synthesizes a grounded, cited answer with named gaps. Returns {answer, citations:[{source,claim}], gaps, steps:[{thought,action,observation}], evidence, recalledLessons, promotedSkill}.', inputSchema: { type: 'object', properties: { question: { type: 'string' }, program: { type: 'string' }, maxSteps: { type: 'number' }, useReflexion: { type: 'boolean' } }, required: ['question'] } },
  { name: 'research_tune', description: 'Tune the research-assistant with MIPROv2 against a graded set ([{input:{question}, output:{mustCover:[...], answerable}}]) and the groundedness/coverage metric. target: synthesizer (cheap) | gatherer (ReAct thought prompt) | both. AgentDB replay + tracer. Saves <program>.optimized.json; returns {bestScore, trials, warmStarted, delta, causalChain}.', inputSchema: { type: 'object', properties: { gradedSet: { type: 'string' }, program: { type: 'string' }, target: { type: 'string', enum: ['synthesizer', 'gatherer', 'both'] }, numTrials: { type: 'number' }, replayPath: { type: 'string' }, cachePath: { type: 'string' } }, required: ['gradedSet'] } },
  { name: 'research_status', description: 'Research-assistant status: reflexion AgentDB store stats (lessons / promoted skills / episodes / tiers / quantization) and whether a tuned synthesizer (<program>.optimized.json) is present.', inputSchema: { type: 'object', properties: { reflexionPath: { type: 'string' }, program: { type: 'string' } } } },
];
const RESOURCES = [
  { uri: 'dspy://research-assistant/template', name: 'Research-assistant program template', description: 'The DSPy.ts research-assistant appliance source — ReAct(search/fetch/note, reflexion) → ChainOfThought(synthesize) + groundedAnswerMetric.', mimeType: 'text/typescript' },
  { uri: 'dspy://research-tool-registry', name: 'Research tool registry guide', description: 'Wiring search/fetch/note to a real backend, the note-as-bridge pattern, error handling, step budget.', mimeType: 'text/markdown' },
  { uri: 'dspy://synthesis-and-grounding', name: 'Synthesis & grounding guide', description: 'The groundedness/coverage metric, building a non-overclaiming research set, tuning and validating.', mimeType: 'text/markdown' },
];
module.exports = { TOOLS, RESOURCES };
// TODO: wire @modelcontextprotocol/sdk StdioServerTransport; handlers shell out to
//       `npx ts-node` against src/dspy/* and dspy.ts (ReAct, ReActReflexion, ChainOfThought, Pipeline, AgentDBClient, MIPROv2, CachingLM, CompilationTracer).
if (require.main === module) {
  process.stderr.write('[dspy-appliance-research-assistant mcp] scaffold — handlers shell out to `npx ts-node` against src/dspy/* and dspy.ts. Tools: ' + TOOLS.map(t => t.name).join(', ') + '\n');
}
