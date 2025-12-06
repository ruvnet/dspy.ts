/**
 * Lorentz Cascade Attention Types
 */

/**
 * Lorentz vector in hyperboloid model (Minkowski space)
 * First component is the time-like dimension
 */
export interface LorentzVector {
  /** Time-like component (x₀) */
  time: number;
  /** Space-like components (x₁...xₙ) */
  space: Float32Array;
}

/**
 * Attention output with hyperbolic geometry info
 */
export interface LorentzAttentionOutput {
  /** Output vector in Lorentz space */
  lorentz: LorentzVector;
  /** Output projected to Euclidean space */
  euclidean: Float32Array;
  /** Attention weights */
  weights: Float32Array;
  /** Curvature used at each cascade level */
  curvatures: number[];
  /** Computation metrics */
  metrics: {
    distanceOps: number;
    aggregationOps: number;
    totalTimeMs: number;
  };
}

/**
 * Cascade level configuration
 */
export interface CascadeLevel {
  /** Curvature at this level (negative for hyperbolic) */
  curvature: number;
  /** Number of attention heads */
  numHeads: number;
  /** Dropout rate */
  dropout: number;
  /** Temperature for attention softmax */
  temperature: number;
}

/**
 * Lorentz Cascade Attention configuration
 */
export interface LorentzCascadeConfig {
  /** Embedding dimension (space-like) */
  dim: number;
  /** Cascade levels from coarse to fine */
  levels: CascadeLevel[];
  /** Use tangent space attention (more stable) */
  useTangentAttention: boolean;
  /** Enable SIMD optimizations */
  enableSimd: boolean;
  /** Numerical stability epsilon */
  epsilon: number;
}

/**
 * Default cascade configuration for hierarchical data
 */
export const DEFAULT_CASCADE_CONFIG: Omit<LorentzCascadeConfig, 'dim'> = {
  levels: [
    { curvature: -0.1, numHeads: 1, dropout: 0.0, temperature: 1.0 },   // Coarse (near Euclidean)
    { curvature: -0.5, numHeads: 2, dropout: 0.1, temperature: 0.8 },   // Medium
    { curvature: -1.0, numHeads: 4, dropout: 0.1, temperature: 0.5 },   // Fine (strong hyperbolic)
  ],
  useTangentAttention: true,
  enableSimd: true,
  epsilon: 1e-7,
};

/**
 * Benchmark result for attention comparison
 */
export interface AttentionBenchmarkResult {
  name: string;
  operation: string;
  iterations: number;
  totalTimeMs: number;
  avgTimeMs: number;
  opsPerSecond: number;
  memoryBytes?: number;
}

/**
 * Comparison between Poincaré and Lorentz implementations
 */
export interface AttentionComparison {
  poincare: AttentionBenchmarkResult;
  lorentz: AttentionBenchmarkResult;
  improvement: {
    speedup: number;
    percentage: number;
  };
}
