/**
 * Majority Voting - DSPy.ts
 *
 * Implements the majority voting function for aggregating multiple predictions.
 * Compatible with DSPy Python's dspy.majority function.
 *
 * Usage:
 *   const result = await majority(module, input, { n: 5 });
 */

import { Module } from '../core/module';

export interface MajorityOptions {
  /**
   * Number of predictions to generate (default: 5)
   */
  n?: number;

  /**
   * Temperature for generation diversity (default: 0.7)
   */
  temperature?: number;

  /**
   * Custom equality function for comparing outputs
   */
  equalityFn?: (a: any, b: any) => boolean;

  /**
   * Custom hash function for grouping similar outputs
   */
  hashFn?: (output: any) => string;
}

export interface MajorityResult<TOutput> {
  /**
   * The most popular output
   */
  output: TOutput;

  /**
   * All predictions with their counts
   */
  predictions: Array<{
    output: TOutput;
    count: number;
    percentage: number;
  }>;

  /**
   * Total number of predictions
   */
  total: number;

  /**
   * Confidence score (percentage of votes for winner)
   */
  confidence: number;
}

/**
 * Majority Voting Function
 *
 * Generates multiple predictions and returns the most common one.
 * This technique improves reliability by reducing the impact of outliers
 * and random variations in LM outputs.
 *
 * Process:
 * 1. Generate N predictions
 * 2. Group similar predictions
 * 3. Return the most common prediction
 * 4. Include confidence score and distribution
 *
 * @example
 * ```typescript
 * import { majority } from 'dspy.ts';
 * import { Predict } from 'dspy.ts';
 *
 * const classifier = new Predict({
 *   name: 'SentimentClassifier',
 *   signature: {
 *     inputs: [{ name: 'text', type: 'string', required: true }],
 *     outputs: [{ name: 'sentiment', type: 'string', required: true }]
 *   }
 * });
 *
 * const result = await majority(classifier, {
 *   text: "I love this product!"
 * }, { n: 7 });
 *
 * console.log(result.output.sentiment); // "positive"
 * console.log(result.confidence); // 0.85 (6 out of 7 agreed)
 * console.log(result.predictions); // Distribution of all predictions
 * ```
 */
export async function majority<TInput, TOutput>(
  module: Module<TInput, TOutput>,
  input: TInput,
  options: MajorityOptions = {}
): Promise<MajorityResult<TOutput>> {
  const n = options.n || 5;
  const equalityFn = options.equalityFn || defaultEquality;
  const hashFn = options.hashFn || defaultHash;

  // Generate N predictions
  const predictions: TOutput[] = [];
  const promises: Promise<TOutput>[] = [];

  for (let i = 0; i < n; i++) {
    promises.push(module.run(input));
  }

  // Wait for all predictions (with error handling)
  const results = await Promise.allSettled(promises);

  for (const result of results) {
    if (result.status === 'fulfilled') {
      predictions.push(result.value);
    } else {
      console.warn('Failed to generate prediction:', result.reason);
    }
  }

  if (predictions.length === 0) {
    throw new Error('Failed to generate any predictions for majority voting');
  }

  // Group predictions by similarity
  const groups = groupPredictions(predictions, equalityFn, hashFn);

  // Find the most common prediction
  const sorted = Array.from(groups.entries())
    .map(([key, outputs]) => ({
      output: outputs[0],
      count: outputs.length,
      percentage: outputs.length / predictions.length,
    }))
    .sort((a, b) => b.count - a.count);

  const winner = sorted[0];

  return {
    output: winner.output,
    predictions: sorted,
    total: predictions.length,
    confidence: winner.percentage,
  };
}

/**
 * Group predictions by similarity
 */
function groupPredictions<TOutput>(
  predictions: TOutput[],
  equalityFn: (a: any, b: any) => boolean,
  hashFn: (output: any) => string
): Map<string, TOutput[]> {
  const groups = new Map<string, TOutput[]>();

  for (const prediction of predictions) {
    const hash = hashFn(prediction);

    if (groups.has(hash)) {
      // Check if truly equal to existing group
      const existing = groups.get(hash)!;
      let found = false;

      for (const item of existing) {
        if (equalityFn(prediction, item)) {
          existing.push(prediction);
          found = true;
          break;
        }
      }

      if (!found) {
        // Hash collision, create new group
        const newHash = `${hash}_${existing.length}`;
        groups.set(newHash, [prediction]);
      }
    } else {
      groups.set(hash, [prediction]);
    }
  }

  return groups;
}

/**
 * Default equality function (deep comparison)
 */
function defaultEquality(a: any, b: any): boolean {
  // Simple equality check
  if (a === b) return true;

  // Handle null/undefined
  if (a == null || b == null) return a === b;

  // Handle primitives
  if (typeof a !== 'object' || typeof b !== 'object') {
    return a === b;
  }

  // Handle objects
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;

    // Recursive comparison
    if (!defaultEquality(a[key], b[key])) {
      return false;
    }
  }

  return true;
}

/**
 * Default hash function (JSON serialization)
 */
function defaultHash(output: any): string {
  try {
    // Sort keys for consistent hashing
    return JSON.stringify(output, Object.keys(output).sort());
  } catch (error) {
    // Fallback to toString
    return String(output);
  }
}

/**
 * Weighted majority voting (for when predictions have confidence scores)
 */
export async function weightedMajority<TInput, TOutput extends { confidence?: number }>(
  module: Module<TInput, TOutput>,
  input: TInput,
  options: MajorityOptions = {}
): Promise<MajorityResult<TOutput>> {
  const result = await majority(module, input, options);

  // Reweight based on confidence scores
  const weighted = result.predictions.map((pred) => {
    const avgConfidence =
      pred.output.confidence !== undefined
        ? pred.output.confidence
        : 1.0;

    return {
      ...pred,
      weightedCount: pred.count * avgConfidence,
    };
  }).sort((a, b) => b.weightedCount - a.weightedCount);

  const totalWeight = weighted.reduce((sum, p) => sum + p.weightedCount, 0);
  const winner = weighted[0];

  return {
    ...result,
    output: winner.output,
    confidence: winner.weightedCount / totalWeight,
  };
}

/**
 * Consensus threshold voting (require minimum agreement)
 */
export async function consensusMajority<TInput, TOutput>(
  module: Module<TInput, TOutput>,
  input: TInput,
  threshold: number = 0.6,
  options: MajorityOptions = {}
): Promise<MajorityResult<TOutput> | null> {
  const result = await majority(module, input, options);

  if (result.confidence >= threshold) {
    return result;
  }

  // No consensus reached
  return null;
}
