/**
 * DSPy.ts support-bot appliance — RetrieveModule (MMR over an AgentDB KB) → ChainOfThought
 * answer with citations. Copy this into your repo (e.g. src/dspy/support-bot.ts), point
 * KB_PATH at an AgentDB corpus (build it with `dspy-rag`'s /dspy-index), configure a real
 * LM, then tune `answerer` with MIPROv2 against the `supportMetric` below.
 *
 * Requires: dspy.ts@^2.2.0
 */
import {
  RetrieveModule, ChainOfThought, Pipeline, AgentDBClient,
  type Signature, type MetricFunction, type TrainingExample,
} from 'dspy.ts';

export const KB_PATH = process.env.SUPPORT_KB_PATH ?? '.dspy/support-kb';

/** A knowledge-base corpus. Build/extend it with `/dspy-index <KB_PATH> <docs>`. */
export async function openKB(): Promise<AgentDBClient> {
  const kb = new AgentDBClient({
    vectorDimension: 384,                       // ONNX embeddings; falls back to hashEmbed
    storage: { path: KB_PATH },
    performance: { batchEnabled: true /*, quantization: 'rabitq', rerankFactor: 3 */ },
  });
  await kb.init();
  return kb;
}

export const answererSignature: Signature = {
  inputs: [
    { name: 'question', type: 'string', required: true },
    { name: 'context', type: 'string', required: true, description: 'retrieved KB passages' },
  ],
  outputs: [
    { name: 'answer', type: 'string', required: true, description: "the answer, grounded in context; say \"I don't know\" if context doesn't cover it" },
    { name: 'citations', type: 'object', required: false, description: 'array of { source } the answer relied on' },
  ],
};

const answererPrompt = (i: { question: string; context: string }) => [
  'You are a support assistant. Answer the user using ONLY the knowledge-base context below.',
  "If the context does not contain the answer, say you don't know and suggest where to look — do not guess.",
  'For each claim in your answer, cite the source it came from.',
  '',
  `Context:\n${i.context}`,
  '',
  `Question: ${i.question}`,
  'Answer:',
].join('\n');

/** ChainOfThought answerer — this is the module you tune with MIPROv2/GEPA. */
export const answerer = new ChainOfThought({
  name: 'SupportAnswerer',
  signature: answererSignature,
  promptTemplate: answererPrompt,
});

/** The full appliance: Retrieve (MMR) → ChainOfThought. `run({ question })` → { answer, citations, passages, context }. */
export async function buildSupportBot(opts?: { k?: number; mmrLambda?: number }): Promise<Pipeline> {
  const kb = await openKB();
  const retrieve = new RetrieveModule({
    client: kb,
    k: opts?.k ?? 4,
    useMMR: true,
    mmrLambda: opts?.mmrLambda ?? 0.5,
    overFetchFactor: 3,
    textField: 'text',
  });
  // Pipeline step 1: { question } -> { question, context }   (retrieve)
  // Pipeline step 2: { question, context } -> { answer, citations }  (answerer)
  return new Pipeline([
    { module: retrieve, map: (i: { question: string }) => ({ query: i.question }), merge: (i, o: { context: string }) => ({ ...i, context: o.context }) },
    { module: answerer },
  ] as any);
}

/** Quality metric for tuning: helpfulness × groundedness, with "I don't know" treated as correct when the KB lacks the answer. */
export const supportMetric: MetricFunction = (
  input: { question: string; context: string },
  out: { answer?: string; citations?: { source: string }[] },
  gold?: { answer?: string; answerable?: boolean },
) => {
  if (!out?.answer) return 0;
  const said = out.answer.toLowerCase();
  const punted = /\b(i (don'?t|do not) know|not (sure|covered)|isn'?t in|no information)\b/.test(said);
  // honesty: if the KB can't answer (gold.answerable === false), punting IS the right answer
  if (gold && gold.answerable === false) return punted ? 1 : 0.1;
  // helpfulness
  let q: number;
  if (gold?.answer) {
    const g = gold.answer.trim().toLowerCase();
    q = said === g ? 1 : said.includes(g) ? 0.6 : 0.25;
  } else {
    q = punted ? 0.2 : 0.5;                       // no gold: a confident answer is plausibly fine, a punt is weak
  }
  // groundedness: cited sources should appear in the retrieved context
  const cited = out.citations ?? [];
  const f = cited.length === 0 ? 0.4
          : cited.every((c) => input.context.includes(c.source)) ? 1.0
          : 0.2;                                  // hallucinated citation
  return 0.6 * q + 0.4 * f;
};

/** Shape of the Q/A set you tune against. answerable:false ⇒ the KB intentionally doesn't cover it (tests honesty). */
export type SupportExample = TrainingExample<{ question: string }, { answer?: string; answerable?: boolean }>;
