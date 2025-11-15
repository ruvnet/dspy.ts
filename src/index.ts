/**
 * DSPy.ts - TypeScript implementation of Stanford's DSPy framework
 *
 * A declarative framework for building modular AI software that automatically
 * compiles programs into effective prompts and weights for language models.
 *
 * @version 2.1.0
 * @author rUv
 * @license MIT
 */

// Core exports
export * from './core';

// LM exports
export * from './lm/base';
export * from './lm/dummy';
export * from './lm/providers';

// Module exports
export * from './modules';

// Optimizer exports
export * from './optimize/base';
export * from './optimize/bootstrap';
export * from './optimize/mipro-v2';

// Memory exports
export * from './memory';

// Agent exports
export * from './agent';

// Metrics exports
export { type MetricFunction as EvaluationMetric } from './metrics';
export {
  exactMatch,
  f1Score,
  answerSimilarity,
  contains,
  semanticSimilarity,
  passAtK,
  meanReciprocalRank,
  bleuScore,
  rougeL,
  accuracy,
  createMetric,
  combinedMetric,
  evaluate,
} from './metrics';

// Legacy global LM configuration (for backwards compatibility)
import { configureLM as coreConfigure, getLM as coreGetLM } from './lm/base';
export { coreConfigure as configureLM, coreGetLM as getLM };
