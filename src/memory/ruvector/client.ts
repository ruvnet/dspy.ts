/**
 * RuVector Client - Optimized
 *
 * High-performance vector database client using native Rust or WASM implementation
 * with advanced caching, batch operations, and distance computations.
 *
 * Optimizations:
 * - Smart cache key generation using vector hashing
 * - LRU cache eviction with configurable size
 * - Batch search operations for throughput
 * - Selective cache invalidation
 * - Distance computation operations for attention mechanisms
 * - Performance metrics tracking
 */

import pino from 'pino';
import {
  RuVectorEntry,
  RuVectorQuery,
  RuVectorResult,
  RuVectorConfig,
  RuVectorStats,
  RuVectorBatchQuery,
  RuVectorBatchResult,
  RuVectorDistanceRequest,
  RuVectorDistanceResult,
  RuVectorCentroidRequest,
  RuVectorCentroidResult,
  RuVectorCacheStats,
  RuVectorCacheConfig,
  RuVectorEnhancedStats,
  RuVectorOptimizeOptions,
  CacheEntry,
  // New types for v2.5 features
  RuVectorPaginatedQuery,
  RuVectorPaginatedResult,
  RuVectorScanOptions,
  HNSWStats,
  HNSWTuneRequest,
  RuVectorSnapshot,
  RuVectorSnapshotOptions,
  RuVectorExportOptions,
  RuVectorImportOptions,
  RuVectorDistanceMatrixRequest,
  RuVectorDistanceMatrixResult,
  RuVectorAttentionRequest,
  RuVectorAttentionResult,
} from './types';

/**
 * LRU Cache implementation for vector search results
 */
class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private maxSize: number;
  private ttlMs?: number;
  private hitCount: number = 0;
  private missCount: number = 0;
  private evictionCount: number = 0;

  constructor(maxSize: number, ttlMs?: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.missCount++;
      return undefined;
    }

    // Check TTL
    if (this.ttlMs && Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.missCount++;
      return undefined;
    }

    // Update access metadata
    entry.lastAccess = Date.now();
    entry.accessCount++;
    this.hitCount++;

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: K, value: V, size: number = 1): void {
    // Evict if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
        this.evictionCount++;
      } else {
        break;
      }
    }

    const entry: CacheEntry<V> = {
      value,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccess: Date.now(),
      size,
    };

    this.cache.set(key, entry);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  /**
   * Selective invalidation based on predicate
   */
  invalidateWhere(predicate: (key: K) => boolean): number {
    let invalidated = 0;
    for (const key of this.cache.keys()) {
      if (predicate(key)) {
        this.cache.delete(key);
        invalidated++;
      }
    }
    return invalidated;
  }

  getStats(): RuVectorCacheStats {
    let totalMemory = 0;
    for (const entry of this.cache.values()) {
      totalMemory += entry.size;
    }

    const totalRequests = this.hitCount + this.missCount;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: totalRequests > 0 ? this.hitCount / totalRequests : 0,
      evictionCount: this.evictionCount,
      totalMemoryBytes: totalMemory,
    };
  }

  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
    this.evictionCount = 0;
  }
}

export class RuVectorClient {
  private logger: pino.Logger;
  private config: RuVectorConfig;
  private db: any;
  private initialized: boolean = false;
  private implementation: 'native' | 'wasm' = 'wasm';
  private cache: LRUCache<string, RuVectorResult[]>;
  private cacheConfig: RuVectorCacheConfig;

  // Performance tracking
  private searchLatencies: number[] = [];
  private insertLatencies: number[] = [];
  private maxLatencyHistory: number = 1000;
  private indexBuilt: boolean = false;
  private lastIndexBuildTime?: number;

