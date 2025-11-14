/**
 * AgentDB Client
 *
 * Main client for interacting with AgentDB vector database
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

export class AgentDBClient {
  private config: AgentDBConfig;
  private logger: pino.Logger;
  private initialized: boolean = false;
  private db: any; // AgentDB instance
  private cache: Map<string, SearchResult[]> = new Map();
  private stats: AgentDBStats = {
    totalVectors: 0,
    indexSize: 0,
    memoryUsage: 0,
    totalSearches: 0,
    avgSearchLatency: 0,
    cacheHitRate: 0,
  };

  constructor(config?: Partial<AgentDBConfig>) {
    this.config = mergeConfig(config || {});
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      name: 'agentdb-client',
    });
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
        },
      });

      // Import AgentDB dynamically
      // Note: AgentDB integration is placeholder for now
      // In production, replace with actual AgentDB initialization
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
        this.logger.warn('AgentDB not available, using in-memory fallback', { error });
        this.db = this.createFallbackDB();
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

      this.stats.totalVectors++;
      this.invalidateCache();

      this.logger.debug('Vector stored', { id, metadataKeys: Object.keys(metadata) });
      return id;
    } catch (error) {
      this.logger.error('Failed to store vector', { error });
      throw error;
    }
  }

  /**
   * Search for similar vectors
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

    // Check cache
    const cacheKey = this.getCacheKey(query, options);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.stats.totalSearches++;
      this.updateCacheHitRate(true);
      return cached;
    }

    try {
      const startTime = Date.now();

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

      // Transform results
      const searchResults: SearchResult[] = results
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

      // Update stats
      const latency = Date.now() - startTime;
      this.updateSearchStats(latency);

      // Cache results
      if (this.cache.size < this.config.performance.cacheSize) {
        this.cache.set(cacheKey, searchResults);
      }

      this.updateCacheHitRate(false);
      this.logger.debug('Search completed', {
        resultsCount: searchResults.length,
        latency,
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

      this.invalidateCache();
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
      this.invalidateCache();
      this.logger.debug('Vector deleted', { id });
    } catch (error) {
      this.logger.error('Failed to delete vector', { id, error });
      throw error;
    }
  }

  /**
   * Batch store vectors
   */
  async batchStore(
    vectors: Array<{ vector: number[]; metadata?: Record<string, any> }>
  ): Promise<BatchResult<string>> {
    this.ensureInitialized();

    if (!this.config.performance.batchEnabled) {
      throw new Error('Batch operations are disabled');
    }

    const success: string[] = [];
    const failed: Array<{ index: number; error: Error }> = [];

    for (let i = 0; i < vectors.length; i++) {
      try {
        const id = await this.store(vectors[i].vector, vectors[i].metadata);
        success.push(id);
      } catch (error) {
        failed.push({ index: i, error: error as Error });
      }
    }

    this.logger.info('Batch store completed', {
      success: success.length,
      failed: failed.length,
    });

    return { success, failed };
  }

  /**
   * Get statistics
   */
  getStats(): AgentDBStats {
    return { ...this.stats };
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
   * Get cache key for search
   */
  private getCacheKey(query: number[], options: SearchOptions): string {
    return JSON.stringify({ query, options });
  }

  /**
   * Invalidate cache
   */
  private invalidateCache(): void {
    this.cache.clear();
  }

  /**
   * Update search statistics
   */
  private updateSearchStats(latency: number): void {
    this.stats.totalSearches++;
    this.stats.avgSearchLatency =
      (this.stats.avgSearchLatency * (this.stats.totalSearches - 1) + latency) /
      this.stats.totalSearches;
  }

  /**
   * Update cache hit rate
   */
  private updateCacheHitRate(hit: boolean): void {
    const total = this.stats.totalSearches;
    const currentHits = this.stats.cacheHitRate * (total - 1);
    this.stats.cacheHitRate = (currentHits + (hit ? 1 : 0)) / total;
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
