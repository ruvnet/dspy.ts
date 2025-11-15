/**
 * Base classes and types for DSPy.ts optimizers
 */

import { Module } from '../core/module';
import { Pipeline } from '../core/pipeline';

/**
 * Metric function type for evaluating program outputs
 */
export type MetricFunction<TInput = any, TOutput = any> = (
  input: TInput,
  output: TOutput,
  expected?: TOutput
) => number;

/**
 * Base optimizer configuration
 */
export interface OptimizerConfig {
  maxIterations?: number;
  numThreads?: number;
  debug?: boolean;
}

/**
 * Training example type
 */
export interface TrainingExample<TInput = any, TOutput = any> {
  input: TInput;
  output?: TOutput;
}

/**
 * Optimization result
 */
export interface OptimizationResult<TInput = any, TOutput = any> {
  program: Module<TInput, TOutput>;
  score: number;
  config?: any;
  metadata?: Record<string, any>;
}

/**
 * Base class for all DSPy.ts optimizers
 */
export abstract class Optimizer<TInput = any, TOutput = any> {
  protected config?: Required<OptimizerConfig>;
  protected metric?: MetricFunction<TInput, TOutput>;

  constructor(metric?: MetricFunction<TInput, TOutput>, config: OptimizerConfig = {}) {
    this.metric = metric;
    this.config = {
      maxIterations: 10,
      numThreads: 1,
      debug: false,
      ...config
    };
  }

  /**
   * Compile a program or module with optimization
   */
  abstract compile<T1 = TInput, T2 = TOutput>(
    program: Module<T1, T2>,
    trainset: TrainingExample<T1, T2>[] | Array<T1 & Partial<T2>>,
    valset?: TrainingExample<T1, T2>[] | Array<T1 & Partial<T2>>
  ): Promise<Module<T1, T2> | OptimizationResult<T1, T2>>;

  /**
   * Save the optimized program to a file (optional)
   */
  save?(path: string, saveFieldMeta?: boolean): void;

  /**
   * Load an optimized program from a file (optional)
   */
  load?(path: string): void;

  protected log(message: string) {
    if (this.config && this.config.debug) {
      console.log(`[Optimizer] ${message}`);
    }
  }
}
