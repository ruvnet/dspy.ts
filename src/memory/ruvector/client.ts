/**
 * RuVector Client
 *
 * High-performance vector database client using native Rust or WASM implementation
 */

import pino from 'pino';
import {
  RuVectorEntry,
  RuVectorQuery,
  RuVectorResult,
  RuVectorConfig,
  RuVectorStats,
} from './types';

export class RuVectorClient {
  private logger: pino.Logger;
  private config: RuVectorConfig;
  private db: any;
  private initialized: boolean = false;
  private implementation: 'native' | 'wasm' = 'wasm';
  private cache: Map<string, RuVectorResult[]> = new Map();
  private cacheMaxSize: number = 1000;

  constructor(config: RuVectorConfig) {
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
   * Insert a single vector
   */
  async insert(entry: RuVectorEntry): Promise<void> {
    this.ensureInitialized();

    if (entry.vector.length !== this.config.dimension) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.config.dimension}, got ${entry.vector.length}`
      );
    }

    try {
      this.db.insert({
        id: entry.id,
        vector: entry.vector,
        metadata: entry.metadata || {},
      });
      this.invalidateCache();
      this.logger.debug('Vector inserted', { id: entry.id });
    } catch (error) {
      this.logger.error('Failed to insert vector', { error });
      throw error;
    }
  }

  /**
   * Insert multiple vectors in batch
   */
  async insertBatch(entries: RuVectorEntry[]): Promise<void> {
    this.ensureInitialized();

    try {
      const formattedEntries = entries.map((e) => ({
        id: e.id,
        vector: e.vector,
        metadata: e.metadata || {},
      }));

      this.db.insertBatch(formattedEntries);
      this.invalidateCache();
      this.logger.debug('Batch insert complete', { count: entries.length });
    } catch (error) {
      this.logger.error('Failed to batch insert vectors', { error });
      throw error;
    }
  }

  /**
   * Search for similar vectors
   */
  async search(query: RuVectorQuery): Promise<RuVectorResult[]> {
    this.ensureInitialized();

    const { vector, k = 10, filter, threshold = 0.0 } = query;

    // Check cache
    const cacheKey = this.getCacheKey(vector, k);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

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

      // Cache results
      if (this.cache.size < this.cacheMaxSize) {
        this.cache.set(cacheKey, formattedResults);
      }

      this.logger.debug('Search complete', { resultsCount: formattedResults.length });
      return formattedResults;
    } catch (error) {
      this.logger.error('Search failed', { error });
      throw error;
    }
  }

  /**
   * Get vector by ID
   */
  async get(id: string): Promise<RuVectorEntry | null> {
    this.ensureInitialized();

    try {
      const result = this.db.get(id);
      return result ? {
        id: result.id,
        vector: result.vector,
        metadata: result.metadata,
      } : null;
    } catch (error) {
      this.logger.error('Failed to get vector', { id, error });
      throw error;
    }
  }

  /**
   * Delete vector by ID
   */
  async delete(id: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const result = this.db.delete(id);
      this.invalidateCache();
      this.logger.debug('Vector deleted', { id });
      return result;
    } catch (error) {
      this.logger.error('Failed to delete vector', { id, error });
      throw error;
    }
  }

  /**
   * Update vector metadata
   */
  async updateMetadata(id: string, metadata: Record<string, any>): Promise<void> {
    this.ensureInitialized();

    try {
      this.db.updateMetadata(id, metadata);
      this.invalidateCache();
      this.logger.debug('Metadata updated', { id });
    } catch (error) {
      this.logger.error('Failed to update metadata', { id, error });
      throw error;
    }
  }

  /**
   * Get database statistics
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
   * Build HNSW index
   */
  buildIndex(): void {
    this.ensureInitialized();
    this.db.buildIndex();
    this.logger.info('Index built');
  }

  /**
   * Optimize database
   */
  optimize(): void {
    this.ensureInitialized();
    this.db.optimize();
    this.logger.info('Database optimized');
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
    this.invalidateCache();
    this.logger.info('Database loaded');
  }

  /**
   * Clear all vectors
   */
  clear(): void {
    this.ensureInitialized();
    this.db.clear();
    this.invalidateCache();
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
   * Ensure client is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('RuVector client not initialized. Call init() first.');
    }
  }

  /**
   * Generate cache key
   */
  private getCacheKey(vector: number[], k: number): string {
    return `${vector.slice(0, 10).join(',')}_${k}`;
  }

  /**
   * Invalidate cache
   */
  private invalidateCache(): void {
    this.cache.clear();
  }
}
