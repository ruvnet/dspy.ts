/**
 * Bootstrap Few-Shot optimizer implementation
 */

import { Module } from '../core/module';
import { Pipeline } from '../core/pipeline';
import { Optimizer, OptimizerConfig, TrainingExample, MetricFunction } from './base';
import { getLM } from '../index';
import { Signature } from '../core/signature';

/**
 * Configuration for BootstrapFewShot optimizer
 */
export interface BootstrapConfig extends OptimizerConfig {
  maxLabeledDemos?: number;
  maxBootstrappedDemos?: number;
  minScore?: number;
}

/**
 * Optimized module with few-shot demonstrations
 */
class OptimizedModule<TInput = any, TOutput = any> extends Module<TInput, TOutput> {
  constructor(
    name: string,
    signature: Signature,
    promptTemplate: (input: TInput) => string
  ) {
    super({
      name,
      signature,
      promptTemplate,
      strategy: 'Predict'
    });
  }

  async run(input: TInput): Promise<TOutput> {
    this.validateInput(input);
    const lm = getLM();

    const prompt = this.promptTemplate(input);
    const response = await lm.generate(prompt);
    const output = JSON.parse(response) as TOutput;

    this.validateOutput(output);
    return output;
  }
}

/**
 * BootstrapFewShot optimizer that generates demonstrations using a teacher model
 */
export class BootstrapFewShot<TInput = any, TOutput = any> extends Optimizer<TInput, TOutput> {
  protected config: Required<BootstrapConfig>;
  private optimizedProgram: OptimizedModule<TInput, TOutput> | null = null;

  constructor(metric: MetricFunction<TInput, TOutput>, config: BootstrapConfig = {}) {
    super(metric, config);
    this.config = {
      maxIterations: 10,
      numThreads: 1,
      debug: false,
      maxLabeledDemos: 4,
      maxBootstrappedDemos: 4,
      minScore: 0.7,
      ...config
    };
  }

  /**
   * Generate demonstrations using the teacher model
   */
  private async generateDemonstrations<T1, T2>(
    program: Module<T1, T2>,
    trainset: TrainingExample<T1, T2>[]
  ): Promise<TrainingExample<T1, T2>[]> {
    const demos: TrainingExample<T1, T2>[] = [];

    // First, add labeled examples from trainset
    const labeledDemos = trainset
      .filter(ex => ex.output !== undefined)
      .slice(0, this.config.maxLabeledDemos);
    demos.push(...labeledDemos);

    // Then, generate bootstrapped examples
    const unlabeledExamples = trainset
      .filter(ex => ex.output === undefined)
      .slice(0, this.config.maxBootstrappedDemos);

    for (const example of unlabeledExamples) {
      try {
        // Run the program to generate output
        const output = await program.run(example.input);

        // Evaluate the output
        const score = this.metric ? this.metric(example.input as any, output as any) : 1;
        if (score >= this.config.minScore) {
          demos.push({
            input: example.input,
            output
          });
        }
      } catch (err) {
        this.log(`Error generating demonstration: ${err}`);
        continue;
      }
    }

    return demos;
  }

  /**
   * Compile a program with bootstrap few-shot optimization
   */
  async compile<T1 = TInput, T2 = TOutput>(
    program: Module<T1, T2>,
    trainset: TrainingExample<T1, T2>[] | Array<T1 & Partial<T2>>,
    valset?: TrainingExample<T1, T2>[] | Array<T1 & Partial<T2>>
  ): Promise<Module<T1, T2>> {
    this.log('Starting bootstrap few-shot optimization');

    // Normalize trainset to TrainingExample format
    const normalizedTrainset: TrainingExample<T1, T2>[] = (trainset as any[]).map((item: any) => {
      if ('input' in item) {
        return item as TrainingExample<T1, T2>;
      } else {
        return { input: item, output: undefined } as TrainingExample<T1, T2>;
      }
    });

    // Generate demonstrations
    const demos = await this.generateDemonstrations(program, normalizedTrainset as any);
    this.log(`Generated ${demos.length} demonstrations`);

    // Create optimized module by updating prompt template
    const optimizedModule = new OptimizedModule<T1, T2>(
      program.name,
      program.signature,
      (input: T1) => {
        const demoText = demos.map(demo => `Example:
Input: ${JSON.stringify(demo.input)}
Expected Output: ${JSON.stringify(demo.output)}`).join('\n\n');

        return `${demoText}\n\nAnalyze the following input and respond in JSON format:\nInput: ${JSON.stringify(input)}\n\nResponse:`;
      }
    );

    this.optimizedProgram = optimizedModule as any;
    return optimizedModule;
  }

  /**
   * Save the optimized program to a file
   */
  save(path: string, saveFieldMeta = false): void {
    if (!this.optimizedProgram) {
      throw new Error('No optimized program to save. Run compile() first.');
    }

    const data = {
      config: this.config,
      program: {
        name: this.optimizedProgram.name,
        signature: this.optimizedProgram.signature,
        promptTemplate: this.optimizedProgram.promptTemplate?.toString(),
        fieldMeta: saveFieldMeta ? this.optimizedProgram.signature : undefined
      }
    };

    // Write to file
    const fs = require('fs');
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
  }

  /**
   * Load an optimized program from a file
   */
  load(path: string): void {
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));

    // Recreate the program
    this.optimizedProgram = new OptimizedModule(
      data.program.name,
      data.program.signature,
      eval(`(${data.program.promptTemplate})`)
    );
    this.config = data.config;
  }
}
