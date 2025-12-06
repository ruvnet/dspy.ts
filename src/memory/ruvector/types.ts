/**
 * RuVector Types
 *
 * Type definitions for RuVector integration
 */

/**
 * Vector entry for storage
 */
export interface RuVectorEntry {
  id: string;
  vector: number[];
  metadata?: Record<string, any>;
}

/**
 * Search query parameters
 */
export interface RuVectorQuery {
  vector: number[];
  k?: number;
  filter?: Record<string, any>;
  threshold?: number;
}

/**
 * Search result
 */
export interface RuVectorResult {
  id: string;
  score: number;
  vector: number[];
  metadata?: Record<string, any>;
}

/**
 * Database configuration
 */
export interface RuVectorConfig {
  dimension: number;
  metric?: 'cosine' | 'euclidean' | 'dot';
  path?: string;
  autoPersist?: boolean;
  hnsw?: {
    m?: number;
    efConstruction?: number;
    efSearch?: number;
  };
}

/**
 * Database statistics
 */
export interface RuVectorStats {
  count: number;
  dimension: number;
  metric: string;
  memoryUsage?: number;
  indexType?: string;
  implementation: 'native' | 'wasm';
}

/**
 * Benchmark result
 */
export interface BenchmarkResult {
  operation: string;
  iterations: number;
  totalTimeMs: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  opsPerSecond: number;
}

/**
 * Benchmark comparison
 */
export interface BenchmarkComparison {
  before: BenchmarkResult;
  after: BenchmarkResult;
  improvement: {
    percentage: number;
    factor: number;
  };
}
