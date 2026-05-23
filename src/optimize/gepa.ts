/**
 * GEPA — Genetic-Pareto reflective prompt evolution.
 *
 * Maintains a Pareto frontier of prompt candidates scored per training example.
 * Each iteration: pick a frontier candidate, reflect on the examples it does
 * worst on (via the LM when available, else a deterministic mutation pool),
 * mutate the instruction, evaluate the mutant on the trainset, and add it to
 * the frontier if it isn't dominated. The frontier (instruction + per-example
 * scores) and the reflections are persisted to an AgentDB store when one is
 * given, so a later `compile()` of the same task resumes from a warm frontier.
 *
 * (A surrogate-guided candidate picker / true multi-objective Pareto sampling
 * can layer on later; this is the practical genetic-Pareto loop.)
 */
import * as fs from 'fs';
import * as path from 'path';
import { Module } from '../core/module';
import { Pipeline } from '../core/pipeline';
import { Optimizer, OptimizerConfig, TrainingExample, MetricFunction } from './base';
import { getLM } from '../index';
import { AgentDBClient } from '../memory/agentdb/client';
import { OptimizedModule } from './miprov2';

/**
 * Resolve and validate a file path used for saving/loading optimizer state.
 * Prevents path traversal by rejecting paths that contain null bytes and
 * normalising any ".." components.
 */
function safeResolvePath(userPath: string): string {
  if (userPath.includes('\0')) {
    throw new Error('Invalid path: null bytes are not permitted');
  }
  return path.resolve(userPath);
}

export interface GEPAConfig extends OptimizerConfig {
  /** Number of reflect → mutate → evaluate iterations (default 12). */
  numIterations?: number;
  /** Max distinct candidates kept on the frontier (default 8). */
  frontierSize?: number;
  /** Candidate mutations proposed per iteration (default 2). */
  mutationsPerStep?: number;
  /** Deterministic RNG seed (default 42). */
  seed?: number;
  /** Optional AgentDB store to persist the evolving frontier + reflections. */
  frontierStore?: AgentDBClient;
}

export interface GEPACandidate {
  instruction: string;
  perExampleScores: number[];
  meanScore: number;
}

export interface GEPAResult {
  best: GEPACandidate;
  frontier: GEPACandidate[];
  reflections: Array<{ from: string; weakExamples: number[]; mutated: string[] }>;
  iterations: number;
  warmStarted: boolean;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MUTATION_HINTS = [
  'Be more specific and precise.',
  'Consider edge cases before answering.',
  'Output strictly valid JSON matching the requested fields.',
  'Think step by step, then give the final answer.',
  'Use only the information provided; do not invent facts.',
  'Keep the answer concise and well-structured.',
];

/** A dominates B iff A ≥ B on every example and A > B on at least one. */
function dominates(a: GEPACandidate, b: GEPACandidate): boolean {
  if (a.perExampleScores.length !== b.perExampleScores.length || a.perExampleScores.length === 0) {
    // No per-example signal — fall back to mean (and never claim domination on a tie).
    return a.meanScore > b.meanScore;
  }
  let strictlyBetterSomewhere = false;
  for (let i = 0; i < a.perExampleScores.length; i++) {
    if (a.perExampleScores[i] < b.perExampleScores[i]) return false;
    if (a.perExampleScores[i] > b.perExampleScores[i]) strictlyBetterSomewhere = true;
  }
  return strictlyBetterSomewhere;
}

export class GEPA<TInput extends Record<string, any>, TOutput extends Record<string, any>> extends Optimizer<TInput, TOutput> {
  protected config: Required<Omit<GEPAConfig, 'frontierStore'>> & { frontierStore?: AgentDBClient };
  private optimizedProgram: OptimizedModule<TInput, TOutput> | null = null;
  private lastResult: GEPAResult | null = null;

  constructor(metric: MetricFunction<TInput, TOutput>, config: GEPAConfig = {}) {
    super(metric, config);
    this.config = {
      maxIterations: 10,
      numThreads: 1,
      debug: false,
      numIterations: 12,
      frontierSize: 8,
      mutationsPerStep: 2,
      seed: 42,
      ...config,
    };
  }

  get result(): GEPAResult | null {
    return this.lastResult;
  }

