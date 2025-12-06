/**
 * EmbeddingService - Shared embedding computation with caching
 *
 * Provides a unified embedding service for all memory components
 * with intelligent caching to avoid redundant computation.
 */

import pino from 'pino';

// ============================================================================
// Types
// ============================================================================

export interface EmbeddingConfig {
  dimension: number;
  cacheSize?: number;
  cacheTtlMs?: number;
  provider?: 'hash' | 'external';
  externalEndpoint?: string;
}

export interface EmbeddingCacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  totalComputeTimeMs: number;
  avgComputeTimeMs: number;
}

interface CacheEntry {
  embedding: number[];
  timestamp: number;
  computeTimeMs: number;
}

// ============================================================================
// EmbeddingService
// ============================================================================

export class EmbeddingService {
  private logger: pino.Logger;
  private config: Required<EmbeddingConfig>;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private totalComputeTime: number = 0;
  private computeCount: number = 0;

  constructor(config: EmbeddingConfig) {
    this.config = {
      dimension: config.dimension,
      cacheSize: config.cacheSize ?? 10000,
      cacheTtlMs: config.cacheTtlMs ?? 3600000, // 1 hour default
      provider: config.provider ?? 'hash',
      externalEndpoint: config.externalEndpoint ?? '',
    };

    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      name: 'embedding-service',
    });
  }

  /**
   * Compute embedding for text with caching
   */
  async computeEmbedding(text: string): Promise<number[]> {
    // Check cache first
    const cacheKey = this.generateCacheKey(text);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.cacheHits++;
      return cached;
    }

    // Compute embedding
    const startTime = Date.now();
    let embedding: number[];

    if (this.config.provider === 'external' && this.config.externalEndpoint) {
      embedding = await this.computeExternalEmbedding(text);
    } else {
      embedding = this.computeHashEmbedding(text);
    }

    const computeTime = Date.now() - startTime;
    this.totalComputeTime += computeTime;
    this.computeCount++;
    this.cacheMisses++;

    // Store in cache
    this.setInCache(cacheKey, embedding, computeTime);

    return embedding;
  }

  /**
   * Batch compute embeddings (with deduplication)
   */
  async computeEmbeddingsBatch(texts: string[]): Promise<Map<string, number[]>> {
    const results = new Map<string, number[]>();
    const uncached: string[] = [];

    // Check cache for all texts
    for (const text of texts) {
      const cacheKey = this.generateCacheKey(text);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        results.set(text, cached);
        this.cacheHits++;
      } else {
        uncached.push(text);
      }
    }

    // Compute uncached embeddings
    for (const text of uncached) {
      const embedding = await this.computeEmbedding(text);
      results.set(text, embedding);
    }

    return results;
  }

  /**
   * Precompute and cache embeddings for known texts
   */
  async warmCache(texts: string[]): Promise<number> {
    let warmed = 0;
    for (const text of texts) {
      const cacheKey = this.generateCacheKey(text);
      if (!this.cache.has(cacheKey)) {
        await this.computeEmbedding(text);
        warmed++;
      }
    }
    return warmed;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): EmbeddingCacheStats {
    const totalOps = this.cacheHits + this.cacheMisses;
    return {
      size: this.cache.size,
      maxSize: this.config.cacheSize,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: totalOps > 0 ? this.cacheHits / totalOps : 0,
      totalComputeTimeMs: this.totalComputeTime,
      avgComputeTimeMs: this.computeCount > 0 ? this.totalComputeTime / this.computeCount : 0,
    };
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('Embedding cache cleared');
  }

  /**
   * Get embedding dimension
   */
  getDimension(): number {
    return this.config.dimension;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Generate cache key using FNV-1a hash
   */
  private generateCacheKey(text: string): string {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  /**
   * Get from cache with TTL check
   */
  private getFromCache(key: string): number[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.embedding;
  }

  /**
   * Set in cache with eviction
   */
  private setInCache(key: string, embedding: number[], computeTime: number): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.config.cacheSize) {
      const keysToDelete: string[] = [];
      const now = Date.now();

      // First try to evict expired entries
      for (const [k, v] of this.cache.entries()) {
        if (now - v.timestamp > this.config.cacheTtlMs) {
          keysToDelete.push(k);
        }
        if (keysToDelete.length >= 100) break; // Limit cleanup batch
      }

      // If not enough expired, evict oldest
      if (keysToDelete.length === 0) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) keysToDelete.push(firstKey);
      }

      for (const k of keysToDelete) {
        this.cache.delete(k);
      }
    }

    this.cache.set(key, {
      embedding,
      timestamp: Date.now(),
      computeTimeMs: computeTime,
    });
  }

  /**
   * Compute embedding using improved hash-based method
   * (Placeholder - should be replaced with real model in production)
   */
  private computeHashEmbedding(text: string): number[] {
    const dimension = this.config.dimension;
    const vector = new Float32Array(dimension);

    // Use multiple hash functions for better distribution
    const seeds = [2166136261, 84696351, 16777619, 3141592653];

    for (let s = 0; s < seeds.length; s++) {
      let hash = seeds[s];
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
        // Distribute across vector dimensions
        const idx = (hash >>> 0) % dimension;
        // Use position-aware contribution
        vector[idx] += (hash % 1000) / 1000 * (1 + i * 0.01);
      }
    }

    // Add n-gram features for better semantic capture
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i <= text.length - n; i++) {
        const ngram = text.slice(i, i + n);
        let hash = 2166136261;
        for (let j = 0; j < ngram.length; j++) {
          hash ^= ngram.charCodeAt(j);
          hash = Math.imul(hash, 16777619);
        }
        const idx = (hash >>> 0) % dimension;
        vector[idx] += 0.5;
      }
    }

    // L2 normalize
    let magnitude = 0;
    for (let i = 0; i < dimension; i++) {
      magnitude += vector[i] * vector[i];
    }
    magnitude = Math.sqrt(magnitude);

    if (magnitude > 0) {
      for (let i = 0; i < dimension; i++) {
        vector[i] /= magnitude;
      }
    }

    return Array.from(vector);
  }

  /**
   * Compute embedding using external service
   */
  private async computeExternalEmbedding(text: string): Promise<number[]> {
    if (!this.config.externalEndpoint) {
      throw new Error('External embedding endpoint not configured');
    }

    try {
      const response = await fetch(this.config.externalEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`Embedding service error: ${response.status}`);
      }

      const data = await response.json();
      return data.embedding;
    } catch (error) {
      this.logger.warn('External embedding failed, falling back to hash', { error });
      return this.computeHashEmbedding(text);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultService: EmbeddingService | null = null;

/**
 * Get or create the default embedding service
 */
export function getEmbeddingService(config?: Partial<EmbeddingConfig>): EmbeddingService {
  if (!defaultService) {
    defaultService = new EmbeddingService({
      dimension: config?.dimension ?? 768,
      ...config,
    });
  }
  return defaultService;
}

/**
 * Reset the default embedding service (for testing)
 */
export function resetEmbeddingService(): void {
  defaultService = null;
}