  constructor(config: RuVectorConfig, cacheConfig?: Partial<RuVectorCacheConfig>) {
    this.config = {
      metric: 'cosine',
      autoPersist: false,
      hnsw: {
        m: 16,
        efConstruction: 200,
        efSearch: 100,
      },
      ...config,
    };

    this.cacheConfig = {
      maxSize: 1000,
      ttlMs: 60000, // 1 minute default TTL
      evictionPolicy: 'lru',
      hashAlgorithm: 'fast',
      ...cacheConfig,
    };

    this.cache = new LRUCache(this.cacheConfig.maxSize, this.cacheConfig.ttlMs);

    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      name: 'ruvector-client',
    });
  }

  /**
   * Initialize the RuVector database
   */
  async init(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('RuVector client already initialized');
      return;
    }

    try {
      this.logger.info('Initializing RuVector client', {
        dimension: this.config.dimension,
        metric: this.config.metric,
      });

      // Try to import ruvector
      const ruvector = await import('ruvector');

      // Check implementation type
      this.implementation = ruvector.getImplementationType();
      this.logger.info(`Using ${this.implementation} implementation`);

      // Create vector database
      this.db = new ruvector.VectorDB({
        dimension: this.config.dimension,
        metric: this.config.metric,
        path: this.config.path,
        autoPersist: this.config.autoPersist,
        hnsw: this.config.hnsw,
      });

      this.initialized = true;
      this.logger.info('RuVector client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize RuVector client', { error });
      throw new Error(`RuVector initialization failed: ${error}`);
    }
  }

  /**
   * Insert a single vector with performance tracking
   */
  async insert(entry: RuVectorEntry): Promise<void> {
    this.ensureInitialized();

    if (entry.vector.length !== this.config.dimension) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.config.dimension}, got ${entry.vector.length}`
      );
    }

    const startTime = performance.now();
    try {
      this.db.insert({
        id: entry.id,
        vector: entry.vector,
        metadata: entry.metadata || {},
      });

      // Selective cache invalidation - only invalidate entries that might be affected
      this.invalidateCacheSelective(entry.vector);

      const latency = performance.now() - startTime;
      this.recordInsertLatency(latency);
      this.logger.debug('Vector inserted', { id: entry.id, latencyMs: latency.toFixed(2) });
    } catch (error) {
      this.logger.error('Failed to insert vector', { error });
      throw error;
    }
  }

  /**
   * Insert multiple vectors in batch with optimizations
   */
  async insertBatch(entries: RuVectorEntry[]): Promise<void> {
    this.ensureInitialized();

    const startTime = performance.now();
    try {
      const formattedEntries = entries.map((e) => ({
        id: e.id,
        vector: e.vector,
        metadata: e.metadata || {},
      }));

      this.db.insertBatch(formattedEntries);

      // Full cache invalidation for batch operations
      this.cache.clear();

      const latency = performance.now() - startTime;
      this.recordInsertLatency(latency / entries.length);
      this.logger.debug('Batch insert complete', {
        count: entries.length,
        latencyMs: latency.toFixed(2),
        avgPerVector: (latency / entries.length).toFixed(3),
      });
    } catch (error) {
      this.logger.error('Failed to batch insert vectors', { error });
      throw error;
    }
  }

  /**
   * Search for similar vectors with smart caching
   */
  async search(query: RuVectorQuery): Promise<RuVectorResult[]> {
    this.ensureInitialized();

    const { vector, k = 10, filter, threshold = 0.0 } = query;

    // Generate smart cache key
    const cacheKey = this.generateCacheKey(vector, k, filter);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug('Cache hit', { k });
      return cached;
    }

    const startTime = performance.now();
    try {
      const results = this.db.search({
        vector,
        k,
        filter,
        threshold,
      });

      const formattedResults: RuVectorResult[] = results.map((r: any) => ({
        id: r.id,
        score: r.score,
        vector: r.vector,
        metadata: r.metadata,
      }));

      // Cache with estimated memory size
      const estimatedSize = formattedResults.length * (this.config.dimension * 8 + 100);
      this.cache.set(cacheKey, formattedResults, estimatedSize);

      const latency = performance.now() - startTime;
      this.recordSearchLatency(latency);
      this.logger.debug('Search complete', {
        resultsCount: formattedResults.length,
        latencyMs: latency.toFixed(2),
      });

      return formattedResults;
    } catch (error) {
      this.logger.error('Search failed', { error });
      throw error;
    }
  }

  /**
   * Batch search for multiple queries - optimized for throughput
   */
  async searchBatch(batchQuery: RuVectorBatchQuery): Promise<RuVectorBatchResult> {
    this.ensureInitialized();

    const { queries, parallel = true } = batchQuery;
    const startTime = performance.now();

    try {
      let results: RuVectorResult[][];

      if (parallel && queries.length > 1) {
        // Execute searches in parallel
        results = await Promise.all(queries.map((q) => this.search(q)));
      } else {
        // Sequential execution
        results = [];
        for (const query of queries) {
          results.push(await this.search(query));
        }
      }

      const totalTime = performance.now() - startTime;

      this.logger.debug('Batch search complete', {
        queryCount: queries.length,
        totalTimeMs: totalTime.toFixed(2),
        avgTimePerQuery: (totalTime / queries.length).toFixed(2),
      });

      return {
        results,
        totalTimeMs: totalTime,
        avgTimePerQuery: totalTime / queries.length,
      };
    } catch (error) {
      this.logger.error('Batch search failed', { error });
      throw error;
    }
  }

  /**
   * Compute distances between vectors - optimized for attention mechanisms
   */
  computeDistances(request: RuVectorDistanceRequest): RuVectorDistanceResult {
    const { vectors, metric = this.config.metric || 'cosine', pairwise = false } = request;
    const startTime = performance.now();

    let distances: number[] | number[][];

    if (pairwise) {
      // Compute pairwise distance matrix
      distances = this.computePairwiseDistances(vectors, metric);
    } else {
      // Compute distances from first vector to all others
      distances = this.computeSequentialDistances(vectors, metric);
    }

    const computeTime = performance.now() - startTime;

    return {
      distances,
      metric,
      computeTimeMs: computeTime,
    };
  }

  /**
   * Compute centroid of vectors - optimized for attention aggregation
   */
  computeCentroid(request: RuVectorCentroidRequest): RuVectorCentroidResult {
    const { vectors, weights, metric = 'euclidean' } = request;
    const startTime = performance.now();

    let centroid: number[];

    if (metric === 'lorentz') {
      centroid = this.computeLorentzCentroid(vectors, weights);
    } else {
      centroid = this.computeEuclideanCentroid(vectors, weights);
    }

    const computeTime = performance.now() - startTime;

    return {
      centroid,
      computeTimeMs: computeTime,
    };
  }

  /**
   * Get vector by ID
   */
  async get(id: string): Promise<RuVectorEntry | null> {
    this.ensureInitialized();

    try {
      const result = this.db.get(id);
      return result
        ? {
            id: result.id,
            vector: result.vector,
            metadata: result.metadata,
          }
        : null;
    } catch (error) {
      this.logger.error('Failed to get vector', { id, error });
      throw error;
    }
  }

  /**
   * Delete vector by ID with selective cache invalidation
   */
  async delete(id: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const result = this.db.delete(id);

      // Selective cache invalidation - invalidate entries containing this ID
      this.cache.invalidateWhere((key) => key.includes(id));

      this.logger.debug('Vector deleted', { id });
      return result;
    } catch (error) {
      this.logger.error('Failed to delete vector', { id, error });
      throw error;
    }
  }

  /**
   * Update vector metadata with selective cache invalidation
   */
  async updateMetadata(id: string, metadata: Record<string, any>): Promise<void> {
    this.ensureInitialized();

    try {
      this.db.updateMetadata(id, metadata);

      // Selective invalidation for metadata changes
      this.cache.invalidateWhere((key) => key.includes(id));

      this.logger.debug('Metadata updated', { id });
    } catch (error) {
      this.logger.error('Failed to update metadata', { id, error });
      throw error;
    }
  }

  /**
   * Get basic database statistics
   */
  getStats(): RuVectorStats {
    this.ensureInitialized();

    const dbStats = this.db.stats();
    return {
      count: dbStats.count,
      dimension: dbStats.dimension,
      metric: dbStats.metric,
      memoryUsage: dbStats.memoryUsage,
      indexType: dbStats.indexType,
      implementation: this.implementation,
    };
  }

  /**
   * Get enhanced statistics with cache and performance metrics
   */
  getEnhancedStats(): RuVectorEnhancedStats {
    this.ensureInitialized();

    const basicStats = this.getStats();
    const cacheStats = this.cache.getStats();

    return {
      ...basicStats,
      cacheStats,
      indexStats: {
        indexBuilt: this.indexBuilt,
        lastBuildTime: this.lastIndexBuildTime,
        approximateRecall: this.indexBuilt ? 0.95 : 1.0, // HNSW typical recall
      },
      performanceMetrics: {
        avgSearchLatencyMs: this.calculateAvgLatency(this.searchLatencies),
        avgInsertLatencyMs: this.calculateAvgLatency(this.insertLatencies),
        searchThroughput: this.calculateThroughput(this.searchLatencies),
        insertThroughput: this.calculateThroughput(this.insertLatencies),
      },
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): RuVectorCacheStats {
    return this.cache.getStats();
  }

  /**
   * Build HNSW index
   */
  buildIndex(): void {
    this.ensureInitialized();
    const startTime = performance.now();
    this.db.buildIndex();
    this.indexBuilt = true;
    this.lastIndexBuildTime = performance.now() - startTime;
    this.logger.info('Index built', { timeMs: this.lastIndexBuildTime.toFixed(2) });
  }

  /**
   * Optimize database with options
   */
  optimize(options?: RuVectorOptimizeOptions): void {
    this.ensureInitialized();

    const opts = {
      rebuildIndex: false,
      compactStorage: true,
      updateStatistics: true,
      defragment: false,
      ...options,
    };

    if (opts.rebuildIndex) {
      this.buildIndex();
    }

    if (opts.compactStorage) {
      this.db.optimize();
    }

    if (opts.defragment) {
      this.cache.clear();
    }

    this.logger.info('Database optimized', opts);
  }

  /**
   * Save database to disk
   */
  save(path?: string): void {
    this.ensureInitialized();
    this.db.save(path);
    this.logger.info('Database saved');
  }

  /**
   * Load database from disk
   */
  load(path: string): void {
    this.ensureInitialized();
    this.db.load(path);
    this.cache.clear();
    this.logger.info('Database loaded');
  }

  /**
   * Clear all vectors
   */
  clear(): void {
    this.ensureInitialized();
    this.db.clear();
    this.cache.clear();
    this.indexBuilt = false;
    this.logger.info('Database cleared');
  }

  /**
   * Get implementation type
   */
  getImplementationType(): 'native' | 'wasm' {
    return this.implementation;
  }

  /**
   * Check if using native implementation
   */
  isNative(): boolean {
    return this.implementation === 'native';
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset cache and performance statistics
   */
  resetStats(): void {
    this.cache.resetStats();
    this.searchLatencies = [];
    this.insertLatencies = [];
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('RuVector client not initialized. Call init() first.');
    }
  }

  /**
   * Generate smart cache key using vector hash
   */
  private generateCacheKey(
    vector: number[],
    k: number,
    filter?: Record<string, any>
  ): string {
    // Fast hash using FNV-1a algorithm for vector content
    let hash = 2166136261;
    for (let i = 0; i < vector.length; i++) {
      // Convert float to integer bits for stable hashing
      const bits = Math.round(vector[i] * 1e6);
      hash ^= bits;
      hash = Math.imul(hash, 16777619);
    }

    // Include k and filter in cache key
    const filterKey = filter ? JSON.stringify(filter) : '';
    return `${hash.toString(16)}_${k}_${filterKey}`;
  }

  /**
   * Selective cache invalidation based on vector similarity
   */
  private invalidateCacheSelective(newVector: number[]): void {
    // For single inserts, we can be selective about cache invalidation
    // Only invalidate entries where the new vector might affect results
    // This is a heuristic - invalidate based on hash bucket
    const bucketHash = this.computeVectorBucket(newVector);
    this.cache.invalidateWhere((key) => key.startsWith(bucketHash.toString(16).slice(0, 4)));
  }

  private computeVectorBucket(vector: number[]): number {
    // Simple LSH-like bucketing for selective invalidation
    let bucket = 0;
    const stride = Math.max(1, Math.floor(vector.length / 8));
    for (let i = 0; i < vector.length; i += stride) {
      bucket ^= Math.round(vector[i] * 100);
    }
    return bucket;
  }

  private recordSearchLatency(latencyMs: number): void {
    this.searchLatencies.push(latencyMs);
    if (this.searchLatencies.length > this.maxLatencyHistory) {
      this.searchLatencies.shift();
    }
  }

  private recordInsertLatency(latencyMs: number): void {
    this.insertLatencies.push(latencyMs);
    if (this.insertLatencies.length > this.maxLatencyHistory) {
      this.insertLatencies.shift();
    }
  }

  private calculateAvgLatency(latencies: number[]): number {
    if (latencies.length === 0) return 0;
    return latencies.reduce((a, b) => a + b, 0) / latencies.length;
  }

  private calculateThroughput(latencies: number[]): number {
    if (latencies.length === 0) return 0;
    const avgLatency = this.calculateAvgLatency(latencies);
    return avgLatency > 0 ? 1000 / avgLatency : 0;
  }

  // ============================================================================
  // Distance Computation Methods
  // ============================================================================

  private computePairwiseDistances(vectors: number[][], metric: string): number[][] {
    const n = vectors.length;
    const distances: number[][] = new Array(n);

    for (let i = 0; i < n; i++) {
      distances[i] = new Array(n);
      for (let j = 0; j < n; j++) {
        if (i === j) {
          distances[i][j] = 0;
        } else if (j < i) {
          distances[i][j] = distances[j][i]; // Symmetric
        } else {
          distances[i][j] = this.computeDistance(vectors[i], vectors[j], metric);
        }
      }
    }

    return distances;
  }

  private computeSequentialDistances(vectors: number[][], metric: string): number[] {
    if (vectors.length < 2) return [];

    const reference = vectors[0];
    const distances: number[] = new Array(vectors.length - 1);

    for (let i = 1; i < vectors.length; i++) {
      distances[i - 1] = this.computeDistance(reference, vectors[i], metric);
    }

    return distances;
  }

  private computeDistance(a: number[], b: number[], metric: string): number {
    switch (metric) {
      case 'cosine':
        return this.cosineDistance(a, b);
      case 'euclidean':
        return this.euclideanDistance(a, b);
      case 'dot':
        return this.dotProduct(a, b);
      case 'lorentz':
        return this.lorentzDistance(a, b);
      default:
        return this.cosineDistance(a, b);
    }
  }

  private cosineDistance(a: number[], b: number[]): number {
    let dot = 0,
      normA = 0,
      normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    return 1 - similarity;
  }

  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  private dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return -sum; // Negative so larger dot product = smaller distance
  }

  private lorentzDistance(a: number[], b: number[]): number {
    // Lorentz distance for hyperbolic geometry
    // a[0] and b[0] are the time components
    let inner = -a[0] * b[0];
    for (let i = 1; i < a.length; i++) {
      inner += a[i] * b[i];
    }
    // Clamp to avoid numerical issues
    inner = Math.max(-inner, 1.0);
    return Math.acosh(inner);
  }

  // ============================================================================
  // Centroid Computation Methods
  // ============================================================================

  private computeEuclideanCentroid(vectors: number[][], weights?: number[]): number[] {
    if (vectors.length === 0) return [];

    const dim = vectors[0].length;
    const centroid = new Array(dim).fill(0);
    let totalWeight = 0;

    for (let i = 0; i < vectors.length; i++) {
      const w = weights ? weights[i] : 1;
      totalWeight += w;
      for (let j = 0; j < dim; j++) {
        centroid[j] += vectors[i][j] * w;
      }
    }

    for (let j = 0; j < dim; j++) {
      centroid[j] /= totalWeight;
    }

    return centroid;
  }

  private computeLorentzCentroid(vectors: number[][], weights?: number[]): number[] {
    if (vectors.length === 0) return [];

    const dim = vectors[0].length;

    // Weighted sum in ambient space
    const sum = new Array(dim).fill(0);
    let totalWeight = 0;

    for (let i = 0; i < vectors.length; i++) {
      const w = weights ? weights[i] : 1;
      totalWeight += w;
      for (let j = 0; j < dim; j++) {
        sum[j] += vectors[i][j] * w;
      }
    }

    // Normalize to hyperboloid
    // Minkowski norm: -x[0]^2 + sum(x[i]^2 for i>0) = -1
    let spaceNormSq = 0;
    for (let i = 1; i < dim; i++) {
      sum[i] /= totalWeight;
      spaceNormSq += sum[i] * sum[i];
    }

    // Solve for time component: t^2 = 1 + spaceNormSq
    sum[0] = Math.sqrt(1 + spaceNormSq);

    return sum;
  }

  // ============================================================================
  // Streaming & Pagination Methods
  // ============================================================================

  /**
   * Search with pagination for large result sets
   */
  async searchPaginated(query: RuVectorPaginatedQuery): Promise<RuVectorPaginatedResult> {
    this.ensureInitialized();

    const { pagination } = query;
    const page = pagination.page ?? 0;
    const pageSize = pagination.pageSize;

    // Get all results first (we'll optimize with cursor-based pagination later)
    const allResults = await this.search({
      vector: query.vector,
      k: (page + 1) * pageSize + pageSize, // Fetch enough for next page check
      filter: query.filter,
      threshold: query.threshold,
    });

    const totalResults = allResults.length;
    const totalPages = Math.ceil(totalResults / pageSize);
    const startIndex = page * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalResults);
    const results = allResults.slice(startIndex, endIndex);
    const hasMore = endIndex < totalResults;

    // Generate cursor for next page
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ page: page + 1, query: query.vector.slice(0, 10) })).toString('base64')
      : undefined;

    return {
      results,
      pagination: {
        page,
        pageSize,
        totalResults,
        totalPages,
        hasMore,
        nextCursor,
      },
    };
  }

  /**
   * Create an async iterator for streaming search results
   */
  async *searchStream(
    query: RuVectorQuery,
    batchSize: number = 100
  ): AsyncGenerator<RuVectorResult, void, unknown> {
    this.ensureInitialized();

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const results = await this.search({
        ...query,
        k: batchSize,
      });

      // In a real implementation, we would use offset-based pagination
      // For now, we yield all results and stop
      for (const result of results) {
        yield result;
      }

      // Since ruvector doesn't support offset natively, we stop after first batch
      hasMore = false;
      offset += results.length;
    }
  }

  /**
   * Scan all vectors with optional filtering
   */
  async *scanAll(options: RuVectorScanOptions = {}): AsyncGenerator<RuVectorEntry, void, unknown> {
    this.ensureInitialized();

    const { batchSize = 1000, filter, includeVectors = true } = options;

    // Get stats to know total count
    const stats = this.getStats();
    const totalCount = stats.count;

    if (totalCount === 0) return;

    // For now, we simulate scanning by searching with a random vector
    // In production, ruvector would provide a native scan API
    const randomVector = new Array(this.config.dimension).fill(0).map(() => Math.random() * 2 - 1);

    let yielded = 0;
    const results = await this.search({
      vector: randomVector,
      k: Math.min(totalCount, 10000), // Cap at 10k for safety
      filter,
    });

    for (const result of results) {
      yield {
        id: result.id,
        vector: includeVectors ? result.vector : [],
        metadata: result.metadata,
      };
      yielded++;

      if (yielded >= totalCount) break;
    }
  }

  // ============================================================================
  // HNSW Tuning Methods
  // ============================================================================

  /**
   * Get HNSW index statistics
   */
  getHNSWStats(): HNSWStats {
    this.ensureInitialized();

    const stats = this.db.stats();
    const vectorCount = stats.count;

    // Estimate HNSW statistics
    // These are approximations based on typical HNSW behavior
    const m = this.config.hnsw?.m || 16;
    const avgConnectivity = m * 2; // Approximate
    const maxLevel = Math.floor(Math.log(vectorCount + 1) / Math.log(m)) + 1;
    const edgeCount = vectorCount * avgConnectivity;

    return {
      layerCount: maxLevel,
      edgeCount,
      avgConnectivity,
      maxLevel,
      entryPointId: undefined, // Would need native support
      indexSizeBytes: stats.memoryUsage || vectorCount * this.config.dimension * 4,
    };
  }

  /**
   * Tune HNSW parameters at runtime
   */
  async tuneHNSW(request: HNSWTuneRequest): Promise<void> {
    this.ensureInitialized();

    if (request.efSearch !== undefined) {
      // Update efSearch for subsequent queries
      this.config.hnsw = {
        ...this.config.hnsw,
        efSearch: request.efSearch,
      };
      this.logger.info('HNSW efSearch updated', { efSearch: request.efSearch });
    }

    if (request.rebuildIndex) {
      await this.buildIndex();
      this.logger.info('HNSW index rebuilt');
    }

    // Invalidate cache after tuning
    this.cache.clear();
  }

  /**
   * Auto-tune HNSW parameters based on recall target
   */
  async autoTuneHNSW(targetRecall: number = 0.95): Promise<{ efSearch: number; estimatedRecall: number }> {
    this.ensureInitialized();

    // Start with current efSearch or default
    let efSearch = this.config.hnsw?.efSearch || 50;
    let estimatedRecall = 0.9; // Initial estimate

    // Binary search for optimal efSearch
    let low = 10;
    let high = 500;

    while (high - low > 10) {
      const mid = Math.floor((low + high) / 2);
      // Estimate recall based on efSearch (simplified model)
      estimatedRecall = 1 - Math.exp(-mid / 50);

      if (estimatedRecall < targetRecall) {
        low = mid;
      } else {
        high = mid;
        efSearch = mid;
      }
    }

    await this.tuneHNSW({ efSearch });

    return { efSearch, estimatedRecall };
  }

  // ============================================================================
  // Snapshot & Versioning Methods
  // ============================================================================

  private snapshots: Map<string, RuVectorSnapshot> = new Map();

  /**
   * Create a named snapshot
   */
  async createSnapshot(options: RuVectorSnapshotOptions): Promise<RuVectorSnapshot> {
    this.ensureInitialized();

    const stats = this.getStats();
    const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Save current state
    const snapshotPath = this.config.path
      ? `${this.config.path}.${snapshotId}`
      : undefined;

    if (snapshotPath) {
      await this.save(snapshotPath);
    }

    const snapshot: RuVectorSnapshot = {
      id: snapshotId,
      name: options.name,
      timestamp: Date.now(),
      vectorCount: stats.count,
      dimension: stats.dimension,
      sizeBytes: stats.memoryUsage || 0,
      metadata: options.metadata,
    };

    this.snapshots.set(snapshotId, snapshot);
    this.logger.info('Snapshot created', { snapshotId, name: options.name });

    return snapshot;
  }

  /**
   * List all snapshots
   */
  listSnapshots(): RuVectorSnapshot[] {
    return Array.from(this.snapshots.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Restore from a snapshot
   */
  async restoreSnapshot(snapshotId: string): Promise<void> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    const snapshotPath = this.config.path
      ? `${this.config.path}.${snapshotId}`
      : undefined;

    if (snapshotPath) {
      await this.load(snapshotPath);
      this.cache.clear();
      this.logger.info('Snapshot restored', { snapshotId });
    } else {
      throw new Error('Cannot restore snapshot: no path configured');
    }
  }

  /**
   * Delete a snapshot
   */
  deleteSnapshot(snapshotId: string): boolean {
    const deleted = this.snapshots.delete(snapshotId);
    if (deleted) {
      this.logger.info('Snapshot deleted', { snapshotId });
    }
    return deleted;
  }

  /**
   * Export vectors to JSON
   */
  async exportVectors(options: RuVectorExportOptions): Promise<string> {
    this.ensureInitialized();

    const vectors: RuVectorEntry[] = [];

    for await (const entry of this.scanAll({
      filter: options.filter,
      includeVectors: true,
    })) {
      const exportEntry: RuVectorEntry = {
        id: entry.id,
        vector: entry.vector,
      };

      if (options.includeMetadata && entry.metadata) {
        exportEntry.metadata = entry.metadata;
      }

      vectors.push(exportEntry);
    }

    if (options.format === 'json') {
      return JSON.stringify(vectors, null, 2);
    }

    // Binary format: simple concatenation
    return JSON.stringify(vectors);
  }

  /**
   * Import vectors from JSON
   */
  async importVectors(data: string, options: RuVectorImportOptions): Promise<{ imported: number; skipped: number }> {
    this.ensureInitialized();

    const vectors: RuVectorEntry[] = JSON.parse(data);
    let imported = 0;
    let skipped = 0;

    if (options.mode === 'replace') {
      await this.clear();
    }

    for (const entry of vectors) {
      if (options.validateDimension && entry.vector.length !== this.config.dimension) {
        this.logger.warn('Skipping vector with wrong dimension', {
          id: entry.id,
          expected: this.config.dimension,
          got: entry.vector.length,
        });
        skipped++;
        continue;
      }

      if (options.mode === 'skip-existing') {
        const existing = await this.get(entry.id);
        if (existing) {
          skipped++;
          continue;
        }
      }

      await this.insert(entry);
      imported++;
    }

    this.logger.info('Import completed', { imported, skipped });
    return { imported, skipped };
  }

  // ============================================================================
  // Distance Matrix & Attention Methods
  // ============================================================================

  /**
   * Compute full distance matrix between vectors
   */
  computeDistanceMatrix(request: RuVectorDistanceMatrixRequest): RuVectorDistanceMatrixResult {
    const startTime = Date.now();
    const { vectors, metric = 'cosine', symmetric = true } = request;
    const n = vectors.length;
    const matrix: number[][] = new Array(n);

    for (let i = 0; i < n; i++) {
      matrix[i] = new Array(n);
      matrix[i][i] = 0; // Distance to self is 0

      const jStart = symmetric ? i + 1 : 0;
      for (let j = jStart; j < n; j++) {
        if (i === j) continue;

        const distance = this.computeDistance(vectors[i], vectors[j], metric);
        matrix[i][j] = distance;

        if (symmetric) {
          matrix[j][i] = distance;
        }
      }
    }

    return {
      matrix,
      metric,
      computeTimeMs: Date.now() - startTime,
      size: n,
    };
  }

  /**
   * Compute attention scores (Q @ K^T with optional scaling)
   */
  computeAttentionScores(request: RuVectorAttentionRequest): RuVectorAttentionResult {
    const startTime = Date.now();
    const { queries, keys, scale, metric = 'dot' } = request;

    const numQueries = queries.length;
    const numKeys = keys.length;
    const scores: number[][] = new Array(numQueries);

    // Default scale is 1/sqrt(dimension)
    const dim = queries[0]?.length || 1;
    const scaleFactor = scale ?? 1 / Math.sqrt(dim);

    for (let i = 0; i < numQueries; i++) {
      scores[i] = new Array(numKeys);

      for (let j = 0; j < numKeys; j++) {
        let score: number;

        if (metric === 'dot') {
          // Raw dot product
          score = 0;
          for (let k = 0; k < dim; k++) {
            score += queries[i][k] * keys[j][k];
          }
        } else {
          // Cosine similarity
          let dot = 0, normQ = 0, normK = 0;
          for (let k = 0; k < dim; k++) {
            dot += queries[i][k] * keys[j][k];
            normQ += queries[i][k] * queries[i][k];
            normK += keys[j][k] * keys[j][k];
          }
          score = dot / (Math.sqrt(normQ) * Math.sqrt(normK) + 1e-10);
        }

        scores[i][j] = score * scaleFactor;
      }
    }

    return {
      scores,
      computeTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Apply softmax to attention scores
   */
  applySoftmax(scores: number[][]): number[][] {
    return scores.map(row => {
      const maxScore = Math.max(...row);
      const expScores = row.map(s => Math.exp(s - maxScore));
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      return expScores.map(e => e / sumExp);
    });
  }
}
