/**
 * DSPy.ts research-assistant appliance — a ReAct agent (search / fetch / note tools) with
 * ReActReflexion, feeding a ChainOfThought synthesizer that writes a grounded, cited answer.
 * Copy this into your repo (e.g. src/dspy/research-assistant.ts), plug your real search/fetch
 * into the tool handlers, point REFLEXION_PATH at an AgentDB store, configure a real LM, then
 * tune `synthesizer` (and the ReAct thought prompt) with MIPROv2 against `groundedAnswerMetric`.
 *
 * Requires: dspy.ts@^2.2.0
 */
import {
  ReAct, ReActReflexion, ChainOfThought, Pipeline, AgentDBClient,
  type Signature, type MetricFunction, type TrainingExample,
} from 'dspy.ts';

export const REFLEXION_PATH = process.env.RESEARCH_REFLEXION_PATH ?? '.dspy/research-reflexion';

/** Tool registry. Replace the handler bodies with your real search / fetch / store. */
export function researchTools() {
  // a per-run scratchpad of gathered evidence (id -> { source, text })
  const notes: { id: string; source: string; text: string }[] = [];
  return [
    {
      name: 'search',
      description: 'search(query: string) — full-text search over your corpus / the web. Returns up to 5 result snippets with their source ids. Use to find evidence for a sub-question. Not for arithmetic; not for reading a known source (use fetch).',
      handler: async (args: { query: string }) => {
        if (!args?.query) return 'error: `query` is required';
        // TODO: real search. Stub returns nothing useful.
        return `search("${args.query}") → (no results — wire a real search backend). Source ids would look like "doc:42".`;
      },
    },
    {
      name: 'fetch',
      description: 'fetch(source: string) — retrieve the full text of a known source id (e.g. "doc:42") returned by search. Use to read past the snippet before you cite it.',
      handler: async (args: { source: string }) => {
        if (!args?.source) return 'error: `source` is required';
        // TODO: real fetch.
        return `fetch("${args.source}") → (no content — wire a real fetch backend).`;
      },
    },
    {
      name: 'note',
      description: 'note(source: string, text: string) — record a piece of evidence (a quote/fact + the source id it came from) to the scratchpad so the synthesizer can use and cite it. Call this for every fact you intend to use in the answer.',
      handler: async (args: { source: string; text: string }) => {
        if (!args?.source || !args?.text) return 'error: both `source` and `text` are required';
        const id = `n${notes.length + 1}`;
        notes.push({ id, source: args.source, text: args.text });
        return `noted ${id} (source: ${args.source})`;
      },
    },
  ];
}

export const synthesizerSignature: Signature = {
  inputs: [
    { name: 'question', type: 'string', required: true },
    { name: 'evidence', type: 'string', required: true, description: 'the gathered notes: pieces of evidence each tagged with its source id' },
  ],
  outputs: [
    { name: 'answer', type: 'string', required: true, description: "a grounded answer; if the evidence is thin or conflicting, say so — don't overclaim" },
    { name: 'citations', type: 'object', required: true, description: 'array of { source, claim } — every substantive claim mapped to the source id that supports it' },
    { name: 'gaps', type: 'object', required: false, description: 'array of sub-questions the evidence did not answer' },
  ],
};

const synthesizerPrompt = (i: { question: string; evidence: string }) => [
  'You are a research assistant. Write the answer to the question using ONLY the evidence below.',
  'Every substantive claim must be backed by a citation to the source id of the evidence that supports it. Do not cite evidence you did not use; do not state things the evidence does not support.',
  "If the evidence is thin, conflicting, or doesn't cover part of the question, say so and list the gaps — don't paper over them.",
  '',
  `Evidence:\n${i.evidence}`,
  '',
  `Question: ${i.question}`,
  'Answer:',
].join('\n');

/** ChainOfThought synthesizer — the module you tune. */
export const synthesizer = new ChainOfThought({
  name: 'ResearchSynthesizer',
  signature: synthesizerSignature,
  promptTemplate: synthesizerPrompt,
});

/** The full appliance: ReAct(gather evidence, with reflexion) → ChainOfThought(synthesize). `run({ question })` → { answer, citations, gaps, steps, recalledLessons }. */
export async function buildResearchAssistant(opts?: { maxSteps?: number }): Promise<Pipeline> {
  const store = new AgentDBClient({ vectorDimension: 384, storage: { path: REFLEXION_PATH } });
  await store.init();
  const reflexion = new ReActReflexion({ store, recallK: 3, skillThreshold: 3 });
  const gatherSignature: Signature = {
    inputs: [{ name: 'question', type: 'string', required: true }],
    outputs: [{ name: 'evidence', type: 'string', required: true, description: 'the notes recorded via the note tool, concatenated' }],
  };
  const gatherer = new ReAct({
    name: 'ResearchGatherer',
    signature: gatherSignature,
    tools: researchTools(),
    maxSteps: opts?.maxSteps ?? 8,
    reflexion,                                    // taskKey defaults from the signature/name — keep it stable per research-task type
  });
  return new Pipeline([
    { module: gatherer },
    { module: synthesizer },
  ] as any);
}

/** Metric for tuning: grounded (citations point at used evidence), covers the question, calibrated about gaps — not a confident hallucination, not a non-answer. */
export const groundedAnswerMetric: MetricFunction = (
  input: { question: string; evidence: string },
  out: { answer?: string; citations?: { source: string; claim?: string }[]; gaps?: unknown[] },
  gold?: { mustCover?: string[]; answerable?: boolean },
) => {
  if (!out?.answer) return 0;
  const said = out.answer.toLowerCase();
  const hedged = /\b(thin|conflicting|insufficient|couldn'?t find|no evidence|unclear)\b/.test(said) || (Array.isArray(out.gaps) && out.gaps.length > 0);
  if (gold?.answerable === false) return hedged ? 1 : 0.1;        // honest about no evidence
  // groundedness: citations exist and reference evidence that's actually in the gathered notes
  const cited = out.citations ?? [];
  const grounded = cited.length === 0 ? 0.3
                 : cited.every((c) => input.evidence.includes(c.source)) ? 1.0
                 : 0.15;                                          // cited something not gathered
  // coverage: did the answer touch the sub-questions we required?
  let coverage = 0.6;
  if (gold?.mustCover?.length) {
    const hit = gold.mustCover.filter((t) => said.includes(t.toLowerCase())).length;
    coverage = hit / gold.mustCover.length;
  }
  // calibration: a flat "here's the answer" with zero gaps when the question is broad is suspicious; mild bonus for naming gaps
  const calibrated = Array.isArray(out.gaps) ? Math.min(1, 0.7 + 0.3 * Math.sign(out.gaps.length)) : 0.7;
  return 0.4 * grounded + 0.4 * coverage + 0.2 * calibrated;
};

/** Tuning example shape. */
export type ResearchExample = TrainingExample<{ question: string }, { mustCover?: string[]; answerable?: boolean }>;