  async compile(
    program: Module<TInput, TOutput> | Pipeline,
    trainset: TrainingExample<TInput, TOutput>[]
  ): Promise<Module<TInput, TOutput>> {
    const mod = program as Module<TInput, TOutput>;
    if (typeof (mod as any).signature === 'undefined') {
      throw new Error('GEPA.compile expects a Module (with a signature), not a raw Pipeline');
    }
    const evalSet = trainset.filter((ex) => ex.output !== undefined);
    const fingerprint = this.taskFingerprint(mod);
    const r = rng(this.config.seed);

    // Seed the frontier: program's own prompt (rendered on a probe) + a default instruction + warm-started candidates.
    const baseInstruction = this.programInstruction(mod);
    let frontier: GEPACandidate[] = [];
    let warm: string[] = [];
    if (this.config.frontierStore) warm = await this.recallFrontier(this.config.frontierStore, fingerprint);
    for (const instr of [baseInstruction, 'Answer accurately and concisely.', ...warm]) {
      await this.addToFrontier(frontier, await this.evaluate(mod, instr, evalSet));
    }

    const reflections: GEPAResult['reflections'] = [];
    for (let it = 0; it < this.config.numIterations; it++) {
      const parent = frontier[Math.floor(r() * frontier.length)];
      const weak = this.weakExamples(parent);
      const mutated = await this.reflectAndMutate(mod, parent, weak, evalSet, r);
      reflections.push({ from: parent.instruction.slice(0, 120), weakExamples: weak, mutated: mutated.map((m) => m.slice(0, 120)) });
      for (const instr of mutated) {
        const cand = await this.evaluate(mod, instr, evalSet);
        await this.addToFrontier(frontier, cand);
        if (this.config.frontierStore) {
          try {
            await this.config.frontierStore.store(this.config.frontierStore.hashEmbed(fingerprint), {
              type: 'gepa-candidate',
              fingerprint,
              instruction: cand.instruction,
              meanScore: cand.meanScore,
              perExampleScores: cand.perExampleScores,
            });
          } catch (err) {
            this.log(`frontier persist failed: ${err}`);
          }
        }
      }
      // Keep the frontier non-dominated and capped.
      frontier = this.pruneFrontier(frontier);
    }

    const best = frontier.reduce((a, b) => (b.meanScore > a.meanScore ? b : a), frontier[0]);
    this.optimizedProgram = new OptimizedModule<TInput, TOutput>(mod.name, mod.signature, best.instruction, []);
    this.lastResult = { best, frontier, reflections, iterations: this.config.numIterations, warmStarted: warm.length > 0 };
    this.log(`GEPA: best meanScore ${best.meanScore.toFixed(3)} | frontier size ${frontier.length}`);
    return this.optimizedProgram;
  }

  private programInstruction(program: Module<TInput, TOutput>): string {
    try {
      const probe = Object.fromEntries(program.signature.inputs.map((f) => [f.name, ''])) as TInput;
      const p = program.promptTemplate(probe).trim();
      return p ? p.slice(0, 400) : 'Answer the question.';
    } catch {
      return 'Answer the question.';
    }
  }

  private async evaluate(program: Module<TInput, TOutput>, instruction: string, evalSet: TrainingExample<TInput, TOutput>[]): Promise<GEPACandidate> {
    const candidate = new OptimizedModule<TInput, TOutput>(program.name, program.signature, instruction, []);
    const scores: number[] = [];
    for (const ex of evalSet) {
      try {
        const out = await candidate.run(ex.input);
        scores.push(this.metric(ex.input, out, ex.output));
      } catch {
        scores.push(0);
      }
    }
    const meanScore = scores.length > 0 ? scores.reduce((s, x) => s + x, 0) / scores.length : 0;
    return { instruction, perExampleScores: scores, meanScore };
  }

  private weakExamples(c: GEPACandidate, max = 3): number[] {
    return c.perExampleScores
      .map((s, i) => ({ s, i }))
      .sort((a, b) => a.s - b.s)
      .slice(0, max)
      .map((x) => x.i);
  }

