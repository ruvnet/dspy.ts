/**
 * AgentDB Client
 *
 * Vector store for DSPy.ts. When the optional `agentdb` (>= 3.7) package
 * loads, vectors live in an agentdb RVF store: native HNSW search, native
 * metadata filters, and a durable single file when `storage.path` is given.
 * Otherwise a pure-JS in-memory backend with the same filter semantics is used,
 * so `import 'dspy.ts'` works without native deps. Text embeddings use
 * agentdb's `EmbeddingService` and are loaded on first `embed()`.
 */

import { randomBytes } from 'crypto';
import pino from 'pino';
import retry from 'async-retry';
import { AgentDBConfig, mergeConfig } from './config';
import {
  VectorData,
  SearchResult,
  SearchOptions,
  BatchResult,
  AgentDBStats,
} from './types';
import { toFilterExpr, matchesFilter, FilterExpr } from './filter';
import {
  VectorBackend,
  createAgentDBBackend,
  createMemoryBackend,
  importOptional,
  isPermanentError,
  cosineSimilarity,
  packBits,
  hamming,
} from './backends';

/** Default local embedding model (registered with agentdb's EmbeddingService). */
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIMENSION = 384;

/**
 * Hierarchical memory tiers. `working` is small/ephemeral scratch space,
 * `short` is recent context, `long` is the durable searchable store.
 */
export type MemoryTier = 'working' | 'short' | 'long';

export class AgentDBClient {
  private config: AgentDBConfig;
  private logger: pino.Logger;
  private initialized = false;
  private backend: VectorBackend | null = null;
  /** `agentdb.EmbeddingService` instance once loaded — text → vector. */
  private embedder: any = null;
  private embedderLoad: Promise<any> | null = null;
  /** Only an explicitly configured path is persisted (never the default). */
  private readonly persistPath: string | undefined;
  private cache = new Map<string, SearchResult[]>();
  private metaStore = new Map<string, VectorData>();
  /** Packed 1-bit codes per id (only populated when quantization === 'rabitq'). */
  private bitStore = new Map<string, Uint8Array>();
  /** Hierarchical tier per id (default 'long'). */
  private itemTier = new Map<string, MemoryTier>();
  private stats: AgentDBStats = {
    totalVectors: 0,
    indexSize: 0,
    memoryUsage: 0,
    totalSearches: 0,
    avgSearchLatency: 0,
    cacheHitRate: 0,
  };
  private cacheHits = 0;

  constructor(config?: Partial<AgentDBConfig>) {
    this.config = mergeConfig(config || {});
    const storage = config?.storage;
    this.persistPath = storage?.path && storage.inMemory !== true ? storage.path : undefined;
    this.logger = pino({ level: process.env.LOG_LEVEL || 'info', name: 'agentdb-client' });
  }

  /** True when the agentdb RVF vector store is in use (vs. the JS fallback). */
  get isNative(): boolean {
    return this.backend?.kind === 'agentdb-rvf';
  }

  /** Active vector backend: `'agentdb-rvf'`, `'memory'`, or null before init(). */
  get backendKind(): VectorBackend['kind'] | null {
    return this.backend?.kind ?? null;
  }

  /** True when a durable store path is configured and the agentdb backend is active. */
  get isPersistent(): boolean {
    return this.isNative && !!this.persistPath;
  }

  /** The `agentdb.EmbeddingService` (null until the first successful `embed()`). */
  get embeddingService(): any {
    return this.embedder;
  }

  /** The native agentdb vector backend when active (so other layers can share it). */
  get vectorIndex(): unknown {
    return this.backend?.native ?? null;
  }

  /** The configured vector dimension. */
  get vectorDimension(): number {
    return this.config.vectorDimension;
  }

