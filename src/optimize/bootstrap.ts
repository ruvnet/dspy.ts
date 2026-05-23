/**
 * Bootstrap Few-Shot optimizer.
 *
 * Generates demonstrations (labeled examples from the trainset + bootstrapped
 * ones produced by running the program). With `dynamicDemos` configured, the
 * compiled module selects, *per input at run time*, the demos whose inputs are
 * most similar to the current input (vector search over the AgentDB store) —
 * instead of baking a single fixed demo set into the prompt.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Module } from '../core/module';
import { Pipeline } from '../core/pipeline';
import { Optimizer, OptimizerConfig, TrainingExample, MetricFunction } from './base';
import { getLM } from '../index';
import { Signature } from '../core/signature';
import { AgentDBClient } from '../memory/agentdb/client';

/**
 * Resolve and validate a file path used for saving/loading optimizer state.
 * Prevents path traversal by rejecting paths that escape the current working
 * directory or that contain null bytes.
 */
function safeResolvePath(userPath: string): string {
  if (userPath.includes('\0')) {
    throw new Error('Invalid path: null bytes are not permitted');
  }
  const resolved = path.resolve(userPath);
  // Paths must stay within cwd or an explicit absolute path chosen by the
  // caller — we only reject null bytes and normalise the path so that
  // callers always get a clean absolute path, removing ".." components.
  return resolved;
}

export interface BootstrapConfig extends OptimizerConfig {
  maxLabeledDemos?: number;
  maxBootstrappedDemos?: number;
  minScore?: number;
  /**
   * Dynamic (input-conditioned) demo selection. When set, all generated demos
   * are indexed in `store`; at run time the compiled module retrieves the `k`
   * demos nearest to the current input and uses those. Otherwise the full demo
   * set is baked into the prompt.
   */
  dynamicDemos?: { store: AgentDBClient; k?: number };
}

/** A module whose prompt = few-shot demos (fixed, or input-conditioned) + the input, calling the global LM. */
export class BootstrapOptimizedModule<TInput extends Record<string, any>, TOutput extends Record<string, any>> extends Module<TInput, TOutput> {
  public readonly demos: TrainingExample<TInput, TOutput>[];
  private readonly dynamic?: { store: AgentDBClient; k: number };

  constructor(
    name: string,
    signature: Signature,
    demos: TrainingExample<TInput, TOutput>[],
    dynamic?: { store: AgentDBClient; k: number }
  ) {
    super({
      name,
      signature,
      strategy: 'Predict',
      promptTemplate: (input: TInput) => BootstrapOptimizedModule.buildPrompt(demos, input),
    });
    this.demos = demos;
    this.dynamic = dynamic;
  }

  static buildPrompt(demos: Array<{ input: any; output?: any }>, input: any): string {
    const demoText = demos
      .filter((d) => d.output !== undefined)
      .map((d) => `Example:\nInput: ${JSON.stringify(d.input)}\nExpected Output: ${JSON.stringify(d.output)}`)
      .join('\n\n');
    const head = demoText ? `${demoText}\n\n` : '';
    return `${head}Analyze the following input and respond in JSON format:\nInput: ${JSON.stringify(input)}\n\nResponse:`;
  }

  /** The demos this module would use for `input` — the `k` nearest from the store when dynamic, else the fixed set. */
  async selectDemos(input: TInput): Promise<TrainingExample<TInput, TOutput>[]> {
    if (!this.dynamic) return this.demos;
    try {
      const emb = this.dynamic.store.hashEmbed(JSON.stringify(input));
      const hits = await this.dynamic.store.search(emb, { k: this.dynamic.k });
      const picked = hits
        .map((h) => h.data.metadata?.demo as TrainingExample<TInput, TOutput> | undefined)
        .filter((d): d is TrainingExample<TInput, TOutput> => Boolean(d));
      return picked.length > 0 ? picked : this.demos;
    } catch {
      return this.demos;
    }
  }

