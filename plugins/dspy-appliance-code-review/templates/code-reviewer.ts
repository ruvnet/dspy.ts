/**
 * DSPy.ts code-review appliance — RetrieveModule pulls repo context (conventions, related
 * code, prior reviews) from an AgentDB index → ChainOfThought produces a structured review.
 * Copy this into your repo (e.g. src/dspy/code-reviewer.ts), point CONTEXT_PATH at an
 * AgentDB index (build it with `/code-review-init`), configure a real LM, then tune
 * `reviewer` with GEPA against the `actionabilityMetric` below.
 *
 * Requires: dspy.ts@^2.2.0
 */
import {
  RetrieveModule, ChainOfThought, Pipeline, AgentDBClient,
  type Signature, type MetricFunction, type TrainingExample,
} from 'dspy.ts';

export const CONTEXT_PATH = process.env.REVIEW_CONTEXT_PATH ?? '.dspy/review-context';

/** Index of repo context: coding conventions, representative modules, ADRs, prior PR reviews. */
export async function openReviewContext(): Promise<AgentDBClient> {
  const ctx = new AgentDBClient({
    vectorDimension: 384,
    storage: { path: CONTEXT_PATH },
    performance: { batchEnabled: true /*, quantization: 'rabitq', rerankFactor: 3 */ },
  });
  await ctx.init();
  return ctx;
}

export const reviewerSignature: Signature = {
  inputs: [
    { name: 'diff', type: 'string', required: true, description: 'unified diff or file content under review' },
    { name: 'context', type: 'string', required: true, description: 'retrieved repo context: conventions, related code, prior reviews' },
    { name: 'intent', type: 'string', required: false, description: 'what the change is supposed to do (PR title/description)' },
  ],
  outputs: [
    { name: 'summary', type: 'string', required: true, description: 'one-paragraph assessment: ship / changes-needed / blocked, and why' },
    { name: 'findings', type: 'object', required: true, description: 'array of { severity: "blocker"|"major"|"minor"|"nit", location, issue, suggestion } — each tied to a specific line/symbol with a concrete fix' },
    { name: 'questions', type: 'object', required: false, description: 'array of clarifying questions for the author' },
  ],
};

const reviewerPrompt = (i: { diff: string; context: string; intent?: string }) => [
  'You are a senior code reviewer for THIS repository. Review the change below.',
  'Use the repo context to judge against the project\'s conventions and patterns — do not invent rules; cite the convention/related code when you flag something.',
  'Every finding MUST name a specific location (file:line or symbol), state the issue, and give a concrete suggested fix. No vague "consider refactoring".',
  'Tag each finding: blocker (must fix), major (should fix), minor (nice to fix), nit (style). Be honest — if it\'s good, say "ship it" with few/no findings; don\'t pad.',
  '',
  i.intent ? `Intent: ${i.intent}` : '',
  `Repo context:\n${i.context}`,
  '',
  `Change under review:\n${i.diff}`,
  '',
  'Review:',
].filter(Boolean).join('\n');

/** ChainOfThought reviewer — the module you tune with GEPA/MIPROv2. */
export const reviewer = new ChainOfThought({
  name: 'CodeReviewer',
  signature: reviewerSignature,
  promptTemplate: reviewerPrompt,
});

/** The full appliance: Retrieve(repo context for this diff) → ChainOfThought review. `run({ diff, intent? })` → { summary, findings, questions, passages, context }. */
export async function buildCodeReviewer(opts?: { k?: number; mmrLambda?: number }): Promise<Pipeline> {
  const ctx = await openReviewContext();
  const retrieve = new RetrieveModule({
    client: ctx,
    k: opts?.k ?? 6,
    useMMR: true,                                 // diverse context: conventions + related code + prior reviews, not 6 near-dupes
    mmrLambda: opts?.mmrLambda ?? 0.4,
    overFetchFactor: 3,
    textField: 'text',
  });
  return new Pipeline([
    { module: retrieve, map: (i: { diff: string; intent?: string }) => ({ query: `${i.intent ?? ''}\n${i.diff}`.slice(0, 4000) }), merge: (i, o: { context: string }) => ({ ...i, context: o.context }) },
    { module: reviewer },
  ] as any);
}

/** Actionability metric: a good review is specific, located, severity-calibrated, and matches the known issues — not a wall of vague nits, not silence on real problems. */
export const actionabilityMetric: MetricFunction = (
  _in: { diff: string; context: string },
  out: { summary?: string; findings?: { severity: string; location?: string; issue?: string; suggestion?: string }[] },
  gold?: { knownIssues?: { severity: string; near?: string }[]; verdict?: 'ship' | 'changes' | 'blocked' },
) => {
  if (!out?.summary || !Array.isArray(out.findings)) return 0;
  const f = out.findings;
  // specificity: each finding should have a location AND a concrete suggestion
  const specific = f.length === 0 ? 1 : f.filter((x) => x.location && x.suggestion && x.suggestion.length > 8).length / f.length;
  // calibration: it shouldn't be all nits or all blockers; some spread is healthy when there are findings
  const sev = new Set(f.map((x) => x.severity));
  const calibrated = f.length === 0 ? 1 : Math.min(1, 0.5 + 0.5 * (sev.size / 4));
  // coverage vs known issues (if we have gold): did it catch the real ones, without drowning them in noise?
  let coverage = 0.6;
  if (gold?.knownIssues?.length) {
    const hit = gold.knownIssues.filter((ki) => f.some((x) => (x.location ?? '').includes(ki.near ?? '') || (x.issue ?? '').length > 0 && JSON.stringify(x).toLowerCase().includes((ki.near ?? '').toLowerCase()))).length;
    const recall = hit / gold.knownIssues.length;
    const noise = Math.max(0, f.length - gold.knownIssues.length) / Math.max(1, gold.knownIssues.length);
    coverage = Math.max(0, recall - 0.15 * noise);
  } else if (gold?.verdict === 'ship') {
    coverage = f.filter((x) => x.severity === 'blocker' || x.severity === 'major').length === 0 ? 1 : 0.2; // false alarms on a clean PR
  }
  return 0.4 * coverage + 0.35 * specific + 0.25 * calibrated;
};

/** Tuning example shape. gold.knownIssues describes the real problems; gold.verdict the expected call. */
export type ReviewExample = TrainingExample<{ diff: string; intent?: string }, { knownIssues?: { severity: string; near?: string }[]; verdict?: 'ship' | 'changes' | 'blocked' }>;
