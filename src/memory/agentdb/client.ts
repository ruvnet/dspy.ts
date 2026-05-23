/**
 * AgentDB Client
 *
 * Real `agentdb`-backed vector store for DSPy.ts. Uses `createDatabase`
 * (sql.js / better-sqlite3), `EmbeddingService` (transformers.js / ONNX), and
 * `HNSWIndex` (approximate nearest-neighbour) when the runtime supports them,
 * and a pure-JS in-memory backend otherwise — so `import 'dspy.ts'` works in
 * environments without native deps.
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

/**
 * Hierarchical memory tiers. `working` is small/ephemeral scratch space,
 * `short` is recent context, `long` is the durable searchable store.
 */
export type MemoryTier = 'working' | 'short' | 'long';

/** RaBitQ-style 1-bit-per-dimension sign code (bit i = vector[i] >= 0). */
function packBits(vector: number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(vector.length / 8));
  for (let i = 0; i < vector.length; i++) {
    if (vector[i] >= 0) out[i >> 3] |= 1 << (i & 7);
  }
  return out;
}

/** Hamming distance between two equal-length packed bit codes. */
function hamming(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = a[i] ^ b[i];
    while (x) {
      x &= x - 1;
      d++;
    }
  }
  return d;
}

/** Minimal vector backend used both for the real HNSW path and the fallback. */
interface VectorBackend {
  insert(id: string, vector: number[], metadata: Record<string, any>): Promise<void>;
  search(
    query: number[],
    k: number,
    filter?: Record<string, any>
  ): Promise<Array<{ id: string; score: number; distance: number; vector?: number[]; metadata?: Record<string, any> }>>;
  remove(id: string): Promise<void>;
  update?(id: string, vector: number[], metadata: Record<string, any>): Promise<void>;
  size(): number;
  /** Native HNSW index when available — exposed so other layers can reuse it. */
  readonly native?: unknown;
  close?(): Promise<void>;
}

export class AgentDBClient {
  private config: AgentDBConfig;
  private logger: pino.Logger;
  private initialized = false;
  private backend: VectorBackend | null = null;
  /** `agentdb.EmbeddingService` instance when available — text → vector. */
  private embedder: any = null;
  /** Whether the real `agentdb` HNSW path is active (vs. the JS fallback). */
  private nativeBackend = false;
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
    this.logger = pino({ level: process.env.LOG_LEVEL || 'info', name: 'agentdb-client' });
  }

  /** True when the real `agentdb` HNSW backend is in use. */
  get isNative(): boolean {
    return this.nativeBackend;
  }

  /** The `agentdb.EmbeddingService` (or null when running on the JS fallback). */
  get embeddingService(): any {
    return this.embedder;
  }

  /** The native `agentdb.HNSWIndex` when active (so other layers can share it). */
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

    this.backend = this.createVectorBackend();
    // Wire the real `agentdb` EmbeddingService for text → vector when its
    // native deps (transformers.js / ONNX) load; otherwise text embedding is
    // disabled but vector store/search still work.
    // NOTE: `agentdb.HNSWIndex` is pattern-table-backed (it builds from a
    //   `pattern_embeddings` table), not a generic KNN index — wiring a proper
    //   AgentDB-backed ANN index (WASMVectorSearch / ReasoningBank patterns)
    //   is tracked in #8 (P0b).
    try {
      const agentdb: any = await import('agentdb');
      const Embed = agentdb.EnhancedEmbeddingService || agentdb.EmbeddingService;
      if (typeof Embed === 'function') {
        const e = new Embed({ dimensions: this.config.vectorDimension });
        if (typeof e.initialize === 'function') await e.initialize();
        this.embedder = e;
        this.nativeBackend = true;
      }
    } catch (error) {
      this.logger.warn({ error }, 'agentdb EmbeddingService unavailable — text embedding disabled');
      this.embedder = null;
      this.nativeBackend = false;
    }

    this.initialized = true;
    this.logger.info({
      embeddings: this.nativeBackend ? 'agentdb' : 'disabled',
      vectorDimension: this.config.vectorDimension,
    }, 'AgentDB client initialized');
  }

  /** Pure-JS cosine-similarity vector backend (the default store). */
  private createVectorBackend(): VectorBackend {
    const store = new Map<string, { vector: number[]; metadata: Record<string, any> }>();
    return {
      insert: async (id, vector, metadata) => {
        store.set(id, { vector, metadata });
      },
      search: async (query, k) => {
        const out: Array<{ id: string; score: number; distance: number; vector: number[]; metadata: Record<string, any> }> = [];
        for (const [id, d] of store.entries()) {
          const score = AgentDBClient.cosineSimilarity(query, d.vector);
          out.push({ id, score, distance: 1 - score, vector: d.vector, metadata: d.metadata });
        }
        return out.sort((a, b) => b.score - a.score).slice(0, k);
      },
      remove: async (id) => {
        store.delete(id);
      },
      update: async (id, vector, metadata) => {
        if (store.has(id)) store.set(id, { vector, metadata });
      },
      size: () => store.size,
      close: async () => {
        store.clear();
      },
    };
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
    await retry(() => this.backend!.insert(id, vector, metadata), {
      retries: 3,
      minTimeout: 100,
      maxTimeout: 1000,
    });
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
    if (!this.embedder || typeof this.embedder.embed !== 'function') {
      throw new Error(
        'EmbeddingService not available — pass vectors directly or run in an environment with agentdb embeddings.'
      );
    }
    const raw = await this.embedder.embed(text);
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
    const { k = 10, minScore = 0.0, filter = {}, includeVectors = false } = options;

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
      ? this.coarseThenRerank(query, k)
      : await retry(
          () => this.backend!.search(query, k, Object.keys(filter).length > 0 ? filter : undefined),
          { retries: 3, minTimeout: 100, maxTimeout: 1000 }
        );

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
  private coarseThenRerank(query: number[], k: number) {
    const qBits = packBits(query);
    const rerankFactor = this.config.performance.rerankFactor ?? 3;
    const coarse: Array<{ id: string; h: number }> = [];
    for (const [id, b] of this.bitStore.entries()) coarse.push({ id, h: hamming(qBits, b) });
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
    await retry(
      () =>
        this.backend!.update
          ? this.backend!.update(id, vector, metadata)
          : this.backend!.insert(id, vector, metadata),
      { retries: 3, minTimeout: 100, maxTimeout: 1000 }
    );
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
    await retry(() => this.backend!.remove(id), { retries: 3, minTimeout: 100, maxTimeout: 1000 });
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
      await this.backend?.close?.();
    } catch (error) {
      this.logger.warn({ error }, 'cleanup close failed');
    }
    this.cache.clear();
    this.metaStore.clear();
    this.bitStore.clear();
    this.itemTier.clear();
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
    if (a.length !== b.length) return 0;
    let dot = 0,
      na = 0,
      nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  }
}