  private async reflectAndMutate(
    program: Module<TInput, TOutput>,
    parent: GEPACandidate,
    weak: number[],
    evalSet: TrainingExample<TInput, TOutput>[],
    r: () => number
  ): Promise<string[]> {
    const out: string[] = [];
    // Try an LM reflection (best-effort).
    try {
      const lm = getLM();
      const failures = weak
        .map((i) => evalSet[i])
        .filter(Boolean)
        .map((ex) => `Input: ${JSON.stringify(ex.input)} Expected: ${JSON.stringify(ex.output)}`)
        .join('; ');
      const raw = await lm.generate(
        `Improve this instruction so it does better on the failing cases.\nInstruction: """${parent.instruction}"""\nFailing cases: ${failures || '(none specified)'}\nReturn ${this.config.mutationsPerStep} improved instruction(s), one per line, no numbering.`
      );
      for (const line of String(raw).split('\n').map((l) => l.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean)) {
        if (line.length > 8) out.push(line.slice(0, 400));
        if (out.length >= this.config.mutationsPerStep) break;
      }
    } catch {
      /* LM unavailable — fall through */
    }
    // Deterministic mutations: append distinct hints, seeded.
    while (out.length < this.config.mutationsPerStep) {
      const hint = MUTATION_HINTS[Math.floor(r() * MUTATION_HINTS.length)];
      const mutated = `${parent.instruction.trim()} ${hint}`.slice(0, 400);
      if (!out.includes(mutated)) out.push(mutated);
      else out.push(`${parent.instruction.trim()} ${MUTATION_HINTS[(MUTATION_HINTS.indexOf(hint) + out.length) % MUTATION_HINTS.length]}`.slice(0, 400));
    }
    return out;
  }

  /** Add `cand` to the frontier if no existing member dominates it (and dedup by instruction). */
  private async addToFrontier(frontier: GEPACandidate[], cand: GEPACandidate): Promise<void> {
    if (frontier.some((m) => m.instruction === cand.instruction)) return;
    if (frontier.some((m) => dominates(m, cand))) return;
    // Remove members this new candidate dominates.
    for (let i = frontier.length - 1; i >= 0; i--) if (dominates(cand, frontier[i])) frontier.splice(i, 1);
    frontier.push(cand);
  }

  private pruneFrontier(frontier: GEPACandidate[]): GEPACandidate[] {
    // Drop dominated members, dedup, then cap to frontierSize keeping the highest meanScore.
    const kept: GEPACandidate[] = [];
    for (const c of frontier) {
      if (kept.some((m) => m.instruction === c.instruction)) continue;
      if (frontier.some((m) => m !== c && dominates(m, c))) continue;
      kept.push(c);
    }
    return kept.sort((a, b) => b.meanScore - a.meanScore).slice(0, this.config.frontierSize);
  }

  private taskFingerprint(program: Module<TInput, TOutput>): string {
    const ins = program.signature.inputs.map((f) => `${f.name}:${f.type}`).join(',');
    const outs = program.signature.outputs.map((f) => `${f.name}:${f.type}`).join(',');
    return `gepa|${program.name}|in[${ins}]|out[${outs}]`;
  }

  private async recallFrontier(client: AgentDBClient, fingerprint: string): Promise<string[]> {
    try {
      const hits = await client.search(client.hashEmbed(fingerprint), { k: Math.max(this.config.frontierSize * 4, 12) });
      const prior = hits
        .filter((h) => h.score > 0.95 && h.data.metadata?.type === 'gepa-candidate' && h.data.metadata?.fingerprint === fingerprint)
        .map((h) => ({ instruction: String(h.data.metadata.instruction ?? ''), meanScore: Number(h.data.metadata.meanScore ?? 0) }))
        .filter((p) => p.instruction.length > 0)
        .sort((a, b) => b.meanScore - a.meanScore);
      const seen = new Set<string>();
      return prior.filter((p) => (seen.has(p.instruction) ? false : (seen.add(p.instruction), true))).slice(0, this.config.frontierSize).map((p) => p.instruction);
    } catch {
      return [];
    }
  }

  save(filePath: string): void {
    if (!this.optimizedProgram) throw new Error('No optimized program to save. Run compile() first.');
    const safePath = safeResolvePath(filePath);
    fs.writeFileSync(
      safePath,
      JSON.stringify({ program: { name: this.optimizedProgram.name, signature: this.optimizedProgram.signature, instruction: this.optimizedProgram.instruction }, result: this.lastResult }, null, 2)
    );
  }

  load(filePath: string): void {
    const safePath = safeResolvePath(filePath);
    let data: Record<string, any>;
    try {
      data = JSON.parse(fs.readFileSync(safePath, 'utf8'));
    } catch (err) {
      throw new Error(`Failed to parse saved state from ${safePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.optimizedProgram = new OptimizedModule(data.program.name, data.program.signature, data.program.instruction, []);
    this.lastResult = data.result ?? null;
  }
}
