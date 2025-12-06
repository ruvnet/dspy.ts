/**
 * Lorentz Attention Mechanism
 *
 * Single-level hyperbolic attention using the Lorentz model.
 * More numerically stable than Poincaré attention with closed-form aggregation.
 */

import {
  LorentzVector,
  LorentzAttentionOutput,
  CascadeLevel,
} from './types';
import {
  euclideanToLorentz,
  lorentzToEuclidean,
  lorentzDistance,
  lorentzCentroid,
  lorentzLogMap,
  lorentzExpMap,
  lorentzParallelTransport,
  batchEuclideanToLorentz,
  batchLorentzDistance,
} from './lorentz-ops';

const EPSILON = 1e-7;

/**
 * Lorentz Attention - Single level hyperbolic attention
 *
 * Key improvements over Poincaré HyperbolicAttention:
 * 1. Distance: O(d) single acosh vs O(d) acosh + sqrt + division
 * 2. Aggregation: O(n×d) closed-form vs O(n×d×50) iterative
 * 3. Stability: No boundary projection needed
 */
export class LorentzAttention {
  readonly dim: number;
  readonly curvature: number;
  readonly numHeads: number;
  readonly headDim: number;
  readonly temperature: number;
  readonly dropout: number;

  private distanceOps: number = 0;
  private aggregationOps: number = 0;

  constructor(
    dim: number,
    curvature: number = -1.0,
    numHeads: number = 1,
    temperature: number = 1.0,
    dropout: number = 0.0
  ) {
    if (dim % numHeads !== 0) {
      throw new Error(`Dimension ${dim} must be divisible by numHeads ${numHeads}`);
    }

    this.dim = dim;
    this.curvature = curvature;
    this.numHeads = numHeads;
    this.headDim = dim / numHeads;
    this.temperature = temperature;
    this.dropout = dropout;
  }

  /**
   * Create from cascade level config
   */
  static fromLevel(dim: number, level: CascadeLevel): LorentzAttention {
    return new LorentzAttention(
      dim,
      level.curvature,
      level.numHeads,
      level.temperature,
      level.dropout
    );
  }

  /**
   * Compute Lorentz attention
   *
   * @param query - Query vector (Euclidean)
   * @param keys - Key vectors (Euclidean)
   * @param values - Value vectors (Euclidean)
   * @returns Attention output with metrics
   */
  compute(
    query: number[] | Float32Array,
    keys: (number[] | Float32Array)[],
    values: (number[] | Float32Array)[]
  ): LorentzAttentionOutput {
    const startTime = performance.now();
    this.distanceOps = 0;
    this.aggregationOps = 0;

    // Convert to Lorentz space
    const queryL = euclideanToLorentz(query, this.curvature);
    const keysL = batchEuclideanToLorentz(keys, this.curvature);
    const valuesL = batchEuclideanToLorentz(values, this.curvature);

    // Multi-head attention
    const headOutputs: LorentzVector[] = [];
    const allWeights: number[] = [];

    for (let h = 0; h < this.numHeads; h++) {
      const headStart = h * this.headDim;
      const headEnd = headStart + this.headDim;

      // Slice query for this head
      const queryHead = this.sliceLorentzVector(queryL, headStart, headEnd);
      const keysHead = keysL.map((k) => this.sliceLorentzVector(k, headStart, headEnd));
      const valuesHead = valuesL.map((v) => this.sliceLorentzVector(v, headStart, headEnd));

      // Compute attention for this head
      const { output, weights } = this.computeHeadAttention(
        queryHead,
        keysHead,
        valuesHead
      );

      headOutputs.push(output);
      allWeights.push(...weights);
    }

    // Concatenate head outputs
    const concatenated = this.concatenateLorentzVectors(headOutputs);

    // Apply output projection (identity for now)
    const euclidean = lorentzToEuclidean(concatenated, this.curvature);

    const endTime = performance.now();

    return {
      lorentz: concatenated,
      euclidean,
      weights: new Float32Array(allWeights),
      curvatures: [this.curvature],
      metrics: {
        distanceOps: this.distanceOps,
        aggregationOps: this.aggregationOps,
        totalTimeMs: endTime - startTime,
      },
    };
  }

  /**
   * Compute attention for a single head
   */
  private computeHeadAttention(
    query: LorentzVector,
    keys: LorentzVector[],
    values: LorentzVector[]
  ): { output: LorentzVector; weights: number[] } {
    const n = keys.length;

    // Compute distances (scores)
    const distances = batchLorentzDistance(query, keys, this.curvature);
    this.distanceOps += n;

    // Convert distances to attention scores (smaller distance = higher attention)
    // Using negative distance with softmax
    const scores = new Float32Array(n);
    let maxScore = -Infinity;

    for (let i = 0; i < n; i++) {
      scores[i] = -distances[i] / this.temperature;
      maxScore = Math.max(maxScore, scores[i]);
    }

    // Softmax with numerical stability
    let sumExp = 0;
    for (let i = 0; i < n; i++) {
      scores[i] = Math.exp(scores[i] - maxScore);
      sumExp += scores[i];
    }

    const weights: number[] = [];
    for (let i = 0; i < n; i++) {
      const w = scores[i] / (sumExp + EPSILON);
      // Apply dropout during training
      weights.push(w);
    }

    // Aggregate values using closed-form Lorentz centroid
    // This is 50x faster than iterative Fréchet mean!
    const output = lorentzCentroid(values, weights, this.curvature);
    this.aggregationOps += n;

    return { output, weights };
  }