  async run(input: TInput): Promise<TOutput> {
    this.validateInput(input);
    const demos = await this.selectDemos(input);
    const lm = getLM();
    const response = await lm.generate(BootstrapOptimizedModule.buildPrompt(demos, input));
    let output: TOutput;
    try {
      output = JSON.parse(response) as TOutput;
    } catch {
      if (this.signature.outputs.length === 1 && this.signature.outputs[0].type === 'string') {
        output = { [this.signature.outputs[0].name]: response } as TOutput;
      } else {
        throw new Error('Failed to parse LM response');
      }
    }
    this.validateOutput(output);
    return output;
  }
}

export class BootstrapFewShot<
  TInput extends Record<string, any>,
  TOutput extends Record<string, any>
> extends Optimizer<TInput, TOutput> {
  protected config: Required<Omit<BootstrapConfig, 'dynamicDemos'>> & { dynamicDemos?: { store: AgentDBClient; k?: number } };
  private optimizedProgram: BootstrapOptimizedModule<TInput, TOutput> | null = null;

  constructor(metric: MetricFunction<TInput, TOutput>, config: BootstrapConfig = {}) {
    super(metric, config);
    this.config = {
      maxIterations: 10,
      numThreads: 1,
      debug: false,
      maxLabeledDemos: 4,
      maxBootstrappedDemos: 4,
      minScore: 0.7,
      ...config,
    };
  }

  private async generateDemonstrations(
    program: Module<TInput, TOutput>,
    trainset: TrainingExample<TInput, TOutput>[]
  ): Promise<TrainingExample<TInput, TOutput>[]> {
    const demos: TrainingExample<TInput, TOutput>[] = [];
    demos.push(...trainset.filter((ex) => ex.output !== undefined).slice(0, this.config.maxLabeledDemos));
    const unlabeled = trainset.filter((ex) => ex.output === undefined).slice(0, this.config.maxBootstrappedDemos);
    for (const ex of unlabeled) {
      try {
        const output = await program.run(ex.input);
        if (this.metric(ex.input, output) >= this.config.minScore) demos.push({ input: ex.input, output });
      } catch (err) {
        this.log(`Error generating demonstration: ${err}`);
      }
    }
    return demos;
  }

  async compile(
    program: Module<TInput, TOutput> | Pipeline,
    trainset: TrainingExample<TInput, TOutput>[]
  ): Promise<Module<TInput, TOutput>> {
    const mod = program as Module<TInput, TOutput>;
    if (typeof (mod as any).signature === 'undefined') {
      throw new Error('BootstrapFewShot.compile expects a Module (with a signature)');
    }
    this.log('Starting bootstrap few-shot optimization');
    const demos = await this.generateDemonstrations(mod, trainset);
    this.log(`Generated ${demos.length} demonstrations`);

    let dynamic: { store: AgentDBClient; k: number } | undefined;
    if (this.config.dynamicDemos) {
      const store = this.config.dynamicDemos.store;
      const k = this.config.dynamicDemos.k ?? (Math.min(2, demos.length) || 1);
      for (const d of demos) {
        try {
          await store.store(store.hashEmbed(JSON.stringify(d.input)), { type: 'bootstrap-demo', demo: d });
        } catch (err) {
          this.log(`indexing demo failed: ${err}`);
        }
      }
      dynamic = { store, k };
      this.log(`Indexed ${demos.length} demos for dynamic selection (k=${k})`);
    }

    this.optimizedProgram = new BootstrapOptimizedModule<TInput, TOutput>(mod.name, mod.signature, demos, dynamic);
    return this.optimizedProgram;
  }

  save(filePath: string, saveFieldMeta = false): void {
    if (!this.optimizedProgram) throw new Error('No optimized program to save. Run compile() first.');
    const safePath = safeResolvePath(filePath);
    fs.writeFileSync(
      safePath,
      JSON.stringify(
        {
          config: { ...this.config, dynamicDemos: undefined }, // store handles aren't serializable
          program: {
            name: this.optimizedProgram.name,
            signature: this.optimizedProgram.signature,
            demos: this.optimizedProgram.demos,
            fieldMeta: saveFieldMeta ? this.optimizedProgram.signature : undefined,
          },
        },
        null,
        2
      )
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
    // Reconstructs with the fixed demo set (dynamic selection needs a live store, which isn't serialized).
    this.optimizedProgram = new BootstrapOptimizedModule(data.program.name, data.program.signature, data.program.demos ?? []);
    if (data.config) this.config = data.config;
  }
}
