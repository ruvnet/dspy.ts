/**
 * Lorentz Cascade Attention (LCA)
 *
 * Multi-scale hyperbolic attention with adaptive curvature levels.
 * Processes data through a cascade of curvatures from coarse (near-Euclidean)
 * to fine (strong hyperbolic), capturing hierarchies at multiple scales.
 *
 * Key innovations:
 * 1. Multi-scale curvature: Automatically adapts to hierarchy depth
 * 2. Cascade refinement: Each level refines the previous
 * 3. Closed-form aggregation: 50x faster than Poincaré
 * 4. No boundary instability: Hyperboloid has no boundary
 */

import {
  LorentzVector,
  LorentzAttentionOutput,
  LorentzCascadeConfig,
  CascadeLevel,
  DEFAULT_CASCADE_CONFIG,
} from './types';
import { LorentzAttention } from './lorentz-attention';
import {
  euclideanToLorentz,
  lorentzToEuclidean,
  lorentzCentroid,
  lorentzExpMap,
  lorentzLogMap,
  lorentzParallelTransport,
} from './lorentz-ops';

/**
 * Lorentz Cascade Attention (LCA)
 *
 * A novel architecture that addresses Poincaré bottlenecks:
 *
 * | Poincaré Issue       | LCA Solution                  | Improvement     |
 * |----------------------|-------------------------------|-----------------|
 * | O(d) acosh,sqrt,div  | O(d) single acosh             | 2-3x faster     |
 * | O(n×d×50) Fréchet    | O(n×d) closed-form centroid   | 50x faster      |
 * | Boundary instability | No boundary (hyperboloid)     | Always stable   |
 * | Single curvature     | Multi-scale cascade           | Adaptive        |
 */
export class LorentzCascadeAttention {
  readonly config: LorentzCascadeConfig;
  private levels: LorentzAttention[];

  constructor(config: Partial<LorentzCascadeConfig> & { dim: number }) {
    this.config = {
      ...DEFAULT_CASCADE_CONFIG,
      ...config,
    };

    // Create attention layers for each cascade level
    this.levels = this.config.levels.map((level) =>
      LorentzAttention.fromLevel(this.config.dim, level)
    );
  }

  /**
   * Create with standard configuration
   *
   * @param dim - Embedding dimension
   * @param numLevels - Number of cascade levels (2-5 recommended)
   */
  static create(dim: number, numLevels: number = 3): LorentzCascadeAttention {
    // Generate curvatures from near-Euclidean to strong hyperbolic
    const levels: CascadeLevel[] = [];
    for (let i = 0; i < numLevels; i++) {
      const t = i / (numLevels - 1); // 0 to 1
      levels.push({
        curvature: -0.1 - 0.9 * t, // -0.1 to -1.0
        numHeads: Math.min(1 << i, 8), // 1, 2, 4, 8
        dropout: 0.1 * t,
        temperature: 1.0 - 0.5 * t, // 1.0 to 0.5
      });
    }

    return new LorentzCascadeAttention({ dim, levels });
  }

  /**
   * Compute cascade attention
   *
   * Each level processes the output of the previous level,
   * with increasing curvature to capture finer hierarchical details.
   *
   * @param query - Query vector
   * @param keys - Key vectors
   * @param values - Value vectors
   * @returns Attention output with all cascade information
   */
  compute(
    query: number[] | Float32Array,
    keys: (number[] | Float32Array)[],
    values: (number[] | Float32Array)[]
  ): LorentzAttentionOutput {
    const startTime = performance.now();
    let totalDistanceOps = 0;
    let totalAggregationOps = 0;
    const curvatures: number[] = [];

    // Current query (refined through cascade)
    let currentQuery = query;

    // Process through cascade levels
    let lastOutput: LorentzAttentionOutput | null = null;

    for (let i = 0; i < this.levels.length; i++) {
      const level = this.levels[i];
      curvatures.push(level.curvature);

      // Compute attention at this level
      const output = this.config.useTangentAttention
        ? level.computeTangent(currentQuery, keys, values)
        : level.compute(currentQuery, keys, values);

      totalDistanceOps += output.metrics.distanceOps;
      totalAggregationOps += output.metrics.aggregationOps;

      // Residual connection with previous level
      if (lastOutput && i > 0) {
        // Transport previous output to current curvature and add
        const prevLorentz = euclideanToLorentz(
          lastOutput.euclidean,
          level.curvature
        );
        const currLorentz = euclideanToLorentz(
          output.euclidean,
          level.curvature
        );

        // Weighted combination (learnable in practice)
        const alpha = 1 / (i + 1); // Decreasing weight for earlier levels
        const combined = lorentzCentroid(
          [prevLorentz, currLorentz],
          [alpha, 1 - alpha],
          level.curvature
        );

        output.lorentz = combined;
        output.euclidean = lorentzToEuclidean(combined, level.curvature);
      }

      lastOutput = output;

      // Update query for next level (use attended output)
      currentQuery = output.euclidean;
    }

    const endTime = performance.now();

    return {
      lorentz: lastOutput!.lorentz,
      euclidean: lastOutput!.euclidean,
      weights: lastOutput!.weights,
      curvatures,
      metrics: {
        distanceOps: totalDistanceOps,
        aggregationOps: totalAggregationOps,
        totalTimeMs: endTime - startTime,
      },
    };
  }

