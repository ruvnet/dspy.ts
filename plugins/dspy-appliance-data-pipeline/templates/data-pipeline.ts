/**
 * DSPy.ts data-pipeline appliance — typed PredictModules composed in a Pipeline that processes
 * a batch of records (clean → classify → extract), tuned with BootstrapFewShot from a labeled CSV.
 * Copy this into your repo (e.g. src/dspy/data-pipeline.ts), adjust the signatures/stages to your
 * schema, configure a real LM, then tune with BootstrapFewShot against `rowMetric`.
 *
 * Requires: dspy.ts@^2.2.0
 */
import {
  PredictModule, Pipeline, AgentDBClient,
  BootstrapFewShot, type BootstrapOptimizedModule,
  type Signature, type MetricFunction, type TrainingExample,
} from 'dspy.ts';

/** ---- Stage 1: normalize the raw text ---- */
const cleanSig: Signature = {
  inputs: [{ name: 'raw', type: 'string', required: true }],
  outputs: [{ name: 'text', type: 'string', required: true, description: 'the input with boilerplate/markup stripped, whitespace normalized' }],
};
export const clean = new PredictModule<{ raw: string }, { text: string }>({
  name: 'Clean', signature: cleanSig,
  promptTemplate: (i) => `Strip boilerplate/markup and normalize whitespace. Return only the cleaned text.\n---\n${i.raw}`,
});

/** ---- Stage 2: classify into a fixed label set ---- */
export const LABELS = ['billing', 'bug', 'feature_request', 'how_to', 'other'] as const;
const classifySig: Signature = {
  inputs: [{ name: 'text', type: 'string', required: true }],
  outputs: [
    { name: 'label', type: 'string', required: true, description: `one of: ${LABELS.join(', ')}` },
    { name: 'confidence', type: 'number', required: false, description: '0..1' },
  ],
};
export const classify = new PredictModule<{ text: string }, { label: string; confidence?: number }>({
  name: 'Classify', signature: classifySig,
  promptTemplate: (i) => `Classify the message into exactly one of: ${LABELS.join(', ')}.\nReturn the label (and a 0..1 confidence).\n---\n${i.text}`,
});

/** ---- Stage 3: extract structured fields (only meaningful for some labels) ---- */
const extractSig: Signature = {
  inputs: [{ name: 'text', type: 'string', required: true }, { name: 'label', type: 'string', required: true }],
  outputs: [{ name: 'fields', type: 'object', required: true, description: 'extracted fields relevant to the label; {} if none apply' }],
};
export const extract = new PredictModule<{ text: string; label: string }, { fields: Record<string, unknown> }>({
  name: 'Extract', signature: extractSig,
  promptTemplate: (i) => `For a "${i.label}" message, extract the relevant structured fields as JSON (e.g. order_id, version, feature). Return {} if none apply.\n---\n${i.text}`,
});

/** The full pipeline: clean → classify → extract. `run({ raw })` → { text, label, confidence?, fields }. */
export function buildDataPipeline(): Pipeline {
  return new Pipeline([
    { module: clean },
    { module: classify, merge: (i: { text: string }, o: { label: string; confidence?: number }) => ({ ...i, ...o }) },
    { module: extract,  merge: (i, o: { fields: Record<string, unknown> }) => ({ ...i, ...o }) },
  ] as any);
}

/** ---- batch I/O (CSV / JSONL) ---- */
export type Row = Record<string, string>;
export function parseDelimited(content: string, kind: 'csv' | 'jsonl' = 'csv'): Row[] {
  if (kind === 'jsonl') return content.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const [head, ...lines] = content.split(/\r?\n/).filter((l) => l.length);
  const cols = head.split(',').map((c) => c.trim());
  return lines.map((l) => { const v = l.split(','); return Object.fromEntries(cols.map((c, k) => [c, (v[k] ?? '').trim()])); });
}
export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set<string>()));
  const esc = (v: unknown) => { const s = typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc((r as Row)[c])).join(','))].join('\n');
}

/** Run the pipeline over a batch. Returns one output row per input row (errors captured as { _error }). */
export async function runBatch(rows: Row[], rawField = 'raw'): Promise<Record<string, unknown>[]> {
  const pipe = buildDataPipeline();
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    try { out.push({ ...r, ...(await pipe.run({ raw: r[rawField] ?? '' })) }); }
    catch (e) { out.push({ ...r, _error: (e as Error).message }); }
  }
  return out;
}

/** Row-level metric for tuning the `classify` stage: accuracy with a partial-credit fallback; "other" misuse penalised. */
export const rowMetric: MetricFunction = (
  _in: { text: string },
  out: { label?: string; confidence?: number },
  gold?: { label?: string },
) => {
  if (!out?.label) return 0;
  const got = out.label.trim().toLowerCase();
  if (!(LABELS as readonly string[]).includes(got)) return 0.1;          // off-vocabulary label
  if (!gold?.label) return got === 'other' ? 0.3 : 0.5;                  // no gold: a confident specific label is plausibly fine
  const g = gold.label.trim().toLowerCase();
  if (got === g) return 1;
  if (got === 'other' || g === 'other') return 0.2;                      // confusing a real class with "other" (either direction) is bad
  return 0.3;                                                            // wrong, but a real attempt
};

/** Helper: BootstrapFewShot-tune the `classify` stage from a labeled trainset (optionally with input-conditioned dynamic demos via AgentDB). */
export async function tuneClassify(
  trainset: TrainingExample<{ text: string }, { label: string }>[],
  opts?: { maxLabeledDemos?: number; dynamicStorePath?: string },
): Promise<BootstrapOptimizedModule<{ text: string }, { label: string; confidence?: number }>> {
  let store: AgentDBClient | undefined;
  if (opts?.dynamicStorePath) { store = new AgentDBClient({ vectorDimension: 384, storage: { path: opts.dynamicStorePath } }); await store.init(); }
  const opt = new BootstrapFewShot(rowMetric, {
    maxLabeledDemos: opts?.maxLabeledDemos ?? 8,
    maxBootstrappedDemos: 4,
    dynamicDemos: store ? { store, k: 3 } : undefined,
  });
  return (await opt.compile(classify as any, trainset as any)) as any;
}

export type DataExample = TrainingExample<{ text: string }, { label: string }>;
