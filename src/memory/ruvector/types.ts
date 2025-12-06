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

// ============================================================================
// Batch Operations Types
// ============================================================================

/**
 * Batch search query
 */
export interface RuVectorBatchQuery {
  queries: RuVectorQuery[];
  parallel?: boolean;
}

/**
 * Batch search result
 */
export interface RuVectorBatchResult {
  results: RuVectorResult[][];
  totalTimeMs: number;
  avgTimePerQuery: number;
}

/**
 * Distance computation request
 */
export interface RuVectorDistanceRequest {
  vectors: number[][];
  metric?: 'cosine' | 'euclidean' | 'dot' | 'lorentz';
  pairwise?: boolean;
}

/**
 * Distance computation result
 */
export interface RuVectorDistanceResult {
  distances: number[] | number[][];
  metric: string;
  computeTimeMs: number;
}

/**
 * Centroid computation request
 */
export interface RuVectorCentroidRequest {
  vectors: number[][];
  weights?: number[];
  metric?: 'euclidean' | 'lorentz';
}

/**
 * Centroid computation result
 */
export interface RuVectorCentroidResult {
  centroid: number[];
  computeTimeMs: number;
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  lastAccess: number;
  size: number;
}

/**
 * Cache statistics
 */
export interface RuVectorCacheStats {
  size: number;
  maxSize: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictionCount: number;
  totalMemoryBytes: number;
}

/**
 * Cache configuration
 */
export interface RuVectorCacheConfig {
  maxSize: number;
  ttlMs?: number;
  evictionPolicy: 'lru' | 'lfu' | 'fifo';
  hashAlgorithm: 'fast' | 'secure';
}

// ============================================================================
// Optimization Types
// ============================================================================

/**
 * Prefetch request for predictive caching
 */
export interface RuVectorPrefetchRequest {
  vectors: number[][];
  k: number;
  priority?: 'high' | 'normal' | 'low';
}

/**
 * Index optimization options
 */
export interface RuVectorOptimizeOptions {
  rebuildIndex?: boolean;
  compactStorage?: boolean;
  updateStatistics?: boolean;
  defragment?: boolean;
}

/**
 * Enhanced stats with performance metrics
 */
export interface RuVectorEnhancedStats extends RuVectorStats {
  cacheStats: RuVectorCacheStats;
  indexStats: {
    indexBuilt: boolean;
    lastBuildTime?: number;
    approximateRecall: number;
  };
  performanceMetrics: {
    avgSearchLatencyMs: number;
    avgInsertLatencyMs: number;
    searchThroughput: number;
    insertThroughput: number;
  };
}

// ============================================================================
// Streaming & Pagination Types
// ============================================================================

/**
 * Pagination options for large result sets
 */
export interface RuVectorPaginationOptions {
  pageSize: number;
  page?: number;
  cursor?: string;
}

/**
 * Paginated search query
 */
export interface RuVectorPaginatedQuery extends RuVectorQuery {
  pagination: RuVectorPaginationOptions;
}

/**
 * Paginated search result
 */
export interface RuVectorPaginatedResult {
  results: RuVectorResult[];
  pagination: {
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}

/**
 * Search cursor for streaming
 */
export interface RuVectorSearchCursor {
  id: string;
  query: RuVectorQuery;
  position: number;
  hasMore: boolean;
  createdAt: number;
}

/**
 * Iterator result for streaming
 */
export interface RuVectorIteratorResult {
  value: RuVectorResult;
  done: boolean;
}

/**
 * Scan options for iterating all vectors
 */
export interface RuVectorScanOptions {
  batchSize?: number;
  filter?: Record<string, any>;
  includeVectors?: boolean;
}

// ============================================================================
// HNSW Tuning Types
// ============================================================================

/**
 * HNSW index parameters
 */
export interface HNSWParams {
  m?: number;
  efConstruction?: number;
  efSearch?: number;
}

/**
 * HNSW index statistics
 */
export interface HNSWStats {
  layerCount: number;
  edgeCount: number;
  avgConnectivity: number;
  maxLevel: number;
  entryPointId?: string;
  indexSizeBytes: number;
}

/**
 * HNSW tuning request
 */
export interface HNSWTuneRequest {
  efSearch?: number;
  rebuildIndex?: boolean;
  targetRecall?: number;
}

// ============================================================================
// Snapshot & Versioning Types
// ============================================================================

/**
 * Snapshot metadata
 */
export interface RuVectorSnapshot {
  id: string;
  name: string;
  timestamp: number;
  vectorCount: number;
  dimension: number;
  sizeBytes: number;
  metadata?: Record<string, any>;
}

/**
 * Snapshot creation options
 */
export interface RuVectorSnapshotOptions {
  name: string;
  metadata?: Record<string, any>;
  compress?: boolean;
}

/**
 * Export options
 */
export interface RuVectorExportOptions {
  format: 'json' | 'binary';
  includeMetadata?: boolean;
  filter?: Record<string, any>;
  compress?: boolean;
}

/**
 * Import options
 */
export interface RuVectorImportOptions {
  mode: 'replace' | 'merge' | 'skip-existing';
  validateDimension?: boolean;
}

// ============================================================================
// Distance Matrix Types
// ============================================================================

/**
 * Distance matrix computation request
 */
export interface RuVectorDistanceMatrixRequest {
  vectors: number[][];
  metric?: 'cosine' | 'euclidean' | 'dot' | 'lorentz';
  symmetric?: boolean;
}

/**
 * Distance matrix result
 */
export interface RuVectorDistanceMatrixResult {
  matrix: number[][];
  metric: string;
  computeTimeMs: number;
  size: number;
}

/**
 * Attention score computation request
 */
export interface RuVectorAttentionRequest {
  queries: number[][];
  keys: number[][];
  scale?: number;
  metric?: 'dot' | 'cosine';
}

/**
 * Attention scores result
 */
export interface RuVectorAttentionResult {
  scores: number[][];
  computeTimeMs: number;
}