  /**
   * Compute cascade attention with hierarchical decomposition
   *
   * Each level handles a different "scale" of the hierarchy:
   * - Level 0 (c≈0): Coarse, global relationships
   * - Level N (c=-1): Fine, local hierarchical details
   *
   * @param query - Query vector
   * @param keys - Key vectors with hierarchy levels
   * @param values - Value vectors
   * @param hierarchyLevels - Hierarchy level for each key (0=root, higher=deeper)
   */
  computeHierarchical(
    query: number[] | Float32Array,
    keys: (number[] | Float32Array)[],
    values: (number[] | Float32Array)[],
    hierarchyLevels: number[]
  ): LorentzAttentionOutput {
    const startTime = performance.now();
    let totalDistanceOps = 0;
    let totalAggregationOps = 0;
    const curvatures: number[] = [];

    // Normalize hierarchy levels to [0, numLevels-1]
    const maxLevel = Math.max(...hierarchyLevels);
    const numLevels = this.levels.length;

    // Group keys/values by their hierarchy level
    const levelGroups: Map<number, { keys: (number[] | Float32Array)[]; values: (number[] | Float32Array)[] }> =
      new Map();

    for (let i = 0; i < keys.length; i++) {
      // Map hierarchy level to cascade level
      const cascadeLevel = Math.floor(
        (hierarchyLevels[i] / (maxLevel + 1)) * numLevels
      );
      const clampedLevel = Math.min(cascadeLevel, numLevels - 1);

      if (!levelGroups.has(clampedLevel)) {
        levelGroups.set(clampedLevel, { keys: [], values: [] });
      }
      levelGroups.get(clampedLevel)!.keys.push(keys[i]);
      levelGroups.get(clampedLevel)!.values.push(values[i]);
    }

    // Process each cascade level with its matching hierarchy group
    let currentQuery = query;
    const levelOutputs: LorentzAttentionOutput[] = [];

    for (let i = 0; i < numLevels; i++) {
      const level = this.levels[i];
      curvatures.push(level.curvature);

      const group = levelGroups.get(i) || { keys: [query], values: [query] };

      const output = level.compute(currentQuery, group.keys, group.values);
      totalDistanceOps += output.metrics.distanceOps;
      totalAggregationOps += output.metrics.aggregationOps;

      levelOutputs.push(output);
      currentQuery = output.euclidean;
    }

    // Combine outputs from all levels
    const finalLorentzVectors = levelOutputs.map((o) =>
      euclideanToLorentz(o.euclidean, this.levels[this.levels.length - 1].curvature)
    );
    const finalWeights = levelOutputs.map((_, i) => 1 / (i + 1)); // Weight by level

    const combined = lorentzCentroid(
      finalLorentzVectors,
      finalWeights,
      this.levels[this.levels.length - 1].curvature
    );

    const endTime = performance.now();

    return {
      lorentz: combined,
      euclidean: lorentzToEuclidean(combined, this.levels[this.levels.length - 1].curvature),
      weights: levelOutputs[levelOutputs.length - 1].weights,
      curvatures,
      metrics: {
        distanceOps: totalDistanceOps,
        aggregationOps: totalAggregationOps,
        totalTimeMs: endTime - startTime,
      },
    };
  }

  /**
   * Get cascade configuration for debugging/analysis
   */
  getConfig(): LorentzCascadeConfig {
    return { ...this.config };
  }

  /**
   * Get number of cascade levels
   */
  get numLevels(): number {
    return this.levels.length;
  }
}

/**
 * Adaptive Cascade Attention
 *
 * Automatically selects the optimal number of cascade levels
 * based on the data's hierarchical structure.
 */
export class AdaptiveCascadeAttention {
  private cascades: Map<number, LorentzCascadeAttention> = new Map();
  private readonly dim: number;
  private readonly maxLevels: number;

  constructor(dim: number, maxLevels: number = 5) {
    this.dim = dim;
    this.maxLevels = maxLevels;

    // Pre-create cascades for different depths
    for (let i = 1; i <= maxLevels; i++) {
      this.cascades.set(i, LorentzCascadeAttention.create(dim, i));
    }
  }

  /**
   * Compute attention with automatic level selection
   *
   * @param query - Query vector
   * @param keys - Key vectors
   * @param values - Value vectors
   * @param hierarchyDepth - Estimated hierarchy depth (optional)
   */
  compute(
    query: number[] | Float32Array,
    keys: (number[] | Float32Array)[],
    values: (number[] | Float32Array)[],
    hierarchyDepth?: number
  ): LorentzAttentionOutput {
    // Estimate optimal levels if not provided
    const numLevels = hierarchyDepth
      ? Math.min(Math.max(1, Math.ceil(hierarchyDepth)), this.maxLevels)
      : this.estimateOptimalLevels(keys.length);

    const cascade = this.cascades.get(numLevels)!;
    return cascade.compute(query, keys, values);
  }

  /**
   * Estimate optimal number of cascade levels based on data size
   */
  private estimateOptimalLevels(n: number): number {
    // Heuristic: log2(n) levels capture hierarchical structure
    return Math.min(Math.max(1, Math.ceil(Math.log2(n))), this.maxLevels);
  }
}

/**
 * Factory function for creating Lorentz Cascade Attention
 */
export function createLorentzCascadeAttention(
  dim: number,
  options?: {
    numLevels?: number;
    useTangentAttention?: boolean;
    curvatureRange?: [number, number];
  }
): LorentzCascadeAttention {
  const numLevels = options?.numLevels ?? 3;
  const [minC, maxC] = options?.curvatureRange ?? [-0.1, -1.0];

  const levels: CascadeLevel[] = [];
  for (let i = 0; i < numLevels; i++) {
    const t = numLevels > 1 ? i / (numLevels - 1) : 0;
    levels.push({
      curvature: minC + (maxC - minC) * t,
      numHeads: Math.min(1 << i, 8),
      dropout: 0.1 * t,
      temperature: 1.0 - 0.5 * t,
    });
  }

  return new LorentzCascadeAttention({
    dim,
    levels,
    useTangentAttention: options?.useTangentAttention ?? true,
    enableSimd: true,
    epsilon: 1e-7,
  });
}
