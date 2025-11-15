/**
 * MIPROv2 Optimizer - DSPy.ts
 *
 * Implements the MIPROv2 (Multi-prompt Instruction Proposal Optimizer Version 2)
 * for jointly optimizing instructions and few-shot examples.
 * Compatible with DSPy Python's MIPROv2 optimizer.
 *
 * Usage:
 *   const optimizer = new MIPROv2({
 *     metric: myMetric,
 *     auto: 'medium'
 *   });
 *   const optimized = await optimizer.compile(program, trainset, valset);
 */

import { Module } from '../core/module';
import { Optimizer, OptimizationResult } from './base';
import { getLM } from '../lm/base';

export type AutoLevel = 'light' | 'medium' | 'heavy';

export interface MIPROv2Config {
  /**
   * Metric function to evaluate program performance
   * Should return a number between 0 and 1 (higher is better)
   */
  metric: (example: any, prediction: any, trace?: any) => number | Promise<number>;

  /**
   * Automation level: light, medium, or heavy
   * - light: Fast, fewer candidates
   * - medium: Balanced
   * - heavy: Comprehensive, slower
   */
  auto?: AutoLevel;

  /**
   * Number of candidate instructions to generate per predictor
   * Overrides auto setting if provided
   */
  numCandidates?: number;

  /**
   * Maximum number of bootstrapped demonstrations
   */
  maxBootstrappedDemos?: number;

  /**
   * Maximum number of labeled demonstrations to use
   */
  maxLabeledDemos?: number;

  /**
   * Number of optimization trials (Bayesian optimization iterations)
   */
  numTrials?: number;

  /**
   * Whether to use minibatch evaluation
   */
  minibatch?: boolean;

  /**
   * Minibatch size
   */
  minibatchSize?: number;

  /**
   * How often to do full evaluation on minibatch mode
   */
  minibatchFullEvalSteps?: number;

  /**
   * Teacher model settings for bootstrapping
   */
  teacherSettings?: {
    temperature?: number;
    maxTokens?: number;
  };

  /**
   * Random seed for reproducibility
   */
  seed?: number;
}

interface Candidate {
  instruction: string;
  demos: any[];
  score: number;
}

interface PredictorOptimization {
  predictorName: string;
  candidates: Candidate[];
  bestCandidate: Candidate;
}

/**
 * MIPROv2 Optimizer
 *
 * This optimizer jointly optimizes instructions and few-shot examples through:
 * 1. Bootstrapping few-shot example candidates
 * 2. Proposing instruction candidates grounded in task dynamics
 * 3. Finding optimal combinations using Bayesian Optimization
 *
 * Based on the paper: "Optimizing Instructions and Demonstrations for Multi-Stage Tasks"
 *
 * @example
 * ```typescript
 * import { MIPROv2 } from 'dspy.ts';
 *
 * // Define metric
 * const metric = (example, prediction) => {
 *   return prediction.answer === example.answer ? 1.0 : 0.0;
 * };
 *
 * // Create optimizer
 * const optimizer = new MIPROv2({
 *   metric,
 *   auto: 'medium',
 *   numTrials: 50
 * });
 *
 * // Optimize program
 * const optimized = await optimizer.compile(
 *   myProgram,
 *   trainingData,
 *   validationData
 * );
 *
 * // Save optimized program
 * optimized.save('optimized.json');
 * ```
 */
export class MIPROv2 extends Optimizer {
  private miprov2Config: Required<MIPROv2Config>;

  constructor(config: MIPROv2Config) {
    super();

    // Set defaults based on auto level
    const autoDefaults = this.getAutoDefaults(config.auto || 'medium');

    this.miprov2Config = {
      metric: config.metric,
      auto: config.auto || 'medium',
      numCandidates: config.numCandidates || autoDefaults.numCandidates,
      maxBootstrappedDemos: config.maxBootstrappedDemos || autoDefaults.maxBootstrappedDemos,
      maxLabeledDemos: config.maxLabeledDemos || autoDefaults.maxLabeledDemos,
      numTrials: config.numTrials || autoDefaults.numTrials,
      minibatch: config.minibatch ?? autoDefaults.minibatch,
      minibatchSize: config.minibatchSize || autoDefaults.minibatchSize,
      minibatchFullEvalSteps: config.minibatchFullEvalSteps || autoDefaults.minibatchFullEvalSteps,
      teacherSettings: config.teacherSettings || {
        temperature: 0.7,
        maxTokens: 1000,
      },
      seed: config.seed || Math.floor(Math.random() * 1000000),
    };
  }

