/**
 * Vector backends for AgentDBClient.
 *
 *  - {@link createAgentDBBackend}: agentdb 3.x RVF store (`agentdb/backends`,
 *    `createBackend('rvf', …)`), loaded lazily. In-memory stores live in a
 *    private temp directory that `closeAsync()` removes; a path gives a durable
 *    single-file store that survives reopen. Filters run natively.
 *  - {@link createMemoryBackend}: pure-JS cosine scan used when agentdb is not
 *    installed or cannot load (e.g. Node < 20.9). Honours the same filters.
 */

import { mkdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { topK } from '../../utils/top-k';
import { FilterExpr, matchesFilter } from './filter';

export interface BackendHit {
  id: string;
  score: number;
  distance: number;
  vector?: number[];
  metadata?: Record<string, any>;
}

/** Minimal vector backend contract used by AgentDBClient. */
export interface VectorBackend {
  readonly kind: 'agentdb-rvf' | 'memory';
  insert(id: string, vector: number[], metadata: Record<string, any>): Promise<void>;
  search(query: number[], k: number, filter: FilterExpr | null): Promise<BackendHit[]>;
  remove(id: string): Promise<void>;
  update(id: string, vector: number[], metadata: Record<string, any>): Promise<void>;
  size(): number;
  /** Underlying agentdb backend instance when active. */
  readonly native?: unknown;
  close(): Promise<void>;
}

/**
 * Native `import()` that tsc's CommonJS output does not rewrite to `require()`
 * (agentdb 3.x is ESM-only, so `require` fails on Node < 22).
 */
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const nativeImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>;

/** Lazily import an optional ESM package; resolves to `null` when unavailable. */
export async function importOptional(specifier: string): Promise<any | null> {
  try {
    return await nativeImport(specifier);
  } catch {
    return null;
  }
}

/** RaBitQ-style 1-bit-per-dimension sign code (bit i = vector[i] >= 0). */
export function packBits(vector: number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(vector.length / 8));
  for (let i = 0; i < vector.length; i++) {
    if (vector[i] >= 0) out[i >> 3] |= 1 << (i & 7);
  }
  return out;
}

/** Hamming distance between two equal-length packed bit codes. */
export function hamming(a: Uint8Array, b: Uint8Array): number {
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

export function cosineSimilarity(a: number[], b: number[]): number {
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

/** Pure-JS exact cosine backend. Filters are applied before top-k selection. */
export function createMemoryBackend(): VectorBackend {
  const store = new Map<string, { vector: number[]; metadata: Record<string, any> }>();
  return {
    kind: 'memory',
    insert: async (id, vector, metadata) => {
      store.set(id, { vector, metadata });
    },
    search: async (query, k, filter) => {
      function* candidates() {
        for (const [id, d] of store.entries()) {
          if (!matchesFilter(filter, d.metadata)) continue;
          const score = cosineSimilarity(query, d.vector);
          yield { id, score, distance: 1 - score, vector: d.vector, metadata: d.metadata };
        }
      }
      return topK(candidates(), k, (a, b) => b.score - a.score);
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

/**
 * Resolve a user storage path to an `.rvf` file: a path ending in `.rvf` is
 * used as the file, anything else is treated as a directory holding
 * `vectors.rvf`. Paths are resolved to absolute form (no `..` survives).
 */
export function resolveStorePath(path: string): string {
  if (typeof path !== 'string' || path.length === 0 || path.includes('\0')) {
    throw new Error('Invalid AgentDB storage path');
  }
  const abs = resolve(path);
  const file = abs.endsWith('.rvf') ? abs : join(abs, 'vectors.rvf');
  mkdirSync(dirname(file), { recursive: true });
  return file;
}

/**
 * Open an agentdb 3.x RVF vector store. Resolves to `null` when agentdb (or
 * its RVF runtime) is not available, so callers can fall back. When a path is
 * given and agentdb loads but the store cannot be opened, the error is thrown.
 */
export async function createAgentDBBackend(opts: {
  dimension: number;
  path?: string;
}): Promise<VectorBackend | null> {
  const mod = await importOptional('agentdb/backends');
  if (!mod || typeof mod.createBackend !== 'function') return null;
  const config: Record<string, unknown> = { dimension: opts.dimension, metric: 'cosine' };
  if (opts.path) config.storagePath = resolveStorePath(opts.path);
  let db: any;
  try {
    db = await mod.createBackend('rvf', config);
  } catch (err) {
    // No path: nothing to lose, fall back. With a path, an open failure (lock
    // held, bad path, corrupt file) must surface rather than silently drop
    // persistence.
    if (opts.path) throw err;
    return null;
  }
  if (typeof db?.searchAsync !== 'function' || typeof db?.insertAsync !== 'function') {
    db?.close?.();
    return null;
  }
  let count = 0;
  try {
    count = (await db.getStatsAsync()).count ?? 0;
  } catch {
    count = 0;
  }
  const toF32 = (v: number[]) => Float32Array.from(v);
  return {
    kind: 'agentdb-rvf',
    native: db,
    insert: async (id, vector, metadata) => {
      await db.insertAsync(id, toF32(vector), metadata);
      count++;
    },
    search: async (query, k, filter) => {
      const hits = await db.searchAsync(toF32(query), k, filter ? { filter } : undefined);
      return hits.map((h: any) => ({
        id: h.id,
        score: h.similarity,
        distance: h.distance,
        // rvf returns null-prototype objects; hand callers plain ones.
        metadata: h.metadata ? { ...h.metadata } : undefined,
      }));
    },
    remove: async (id) => {
      if (await db.removeAsync(id)) count = Math.max(0, count - 1);
    },
    // RVF ingest is an upsert by id.
    update: async (id, vector, metadata) => {
      await db.insertAsync(id, toF32(vector), metadata);
    },
    size: () => count,
    close: async () => {
      await db.closeAsync();
    },
  };
}

/** Errors a retry cannot fix (bad input, rvf metadata type conflict, limits). */
export function isPermanentError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown; name?: unknown };
  if (e?.code === 0xff09 || e?.name === 'RvfMetadataTypeConflictError') return true;
  const msg = typeof e?.message === 'string' ? e.message : '';
  return /type conflict|exceeds maximum|dimension|must not|must be|invalid/i.test(msg);
}