  /** Deterministic hash embedding of `text`, fitted to this client's dimension —
   *  useful for keying records (e.g. optimizer experience replay) without needing
   *  a real embedding model. */
  hashEmbed(text: string): number[] {
    const d = this.config.vectorDimension;
    const v = new Array(d).fill(0);
    for (let i = 0; i < text.length; i++) v[i % d] += text.charCodeAt(i) / 1000;
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / mag);
  }

  async init(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('AgentDB client already initialized');
      return;
    }

    const mode = this.config.storage.backend ?? 'auto';
    let backend: VectorBackend | null = null;
    if (mode !== 'memory') {
      backend = await createAgentDBBackend({
        dimension: this.config.vectorDimension,
        path: this.persistPath,
      });
      if (!backend && mode === 'agentdb') {
        throw new Error(
          'agentdb vector backend unavailable — install agentdb@^3.7.2 (Node >= 20.9) or use storage.backend "memory"'
        );
      }
      if (!backend && this.persistPath) {
        this.logger.warn(
          { path: this.persistPath },
          'agentdb unavailable — falling back to the in-memory store; vectors will NOT be persisted'
        );
      }
    }
    this.backend = backend ?? createMemoryBackend();
    this.stats.totalVectors = this.backend.size();

    this.initialized = true;
    this.logger.debug(
      {
        backend: this.backend.kind,
        persistent: this.isPersistent,
        vectorDimension: this.config.vectorDimension,
      },
      'AgentDB client initialized'
    );
  }

  /**
   * Load agentdb's EmbeddingService once. Only a real transformers.js pipeline
   * counts: agentdb silently substitutes hash "mock" embeddings when the model
   * cannot load, and those are not semantic.
   */
  private async loadEmbedder(): Promise<any> {
    if (this.embedder) return this.embedder;
    if (!this.embedderLoad) {
      this.embedderLoad = (async () => {
        const agentdb = await importOptional('agentdb');
        const Embed = agentdb?.EnhancedEmbeddingService || agentdb?.EmbeddingService;
        if (typeof Embed !== 'function') return null;
        try {
          const e = new Embed({
            model: EMBEDDING_MODEL,
            dimension: EMBEDDING_DIMENSION,
            provider: 'transformers',
          });
          if (typeof e.initialize === 'function') await e.initialize();
          const active = typeof e.getRuntimeInfo === 'function' ? e.getRuntimeInfo()?.active : undefined;
          if (active !== 'transformers') return null;
          return e;
        } catch (error) {
          this.logger.warn({ error }, 'agentdb EmbeddingService unavailable — text embedding disabled');
          return null;
        }
      })();
    }
    this.embedder = await this.embedderLoad;
    return this.embedder;
  }

  /** Run a backend call with retries, failing fast on errors a retry cannot fix. */
  private withRetry<T>(fn: () => Promise<T>): Promise<T> {
    return retry(
      async (bail) => {
        try {
          return await fn();
        } catch (err) {
          if (isPermanentError(err)) {
            bail(err as Error);
            return undefined as never;
          }
          throw err;
        }
      },
      { retries: 3, minTimeout: 100, maxTimeout: 1000 }
    );
  }

  async store(
    vector: number[],
    metadata: Record<string, any> = {},
    opts: { tier?: MemoryTier } = {}
  ): Promise<string> {
    this.ensureInitialized();
    if (vector.length !== this.config.vectorDimension) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.config.vectorDimension}, got ${vector.length}`
      );
    }
    const id = this.generateId();
    const now = new Date();
    await this.withRetry(() => this.backend!.insert(id, vector, metadata));
    this.metaStore.set(id, { id, vector, metadata, createdAt: now, updatedAt: now });
    this.itemTier.set(id, opts.tier ?? 'long');
    if (this.config.performance.quantization === 'rabitq') this.bitStore.set(id, packBits(vector));
    this.stats.totalVectors = this.backend!.size();
    this.invalidateCache();
    return id;
  }

  /** Embed `text` with the AgentDB EmbeddingService and store it. */
  async storeText(text: string, metadata: Record<string, any> = {}): Promise<string> {
    this.ensureInitialized();
    const vector = await this.embed(text);
    return this.store(vector, { ...metadata, text });
  }

  /**
   * Embed text → vector via the AgentDB EmbeddingService, fitted to this
   * client's `vectorDimension` (zero-padded if the model is smaller, truncated
   * if larger) so the result is always safe to pass to `store`/`search`.
   * Throws if no embedding service is available.
   */
  async embed(text: string): Promise<number[]> {
    const embedder = await this.loadEmbedder();
    if (!embedder || typeof embedder.embed !== 'function') {
      throw new Error(
        'EmbeddingService not available — pass vectors directly or run in an environment with agentdb embeddings.'
      );
    }
    const raw = await embedder.embed(text);
    const v = Array.isArray(raw) ? raw : Array.from(raw as ArrayLike<number>);
    return this.fitToDimension(v);
  }

  /** Zero-pad or truncate a vector to this client's configured dimension. */
  private fitToDimension(v: number[]): number[] {
    const d = this.config.vectorDimension;
    if (v.length === d) return v;
    if (v.length > d) return v.slice(0, d);
    return [...v, ...new Array(d - v.length).fill(0)];
  }

  async search(query: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    this.ensureInitialized();
    const { k = 10, minScore = 0.0, filter, includeVectors = false } = options;
    // Normalise (and validate) up front: an unsupported filter throws instead
    // of silently returning unfiltered results.
    const expr = toFilterExpr(filter);

    const cacheKey = JSON.stringify({ query, options });
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.stats.totalSearches++;
      this.cacheHits++;
      this.recomputeCacheHitRate();
      return cached;
    }

    const startTime = performance.now();
    const useRabitq = this.config.performance.quantization === 'rabitq' && this.bitStore.size > 0;
    const raw = useRabitq
      ? this.coarseThenRerank(query, k, expr)
      : await this.withRetry(() => this.backend!.search(query, k, expr));

    const results: SearchResult[] = raw
      .map((r) => {
        const meta = this.metaStore.get(r.id);
        return {
          id: r.id,
          score: r.score,
          distance: r.distance,
          data: {
            id: r.id,
            vector: includeVectors ? r.vector ?? meta?.vector ?? [] : [],
            metadata: r.metadata ?? meta?.metadata ?? {},
            createdAt: meta?.createdAt ?? new Date(),
            updatedAt: meta?.updatedAt ?? new Date(),
          },
        };
      })
      .filter((r) => r.score >= minScore);

    this.updateSearchStats(performance.now() - startTime);
    if (this.cache.size < this.config.performance.cacheSize) this.cache.set(cacheKey, results);
    this.recomputeCacheHitRate();
    return results;
  }

  /** Embed `query` text and search. */
  async searchText(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    return this.search(await this.embed(query), options);
  }

  /** RaBitQ coarse pass (Hamming) → cosine re-rank of the top `rerankFactor × k`. */
  private coarseThenRerank(query: number[], k: number, filter: FilterExpr | null) {
    const qBits = packBits(query);
    const rerankFactor = this.config.performance.rerankFactor ?? 3;
    const coarse: Array<{ id: string; h: number }> = [];
    for (const [id, b] of this.bitStore.entries()) {
      if (filter && !matchesFilter(filter, this.metaStore.get(id)?.metadata)) continue;
      coarse.push({ id, h: hamming(qBits, b) });
    }
    coarse.sort((a, b) => a.h - b.h);
    return coarse
      .slice(0, Math.max(k * rerankFactor, k))
      .map(({ id }) => {
        const meta = this.metaStore.get(id);
        const score = meta ? AgentDBClient.cosineSimilarity(query, meta.vector) : 0;
        return { id, score, distance: 1 - score, vector: meta?.vector, metadata: meta?.metadata };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /** Search only the given hierarchical tiers (cosine over the tier-filtered subset). */
  async searchTiered(
    query: number[],
    options: { tiers: MemoryTier[]; k?: number; minScore?: number; includeVectors?: boolean }
  ): Promise<SearchResult[]> {
    this.ensureInitialized();
    const { tiers, k = 10, minScore = 0, includeVectors = false } = options;
    const allow = new Set(tiers);
    const start = performance.now();
    const scored: SearchResult[] = [];
    for (const [id, meta] of this.metaStore.entries()) {
      if (!allow.has(this.itemTier.get(id) ?? 'long')) continue;
      const score = AgentDBClient.cosineSimilarity(query, meta.vector);
      if (score < minScore) continue;
      scored.push({
        id,
        score,
        distance: 1 - score,
        data: {
          id,
          vector: includeVectors ? meta.vector : [],
          metadata: meta.metadata,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt,
        },
      });
    }
    scored.sort((a, b) => b.score - a.score);
    this.updateSearchStats(performance.now() - start);
    this.recomputeCacheHitRate();
    return scored.slice(0, k);
  }

  /** Move an item to a different hierarchical tier. */
  promote(id: string, tier: MemoryTier): void {
    if (this.metaStore.has(id)) this.itemTier.set(id, tier);
  }

  /** Evict items from a tier — by age (`maxAgeMs`) and/or by count cap (`max`, oldest first). Returns the number evicted. */
  async evictTier(tier: MemoryTier, opts: { maxAgeMs?: number; max?: number } = {}): Promise<number> {
    this.ensureInitialized();
    const now = Date.now();
    const inTier = [...this.metaStore.values()].filter((m) => (this.itemTier.get(m.id) ?? 'long') === tier);
    const toEvict = new Set<string>();
    if (typeof opts.maxAgeMs === 'number') {
      for (const m of inTier) if (now - m.createdAt.getTime() > opts.maxAgeMs) toEvict.add(m.id);
    }
    if (typeof opts.max === 'number' && inTier.length - toEvict.size > opts.max) {
      const survivors = inTier
        .filter((m) => !toEvict.has(m.id))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      for (let i = 0; i < survivors.length - opts.max; i++) toEvict.add(survivors[i].id);
    }
    for (const id of toEvict) await this.delete(id);
    return toEvict.size;
  }

  /** Per-tier item counts. */
  tierCounts(): Record<MemoryTier, number> {
    const c: Record<MemoryTier, number> = { working: 0, short: 0, long: 0 };
    for (const t of this.itemTier.values()) c[t]++;
    return c;
  }

  /** Quantization mode + the float32 → 1-bit-code compression ratio. */
  quantizationInfo(): { mode: 'none' | 'rabitq'; codes: number; compressionRatio: number } {
    const mode = this.config.performance.quantization ?? 'none';
    const ratio = (this.config.vectorDimension * 4) / Math.max(1, Math.ceil(this.config.vectorDimension / 8));
    return { mode, codes: this.bitStore.size, compressionRatio: ratio };
  }

  async update(id: string, data: Partial<Pick<VectorData, 'vector' | 'metadata'>>): Promise<void> {
    this.ensureInitialized();
    const existing = this.metaStore.get(id);
    const vector = data.vector ?? existing?.vector;
    const metadata = data.metadata ?? existing?.metadata ?? {};
    if (!vector) throw new Error(`Cannot update ${id}: unknown vector`);
    await this.withRetry(() => this.backend!.update(id, vector, metadata));
    this.metaStore.set(id, {
      id,
      vector,
      metadata,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    });
    if (this.config.performance.quantization === 'rabitq') this.bitStore.set(id, packBits(vector));
    this.invalidateCache();
  }

  async delete(id: string): Promise<void> {
    this.ensureInitialized();
    await this.withRetry(() => this.backend!.remove(id));
    this.metaStore.delete(id);
    this.bitStore.delete(id);
    this.itemTier.delete(id);
    this.stats.totalVectors = this.backend!.size();
    this.invalidateCache();
  }

  async batchStore(
    vectors: Array<{ vector: number[]; metadata?: Record<string, any> }>
  ): Promise<BatchResult<string>> {
    this.ensureInitialized();
    if (!this.config.performance.batchEnabled) throw new Error('Batch operations are disabled');
    const success: string[] = [];
    const failed: Array<{ index: number; error: Error }> = [];
    for (let i = 0; i < vectors.length; i++) {
      try {
        success.push(await this.store(vectors[i].vector, vectors[i].metadata));
      } catch (error) {
        failed.push({ index: i, error: error as Error });
      }
    }
    return { success, failed };
  }

  getStats(): AgentDBStats {
    return { ...this.stats };
  }

  async cleanup(): Promise<void> {
    if (!this.initialized) return;
    try {
      // agentdb RVF: closeAsync() flushes, releases the writer lock and removes
      // the private temp dir of an in-memory store.
      await this.backend?.close();
    } catch (error) {
      this.logger.warn({ error }, 'cleanup close failed');
    }
    this.cache.clear();
    this.metaStore.clear();
    this.bitStore.clear();
    this.itemTier.clear();
    this.backend = null;
    this.initialized = false;
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.backend)
      throw new Error('AgentDB client not initialized. Call init() first.');
  }

  private generateId(): string {
    return `${Date.now()}-${randomBytes(5).toString('hex')}`;
  }

  private invalidateCache(): void {
    this.cache.clear();
  }

  private updateSearchStats(latency: number): void {
    this.stats.totalSearches++;
    this.stats.avgSearchLatency =
      (this.stats.avgSearchLatency * (this.stats.totalSearches - 1) + latency) /
      this.stats.totalSearches;
  }

  private recomputeCacheHitRate(): void {
    this.stats.cacheHitRate =
      this.stats.totalSearches > 0 ? this.cacheHits / this.stats.totalSearches : 0;
  }

  static cosineSimilarity(a: number[], b: number[]): number {
    return cosineSimilarity(a, b);
  }
}