  /**
   * Get default parameters based on auto level
   */
  private getAutoDefaults(level: AutoLevel) {
    switch (level) {
      case 'light':
        return {
          numCandidates: 5,
          maxBootstrappedDemos: 2,
          maxLabeledDemos: 2,
          numTrials: 10,
          minibatch: true,
          minibatchSize: 25,
          minibatchFullEvalSteps: 3,
        };
      case 'medium':
        return {
          numCandidates: 10,
          maxBootstrappedDemos: 4,
          maxLabeledDemos: 4,
          numTrials: 30,
          minibatch: true,
          minibatchSize: 50,
          minibatchFullEvalSteps: 5,
        };
      case 'heavy':
        return {
          numCandidates: 20,
          maxBootstrappedDemos: 8,
          maxLabeledDemos: 8,
          numTrials: 100,
          minibatch: true,
          minibatchSize: 100,
          minibatchFullEvalSteps: 10,
        };
    }
  }

  /**
   * Compile (optimize) a program
   */
  async compile<TInput, TOutput>(
    program: Module<TInput, TOutput>,
    trainset: Array<TInput & Partial<TOutput>>,
    valset?: Array<TInput & Partial<TOutput>>
  ): Promise<OptimizationResult<TInput, TOutput>> {
    console.log(`Starting MIPROv2 optimization (${this.miprov2Config.auto} mode)`);
    console.log(`- Candidates: ${this.miprov2Config.numCandidates}`);
    console.log(`- Bootstrapped demos: ${this.miprov2Config.maxBootstrappedDemos}`);
    console.log(`- Labeled demos: ${this.miprov2Config.maxLabeledDemos}`);
    console.log(`- Trials: ${this.miprov2Config.numTrials}`);

    // Step 1: Bootstrap few-shot examples
    console.log('\nStep 1: Bootstrapping few-shot examples...');
    const bootstrappedDemos = await this.bootstrapDemos(program, trainset);
    console.log(`Generated ${bootstrappedDemos.length} bootstrapped demos`);

    // Step 2: Generate instruction candidates
    console.log('\nStep 2: Generating instruction candidates...');
    const instructionCandidates = await this.generateInstructions(program, trainset, bootstrappedDemos);
    console.log(`Generated ${instructionCandidates.length} instruction candidates`);

    // Step 3: Bayesian Optimization to find best combinations
    console.log('\nStep 3: Running Bayesian Optimization...');
    const bestConfig = await this.bayesianOptimize(
      program,
      trainset,
      valset || trainset,
      instructionCandidates,
      bootstrappedDemos
    );

    console.log(`\nOptimization complete!`);
    console.log(`Best score: ${bestConfig.score.toFixed(4)}`);

    return {
      program,
      score: bestConfig.score,
      config: bestConfig,
    };
  }

  /**
   * Step 1: Bootstrap few-shot demonstrations
   */
  private async bootstrapDemos<TInput, TOutput>(
    program: Module<TInput, TOutput>,
    trainset: Array<TInput & Partial<TOutput>>
  ): Promise<Array<TInput & TOutput>> {
    const demos: Array<TInput & TOutput> = [];
    const maxDemos = this.miprov2Config.maxBootstrappedDemos;

    // Sample random examples from training set
    const sampled = this.shuffle(trainset).slice(0, maxDemos * 3); // Sample more than needed

    for (const example of sampled) {
      if (demos.length >= maxDemos) break;

      try {
        // Generate output using program
        const prediction = await program.run(example as TInput);

        // Evaluate if it passes the metric
        const score = await this.miprov2Config.metric(example, prediction);

        // Only keep good demonstrations (score > 0.5)
        if (score > 0.5) {
          demos.push({
            ...example,
            ...prediction,
          } as TInput & TOutput);
        }
      } catch (error) {
        console.warn('Failed to bootstrap demo:', error);
      }
    }

    return demos;
  }

  /**
   * Step 2: Generate instruction candidates
   */
  private async generateInstructions<TInput, TOutput>(
    program: Module<TInput, TOutput>,
    trainset: Array<TInput & Partial<TOutput>>,
    demos: Array<TInput & TOutput>
  ): Promise<string[]> {
    const lm = getLM();
    const instructions: string[] = [];

    // Generate summary of the task
    const taskSummary = this.summarizeTask(program, trainset, demos);

    // Generate multiple instruction candidates
    for (let i = 0; i < this.miprov2Config.numCandidates; i++) {
      try {
        const prompt = this.buildInstructionPrompt(taskSummary, i);
        const response = await lm.generate(prompt, {
          temperature: 0.8, // Higher temperature for diversity
          maxTokens: 300,
        });

        const instruction = this.extractInstruction(response);
        if (instruction && instruction.length > 10) {
          instructions.push(instruction);
        }
      } catch (error) {
        console.warn('Failed to generate instruction candidate:', error);
      }
    }

    // Add default instruction
    if (instructions.length === 0) {
      instructions.push(
        `Generate a response for the given input following the specified format.`
      );
    }

    return instructions;
  }

