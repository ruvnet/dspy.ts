/**
 * AgentDB Client
 *
 * Main client for interacting with AgentDB vector database
 * Now with RuVector integration for high-performance native operations
 */

import pino from 'pino';
import retry from 'async-retry';
import { AgentDBConfig, mergeConfig } from './config';
import {
  VectorData,
  SearchResult,
  SearchOptions,
  BatchResult,
  MCPTool,
  AgentDBStats,
} from './types';
import { RuVectorClient } from '../ruvector/client';

// ============================================================================
// Circuit Breaker State
// ============================================================================

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
  successCount: number;
}

// ============================================================================
// LRU Cache with Selective Invalidation
// ============================================================================

class AgentDBCache<K, V> {
  private cache: Map<K, { value: V; timestamp: number; hash: number }> = new Map();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number = 1000, ttlMs: number = 300000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to front (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, vectorHash: number): void {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, timestamp: Date.now(), hash: vectorHash });
  }

  invalidateByVectorHash(hash: number, tolerance: number = 100): void {
    // Selective invalidation - only invalidate entries whose hash is close
    for (const [key, entry] of this.cache.entries()) {
      if (Math.abs(entry.hash - hash) < tolerance) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export class AgentDBClient {
  private config: AgentDBConfig;
  private logger: pino.Logger;
  private initialized: boolean = false;
  private db: any; // AgentDB instance
  private ruVectorClient: RuVectorClient | null = null;
  private useRuVector: boolean = false;
  private cache: AgentDBCache<string, SearchResult[]>;
  private stats: AgentDBStats = {
    totalVectors: 0,
    indexSize: 0,
    memoryUsage: 0,
    totalSearches: 0,
    avgSearchLatency: 0,
    cacheHitRate: 0,
  };

  // Circuit breaker for RuVector
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    state: 'closed',
    successCount: 0,
  };
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds
  private readonly CIRCUIT_BREAKER_SUCCESS_THRESHOLD = 3;

  // Improved stats tracking
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private latencyHistory: number[] = [];
  private readonly MAX_LATENCY_SAMPLES = 100;

  // Stats caching
  private cachedStats: (AgentDBStats & { ruVectorEnabled: boolean; implementation?: string }) | null = null;
  private statsCacheTime: number = 0;
  private readonly STATS_CACHE_TTL = 10000; // 10 seconds

  constructor(config?: Partial<AgentDBConfig>) {
    this.config = mergeConfig(config || {});
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      name: 'agentdb-client',
    });
    this.cache = new AgentDBCache(
      this.config.performance?.cacheSize || 1000,
      300000 // 5 minute TTL
    );
  }

  // ============================================================================
  // Circuit Breaker Methods
  // ============================================================================

  private shouldUseRuVector(): boolean {
    if (!this.useRuVector || !this.ruVectorClient) return false;

    const now = Date.now();

    switch (this.circuitBreaker.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if timeout has passed
        if (now - this.circuitBreaker.lastFailure > this.CIRCUIT_BREAKER_TIMEOUT) {
          this.circuitBreaker.state = 'half-open';
          this.circuitBreaker.successCount = 0;
          this.logger.info('Circuit breaker transitioning to half-open');
          return true;
        }
        return false;

      case 'half-open':
        return true;
    }
  }

  private recordRuVectorSuccess(): void {
    if (this.circuitBreaker.state === 'half-open') {
      this.circuitBreaker.successCount++;
      if (this.circuitBreaker.successCount >= this.CIRCUIT_BREAKER_SUCCESS_THRESHOLD) {
        this.circuitBreaker.state = 'closed';
        this.circuitBreaker.failures = 0;
        this.logger.info('Circuit breaker closed - RuVector recovered');
      }
    } else {
      this.circuitBreaker.failures = 0;
    }
  }

  private recordRuVectorFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.state === 'half-open') {
      this.circuitBreaker.state = 'open';
      this.logger.warn('Circuit breaker re-opened - RuVector still failing');
    } else if (this.circuitBreaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreaker.state = 'open';
      this.logger.warn('Circuit breaker opened - falling back to AgentDB', {
        failures: this.circuitBreaker.failures,
      });
    }
  }

  // ============================================================================
  // Fast Hash Function (FNV-1a)
  // ============================================================================

  private hashVector(vector: number[]): number {
    let hash = 2166136261;
    for (let i = 0; i < vector.length; i++) {
      const bits = Math.round(vector[i] * 1e6);
      hash ^= bits;
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /**
   * Initialize AgentDB client
   */
  async init(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('AgentDB client already initialized');
      return;
    }

    try {
      this.logger.info('Initializing AgentDB client', {
        config: {
          vectorDimension: this.config.vectorDimension,
          indexType: this.config.indexType,
          mcpEnabled: this.config.mcpEnabled,
          useRuVector: this.config.useRuVector,
        },
      });

      // Try to initialize RuVector for high-performance operations
      if (this.config.useRuVector) {
        try {
          this.ruVectorClient = new RuVectorClient({
            dimension: this.config.vectorDimension,
            metric: 'cosine',
            hnsw: this.config.hnswParams,
          });
          await this.ruVectorClient.init();
          this.useRuVector = true;
          this.logger.info('RuVector initialized', {
            implementation: this.ruVectorClient.getImplementationType(),
          });
        } catch (ruVectorError) {
          this.logger.warn('RuVector not available, falling back to AgentDB', { error: ruVectorError });
          this.useRuVector = false;
        }
      }

      // Import AgentDB dynamically as fallback or for additional features
      try {
        const AgentDB = await import('agentdb');

        // Initialize database with proper type handling
        this.db = new (AgentDB as any).default({
          dimension: this.config.vectorDimension,
          indexType: this.config.indexType,
          ...this.config.hnswParams,
          storage: this.config.storage,
        });

        if (this.db && typeof this.db.init === 'function') {
          await this.db.init();
        }
      } catch (error) {
        // AgentDB may not be available in all environments
        if (!this.useRuVector) {
          this.logger.warn('AgentDB not available, using in-memory fallback', { error });
          this.db = this.createFallbackDB();
        }
      }

      // Initialize MCP tools if enabled
      if (this.config.mcpEnabled) {
        await this.initializeMCPTools();
      }

      // Start auto-save if configured
      if (
        this.config.storage.autoSaveInterval &&
        !this.config.storage.inMemory
      ) {
        this.startAutoSave();
      }

      this.initialized = true;
      this.logger.info('AgentDB client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize AgentDB client', { error });
      throw new Error(`AgentDB initialization failed: ${error}`);
    }
  }

  /**
   * Store a vector in the database
   * Uses RuVector for high-performance native operations when available
   */
  async store(
    vector: number[],
    metadata: Record<string, any> = {}
  ): Promise<string> {
    this.ensureInitialized();

    if (vector.length !== this.config.vectorDimension) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.config.vectorDimension}, got ${vector.length}`
      );
    }

    try {
      const id = this.generateId();
      const now = new Date();

      const data: VectorData = {
        id,
        vector,
        metadata,
        createdAt: now,
        updatedAt: now,
      };

      // Use RuVector for high-performance operations (with circuit breaker)
      if (this.shouldUseRuVector()) {
        try {
          await retry(
            async () => {
              await this.ruVectorClient!.insert({
                id,
                vector,
                metadata: { ...metadata, createdAt: now.toISOString(), updatedAt: now.toISOString() },
              });
            },
            {
              retries: 2, // Fewer retries for inserts
              minTimeout: 50,
              maxTimeout: 500,
            }
          );
          this.recordRuVectorSuccess();
        } catch (ruVectorError) {
          this.recordRuVectorFailure();
          // Fall back to AgentDB
          await retry(
            async () => {
              await this.db.insert(id, vector, metadata);
            },
            {
              retries: 3,
              minTimeout: 100,
              maxTimeout: 1000,
            }
          );
        }
      } else {
        await retry(
          async () => {
            await this.db.insert(id, vector, metadata);
          },
          {
            retries: 3,
            minTimeout: 100,
            maxTimeout: 1000,
          }
        );
      }

      this.stats.totalVectors++;
      // Selective cache invalidation based on vector hash
      const vectorHash = this.hashVector(vector);
      this.cache.invalidateByVectorHash(vectorHash);
      this.invalidateStatsCache();

      this.logger.debug('Vector stored', { id, metadataKeys: Object.keys(metadata), useRuVector: this.useRuVector });
      return id;
    } catch (error) {
      this.logger.error('Failed to store vector', { error });
      throw error;
    }
  }

  /**
   * Search for similar vectors
   * Uses RuVector for high-performance native HNSW search when available
   */
  async search(
    query: number[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    this.ensureInitialized();

    const {
      k = 10,
      minScore = 0.0,
      filter = {},
      includeVectors = false,
      metric = 'cosine',
    } = options;

    // Check cache (using fast hash-based key)
    const cacheKey = this.getCacheKey(query, options);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.stats.totalSearches++;
      this.cacheHits++;
      return cached;
    }

    try {
      const startTime = Date.now();

      let searchResults: SearchResult[];

      const vectorHash = this.hashVector(query);

      // Use RuVector for high-performance search (with circuit breaker)
      if (this.shouldUseRuVector()) {
        try {
          const results = await retry(
            async () => {
              return await this.ruVectorClient!.search({
                vector: query,
                k,
                filter: Object.keys(filter).length > 0 ? filter : undefined,
                threshold: minScore,
              });
            },
            {
              retries: 3,
              minTimeout: 200, // Longer timeout for search
              maxTimeout: 2000,
            }
          );
          this.recordRuVectorSuccess();

          // Transform RuVector results to SearchResult format
          searchResults = results.map((r) => ({
            id: r.id,
            score: r.score,
            distance: 1 - r.score,
            data: {
              id: r.id,
              vector: includeVectors ? r.vector : [],
              metadata: r.metadata || {},
              createdAt: r.metadata?.createdAt ? new Date(r.metadata.createdAt) : new Date(),
              updatedAt: r.metadata?.updatedAt ? new Date(r.metadata.updatedAt) : new Date(),
            },
          }));
        } catch (ruVectorError) {
          this.recordRuVectorFailure();
          // Fall back to AgentDB search
          searchResults = await this.fallbackSearch(query, k, minScore, filter, includeVectors, metric);
        }
      } else {
        searchResults = await this.fallbackSearch(query, k, minScore, filter, includeVectors, metric);
      }

      // Update stats
      const latency = Date.now() - startTime;
      this.updateSearchStats(latency);

      // Cache results with vector hash for selective invalidation
      this.cache.set(cacheKey, searchResults, vectorHash);

      this.cacheMisses++;
      this.logger.debug('Search completed', {
        resultsCount: searchResults.length,
        latency,
        useRuVector: this.useRuVector,
      });

      return searchResults;
    } catch (error) {
      this.logger.error('Search failed', { error });
      throw error;
    }
  }

  /**
   * Update a vector
   */
  async update(
    id: string,
    data: Partial<Pick<VectorData, 'vector' | 'metadata'>>
  ): Promise<void> {
    this.ensureInitialized();

    try {
      await retry(
        async () => {
          if (data.vector) {
            await this.db.update(id, data.vector, data.metadata);
          } else if (data.metadata) {
            await this.db.updateMetadata(id, data.metadata);
          }
        },
        {
          retries: 3,
          minTimeout: 100,
          maxTimeout: 1000,
        }
      );

      this.cache.clear(); // Full clear on update for safety
      this.invalidateStatsCache();
      this.logger.debug('Vector updated', { id });
    } catch (error) {
      this.logger.error('Failed to update vector', { id, error });
      throw error;
    }
  }

  /**
   * Delete a vector
   */
  async delete(id: string): Promise<void> {
    this.ensureInitialized();

    try {
      await retry(
        async () => {
          await this.db.delete(id);
        },
        {
          retries: 3,
          minTimeout: 100,
          maxTimeout: 1000,
        }
      );

      this.stats.totalVectors--;
      this.cache.clear(); // Full clear on delete for safety
      this.invalidateStatsCache();
      this.logger.debug('Vector deleted', { id });
    } catch (error) {
      this.logger.error('Failed to delete vector', { id, error });
      throw error;
    }
  }

  /**
   * Batch store vectors (with parallel processing)
   */
  async batchStore(
    vectors: Array<{ vector: number[]; metadata?: Record<string, any> }>,
    options: { concurrency?: number } = {}
  ): Promise<BatchResult<string>> {
    this.ensureInitialized();

    if (!this.config.performance.batchEnabled) {
      throw new Error('Batch operations are disabled');
    }

    const { concurrency = 10 } = options;
    const success: string[] = [];
    const failed: Array<{ index: number; error: Error }> = [];

    // Process in batches for controlled parallelism
    for (let i = 0; i < vectors.length; i += concurrency) {
      const batch = vectors.slice(i, i + concurrency);
      const batchPromises = batch.map(async (v, batchIndex): Promise<
        | { success: true; id: string; index: number }
        | { success: false; error: Error; index: number }
      > => {
        const globalIndex = i + batchIndex;
        try {
          const id = await this.store(v.vector, v.metadata);
          return { success: true, id, index: globalIndex };
        } catch (error) {
          return { success: false, error: error as Error, index: globalIndex };
        }
      });

      const results = await Promise.all(batchPromises);

      for (const result of results) {
        if (result.success) {
          success.push(result.id);
        } else {
          failed.push({ index: result.index, error: result.error });
        }
      }
    }

    this.logger.info('Batch store completed', {
      success: success.length,
      failed: failed.length,
      parallelism: concurrency,
    });

    return { success, failed };
  }

  /**
   * Get statistics (with caching)
   */
  getStats(): AgentDBStats & { ruVectorEnabled: boolean; implementation?: string; circuitBreakerState?: string } {
    const now = Date.now();

    // Return cached stats if still valid
    if (this.cachedStats && now - this.statsCacheTime < this.STATS_CACHE_TTL) {
      return this.cachedStats;
    }

    // Compute accurate cache hit rate
    const totalCacheOps = this.cacheHits + this.cacheMisses;
    const cacheHitRate = totalCacheOps > 0 ? this.cacheHits / totalCacheOps : 0;

    // Compute average latency from recent samples
    const avgLatency = this.latencyHistory.length > 0
      ? this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
      : 0;

    const stats = {
      ...this.stats,
      cacheHitRate,
      avgSearchLatency: avgLatency,
      ruVectorEnabled: this.useRuVector,
      implementation: this.useRuVector && this.ruVectorClient
        ? this.ruVectorClient.getImplementationType()
        : 'fallback',
      circuitBreakerState: this.circuitBreaker.state,
    };

    // Cache the computed stats
    this.cachedStats = stats;
    this.statsCacheTime = now;

    return stats;
  }

  /**
   * Check if RuVector is being used for high-performance operations
   * @returns true if RuVector is enabled and initialized
   */
  isUsingRuVector(): boolean {
    return this.useRuVector && this.ruVectorClient !== null;
  }

  /**
   * Get the RuVector implementation type
   * @returns 'native', 'wasm', or 'none' if RuVector is not being used
   */
  getRuVectorImplementation(): 'native' | 'wasm' | 'none' {
    if (this.useRuVector && this.ruVectorClient) {
      return this.ruVectorClient.getImplementationType();
    }
    return 'none';
  }

  /**
   * Execute MCP tool
   */
  async executeMCPTool(toolName: string, params: any): Promise<any> {
    this.ensureInitialized();

    if (!this.config.mcpEnabled) {
      throw new Error('MCP tools are disabled');
    }

    try {
      const result = await this.db.executeTool(toolName, params);
      this.logger.debug('MCP tool executed', { toolName });
      return result;
    } catch (error) {
      this.logger.error('MCP tool execution failed', { toolName, error });
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      this.logger.info('Cleaning up AgentDB client');

      if (this.db) {
        await this.db.close();
      }

      this.cache.clear();
      this.initialized = false;

      this.logger.info('AgentDB client cleaned up');
    } catch (error) {
      this.logger.error('Cleanup failed', { error });
      throw error;
    }
  }

  /**
   * Initialize MCP tools
   */
  private async initializeMCPTools(): Promise<void> {
    this.logger.info('Initializing MCP tools');

    if (this.db && typeof this.db.initializeMCP === 'function') {
      await this.db.initializeMCP({
        frontierMemory: this.config.frontierMemory,
      });
    }
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    setInterval(async () => {
      try {
        if (this.db && typeof this.db.save === 'function') {
          await this.db.save();
          this.logger.debug('Auto-save completed');
        }
      } catch (error) {
        this.logger.error('Auto-save failed', { error });
      }
    }, this.config.storage.autoSaveInterval!);
  }

  /**
   * Ensure client is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('AgentDB client not initialized. Call init() first.');
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get cache key for search (using fast FNV-1a hash)
   */
  private getCacheKey(query: number[], options: SearchOptions): string {
    const vectorHash = this.hashVector(query);
    const optionsHash = this.hashOptions(options);
    return `${vectorHash.toString(16)}_${optionsHash.toString(16)}`;
  }

  /**
   * Hash search options
   */
  private hashOptions(options: SearchOptions): number {
    let hash = 2166136261;
    const str = `${options.k || 10}_${options.minScore || 0}_${options.metric || 'cosine'}`;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /**
   * Invalidate stats cache
   */
  private invalidateStatsCache(): void {
    this.cachedStats = null;
  }

  /**
   * Update search statistics with rolling window
   */
  private updateSearchStats(latency: number): void {
    this.stats.totalSearches++;

    // Use rolling window for latency
    this.latencyHistory.push(latency);
    if (this.latencyHistory.length > this.MAX_LATENCY_SAMPLES) {
      this.latencyHistory.shift();
    }

    this.invalidateStatsCache();
  }

  /**
   * Fallback search using AgentDB or in-memory storage
   */
  private async fallbackSearch(
    query: number[],
    k: number,
    minScore: number,
    filter: Record<string, any>,
    includeVectors: boolean,
    metric: string
  ): Promise<SearchResult[]> {
    const results = await retry(
      async () => {
        return await this.db.search(query, {
          k,
          metric,
          filter: Object.keys(filter).length > 0 ? filter : undefined,
        });
      },
      {
        retries: 3,
        minTimeout: 100,
        maxTimeout: 1000,
      }
    );

    return results
      .map((r: any) => ({
        id: r.id,
        score: r.score,
        distance: r.distance,
        data: {
          id: r.id,
          vector: includeVectors ? r.vector : [],
          metadata: r.metadata || {},
          createdAt: r.createdAt || new Date(),
          updatedAt: r.updatedAt || new Date(),
        },
      }))
      .filter((r: SearchResult) => r.score >= minScore);
  }

  /**
   * Create fallback in-memory database
   */
  private createFallbackDB(): any {
    const storage = new Map<string, { vector: number[]; metadata: any }>();

    return {
      init: async () => {},
      insert: async (id: string, vector: number[], metadata: any) => {
        storage.set(id, { vector, metadata });
      },
      search: async (query: number[], options: any) => {
        // Simple cosine similarity search
        const results: any[] = [];
        for (const [id, data] of storage.entries()) {
          const similarity = this.cosineSimilarity(query, data.vector);
          results.push({
            id,
            score: similarity,
            distance: 1 - similarity,
            vector: data.vector,
            metadata: data.metadata,
          });
        }
        return results
          .sort((a, b) => b.score - a.score)
          .slice(0, options.k || 10);
      },
      update: async (id: string, vector: number[], metadata: any) => {
        if (storage.has(id)) {
          storage.set(id, { vector, metadata });
        }
      },
      updateMetadata: async (id: string, metadata: any) => {
        const existing = storage.get(id);
        if (existing) {
          storage.set(id, { ...existing, metadata });
        }
      },
      delete: async (id: string) => {
        storage.delete(id);
      },
      close: async () => {
        storage.clear();
      },
    };
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