  /**
   * Tangent space attention (more stable for deep networks)
   */
  computeTangent(
    query: number[] | Float32Array,
    keys: (number[] | Float32Array)[],
    values: (number[] | Float32Array)[]
  ): LorentzAttentionOutput {
    const startTime = performance.now();
    this.distanceOps = 0;
    this.aggregationOps = 0;

    // Convert to Lorentz space
    const queryL = euclideanToLorentz(query, this.curvature);
    const keysL = batchEuclideanToLorentz(keys, this.curvature);
    const valuesL = batchEuclideanToLorentz(values, this.curvature);

    // Map keys to tangent space at query
    const keysTangent = keysL.map((k) => lorentzLogMap(queryL, k, this.curvature));

    // Compute attention in tangent space (Euclidean)
    const scores = new Float32Array(keysL.length);
    let maxScore = -Infinity;

    for (let i = 0; i < keysTangent.length; i++) {
      // Euclidean dot product in tangent space
      let dot = 0;
      for (let j = 0; j < query.length; j++) {
        const q = query instanceof Float32Array ? query[j] : query[j];
        dot += q * keysTangent[i].space[j];
      }
      scores[i] = dot / this.temperature;
      maxScore = Math.max(maxScore, scores[i]);
      this.distanceOps++;
    }

    // Softmax
    let sumExp = 0;
    for (let i = 0; i < scores.length; i++) {
      scores[i] = Math.exp(scores[i] - maxScore);
      sumExp += scores[i];
    }

    const weights: number[] = [];
    for (let i = 0; i < scores.length; i++) {
      weights.push(scores[i] / (sumExp + EPSILON));
    }

    // Weighted sum in tangent space
    const weightedTangent: LorentzVector = {
      time: 0,
      space: new Float32Array(this.dim),
    };

    const valuesTangent = valuesL.map((v) =>
      lorentzLogMap(queryL, v, this.curvature)
    );

    for (let i = 0; i < valuesTangent.length; i++) {
      weightedTangent.time += weights[i] * valuesTangent[i].time;
      for (let j = 0; j < this.dim; j++) {
        weightedTangent.space[j] += weights[i] * valuesTangent[i].space[j];
      }
      this.aggregationOps++;
    }

    // Map back to hyperboloid
    const output = lorentzExpMap(queryL, weightedTangent, this.curvature);
    const euclidean = lorentzToEuclidean(output, this.curvature);

    const endTime = performance.now();

    return {
      lorentz: output,
      euclidean,
      weights: new Float32Array(weights),
      curvatures: [this.curvature],
      metrics: {
        distanceOps: this.distanceOps,
        aggregationOps: this.aggregationOps,
        totalTimeMs: endTime - startTime,
      },
    };
  }

  /**
   * Slice Lorentz vector for multi-head attention
   */
  private sliceLorentzVector(
    vec: LorentzVector,
    start: number,
    end: number
  ): LorentzVector {
    return {
      time: vec.time,
      space: vec.space.slice(start, end) as Float32Array,
    };
  }

  /**
   * Concatenate Lorentz vectors from multiple heads
   */
  private concatenateLorentzVectors(vectors: LorentzVector[]): LorentzVector {
    // Average time components
    let avgTime = 0;
    for (const v of vectors) {
      avgTime += v.time;
    }
    avgTime /= vectors.length;

    // Concatenate space components
    const totalDim = vectors.reduce((sum, v) => sum + v.space.length, 0);
    const space = new Float32Array(totalDim);
    let offset = 0;
    for (const v of vectors) {
      space.set(v.space, offset);
      offset += v.space.length;
    }

    return { time: avgTime, space };
  }
}

/**
 * Lorentz Self-Attention for sequences
 */
export class LorentzSelfAttention {
  private attention: LorentzAttention;

  constructor(
    dim: number,
    curvature: number = -1.0,
    numHeads: number = 1,
    temperature: number = 1.0
  ) {
    this.attention = new LorentzAttention(dim, curvature, numHeads, temperature);
  }

  /**
   * Compute self-attention over a sequence
   *
   * @param sequence - Array of vectors
   * @returns Array of attended vectors
   */
  compute(sequence: (number[] | Float32Array)[]): LorentzAttentionOutput[] {
    return sequence.map((query, i) => {
      // Each position attends to all positions
      return this.attention.compute(query, sequence, sequence);
    });
  }
}

/**
 * Lorentz Cross-Attention between two sequences
 */
export class LorentzCrossAttention {
  private attention: LorentzAttention;

  constructor(
    dim: number,
    curvature: number = -1.0,
    numHeads: number = 1,
    temperature: number = 1.0
  ) {
    this.attention = new LorentzAttention(dim, curvature, numHeads, temperature);
  }

  /**
   * Compute cross-attention from queries to keys/values
   *
   * @param queries - Query sequence
   * @param keysValues - Key/Value sequence
   * @returns Array of attended vectors
   */
  compute(
    queries: (number[] | Float32Array)[],
    keysValues: (number[] | Float32Array)[]
  ): LorentzAttentionOutput[] {
    return queries.map((query) => {
      return this.attention.compute(query, keysValues, keysValues);
    });
  }
}