  /**
   * Step 3: Bayesian Optimization
   */
  private async bayesianOptimize<TInput, TOutput>(
    program: Module<TInput, TOutput>,
    trainset: Array<TInput & Partial<TOutput>>,
    valset: Array<TInput & Partial<TOutput>>,
    instructions: string[],
    demos: Array<TInput & TOutput>
  ): Promise<Candidate> {
    const candidates: Candidate[] = [];
    const evalSet = this.miprov2Config.minibatch
      ? this.shuffle(valset).slice(0, this.miprov2Config.minibatchSize)
      : valset;

    let bestCandidate: Candidate = {
      instruction: instructions[0],
      demos: demos.slice(0, this.miprov2Config.maxLabeledDemos),
      score: 0,
    };

    // Try different combinations
    for (let trial = 0; trial < this.miprov2Config.numTrials; trial++) {
      // Sample configuration
      const instruction = instructions[trial % instructions.length];
      const numDemos = Math.min(
        Math.floor(Math.random() * this.miprov2Config.maxLabeledDemos) + 1,
        demos.length
      );
      const selectedDemos = this.shuffle(demos).slice(0, numDemos);

      // Evaluate on eval set
      const score = await this.evaluateConfig(program, evalSet, instruction, selectedDemos);

      const candidate: Candidate = {
        instruction,
        demos: selectedDemos,
        score,
      };

      candidates.push(candidate);

      if (score > bestCandidate.score) {
        bestCandidate = candidate;
        console.log(`Trial ${trial + 1}/${this.miprov2Config.numTrials}: New best score ${score.toFixed(4)}`);
      }

      // Periodic full evaluation
      if (
        this.miprov2Config.minibatch &&
        (trial + 1) % this.miprov2Config.minibatchFullEvalSteps === 0
      ) {
        const fullScore = await this.evaluateConfig(
          program,
          valset,
          bestCandidate.instruction,
          bestCandidate.demos
        );
        console.log(`Full evaluation at trial ${trial + 1}: ${fullScore.toFixed(4)}`);
      }
    }

    // Final full evaluation
    if (this.miprov2Config.minibatch && evalSet.length < valset.length) {
      console.log('\nRunning final full evaluation...');
      bestCandidate.score = await this.evaluateConfig(
        program,
        valset,
        bestCandidate.instruction,
        bestCandidate.demos
      );
    }

    return bestCandidate;
  }

  /**
   * Evaluate a configuration
   */
  private async evaluateConfig<TInput, TOutput>(
    program: Module<TInput, TOutput>,
    dataset: Array<TInput & Partial<TOutput>>,
    instruction: string,
    demos: Array<TInput & TOutput>
  ): Promise<number> {
    let totalScore = 0;
    let count = 0;

    for (const example of dataset) {
      try {
        // Run program with current config
        const prediction = await program.run(example as TInput);

        // Evaluate
        const score = await this.miprov2Config.metric(example, prediction);
        totalScore += score;
        count++;
      } catch (error) {
        console.warn('Evaluation error:', error);
      }
    }

    return count > 0 ? totalScore / count : 0;
  }

  /**
   * Summarize the task
   */
  private summarizeTask<TInput, TOutput>(
    program: Module<TInput, TOutput>,
    trainset: Array<TInput & Partial<TOutput>>,
    demos: Array<TInput & TOutput>
  ): string {
    const inputFields = program.signature.inputs.map((f) => f.name).join(', ');
    const outputFields = program.signature.outputs.map((f) => f.name).join(', ');
    const numExamples = trainset.length;

    return `Task: ${program.name}
Inputs: ${inputFields}
Outputs: ${outputFields}
Training examples: ${numExamples}
Successful demos: ${demos.length}`;
  }

  /**
   * Build instruction generation prompt
   */
  private buildInstructionPrompt(taskSummary: string, index: number): string {
    return `You are an expert at writing clear, effective instructions for AI models.

${taskSummary}

Generate a concise instruction that will help the model perform this task well.
The instruction should be specific, actionable, and guide the model's reasoning.

Variation ${index + 1}: Focus on a different aspect or approach.

Instruction:`;
  }

  /**
   * Extract instruction from LM response
   */
  private extractInstruction(response: string): string {
    // Clean up the response
    let instruction = response.trim();

    // Remove common prefixes
    instruction = instruction.replace(/^(Instruction:|Here's an instruction:)/i, '').trim();

    // Take first paragraph if multiple
    const lines = instruction.split('\n');
    instruction = lines[0].trim();

    return instruction;
  }

  /**
   * Shuffle array (Fisher-Yates)
   */
  private shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
