/**
 * AgentDBClient — vector store contract.
 *
 * Exercises the public API against whatever backend the runtime provides
 * (real `agentdb` EmbeddingService when its native deps load, pure-JS vector
 * store otherwise) — the assertions only depend on the cosine-similarity
 * vector path, so they're deterministic in CI.
 */
import { AgentDBClient } from '../../src/memory/agentdb/client';

function client(overrides: Record<string, any> = {}): AgentDBClient {
  return new AgentDBClient({
    vectorDimension: 4,
    storage: { path: '.', inMemory: true },
    performance: { maxConcurrency: 1, cacheSize: 16, batchEnabled: true },
    ...overrides,
  });
}

describe('AgentDBClient', () => {
  describe('lifecycle', () => {
    it('throws when used before init()', async () => {
      const c = client();
      await expect(c.store([1, 0, 0, 0])).rejects.toThrow(/not initialized/i);
      await expect(c.search([1, 0, 0, 0])).rejects.toThrow(/not initialized/i);
    });

    it('initializes and is idempotent', async () => {
      const c = client();
      await c.init();
      await c.init(); // second call is a no-op (warns)
      await c.cleanup();
    });

    it('cleanup() before init() is a no-op', async () => {
      await expect(client().cleanup()).resolves.toBeUndefined();
    });
  });

  describe('store + search', () => {
    let c: AgentDBClient;
    beforeEach(async () => {
      c = client();
      await c.init();
    });
    afterEach(async () => {
      await c.cleanup();
    });

    it('stores vectors and returns the nearest by cosine similarity', async () => {
      const a = await c.store([1, 0, 0, 0], { label: 'a' });
      const b = await c.store([0, 1, 0, 0], { label: 'b' });
      const cc = await c.store([0.95, 0.1, 0, 0], { label: 'c' });

      const results = await c.search([1, 0, 0, 0], { k: 3 });
      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(a);
      expect(results[0].data.metadata).toEqual({ label: 'a' });
      // 'c' is closer to the query than 'b'
      const order = results.map((r) => r.id);
      expect(order.indexOf(cc)).toBeLessThan(order.indexOf(b));
      // scores are descending and the top one is ~1
      expect(results[0].score).toBeGreaterThan(results[1].score - 1e-9);
      expect(results[0].score).toBeGreaterThan(0.99);
    });

    it('honours k and minScore', async () => {
      await c.store([1, 0, 0, 0]);
      await c.store([0, 1, 0, 0]);
      await c.store([0, 0, 1, 0]);
      expect(await c.search([1, 0, 0, 0], { k: 1 })).toHaveLength(1);
      // orthogonal vectors have similarity 0 — filtered out by a positive minScore
      expect(await c.search([1, 0, 0, 0], { k: 5, minScore: 0.5 })).toHaveLength(1);
    });

    it('includes the stored vector only when includeVectors is set', async () => {
      const id = await c.store([1, 0, 0, 0], { tag: 'x' });
      const [hidden] = await c.search([1, 0, 0, 0], { k: 1 });
      expect(hidden.id).toBe(id);
      expect(hidden.data.vector).toEqual([]);
      const [shown] = await c.search([1, 0, 0, 0], { k: 1, includeVectors: true });
      expect(shown.data.vector).toEqual([1, 0, 0, 0]);
    });

    it('rejects vectors of the wrong dimension', async () => {
      await expect(c.store([1, 2, 3])).rejects.toThrow(/dimension mismatch/i);
    });

    it('updates a stored vector', async () => {
      const id = await c.store([1, 0, 0, 0], { v: 1 });
      await c.update(id, { vector: [0, 1, 0, 0], metadata: { v: 2 } });
      const [hit] = await c.search([0, 1, 0, 0], { k: 1, includeVectors: true });
      expect(hit.id).toBe(id);
      expect(hit.data.vector).toEqual([0, 1, 0, 0]);
      expect(hit.data.metadata).toEqual({ v: 2 });
    });

    it('deletes a stored vector', async () => {
      const a = await c.store([1, 0, 0, 0]);
      await c.store([0, 1, 0, 0]);
      expect(c.getStats().totalVectors).toBe(2);
      await c.delete(a);
      expect(c.getStats().totalVectors).toBe(1);
      const results = await c.search([1, 0, 0, 0], { k: 5 });
      expect(results.map((r) => r.id)).not.toContain(a);
    });

    it('batchStore reports per-item success/failure', async () => {
      const res = await c.batchStore([
        { vector: [1, 0, 0, 0], metadata: { i: 0 } },
        { vector: [0, 1], metadata: { i: 1 } }, // wrong dim → fails
        { vector: [0, 0, 1, 0], metadata: { i: 2 } },
      ]);
      expect(res.success).toHaveLength(2);
      expect(res.failed).toHaveLength(1);
      expect(res.failed[0].index).toBe(1);
    });

    it('tracks search stats', async () => {
      await c.store([1, 0, 0, 0]);
      await c.search([1, 0, 0, 0]);
      const a = c.getStats();
      expect(a.totalSearches).toBe(1);
      // a repeat query is served from cache
      await c.search([1, 0, 0, 0]);
      const b = c.getStats();
      expect(b.totalSearches).toBe(2);
      expect(b.cacheHitRate).toBeGreaterThan(0);
    });
  });

  describe('text embedding', () => {
    it('embed()/storeText() either work (real agentdb embeddings) or fail with a clear error', async () => {
      const c = client();
      await c.init();
      try {
        const v = await c.embed('hello world');
        expect(Array.isArray(v)).toBe(true);
        expect(v.length).toBeGreaterThan(0);
        expect(c.embeddingService).not.toBeNull();
      } catch (err) {
        expect((err as Error).message).toMatch(/EmbeddingService not available/i);
        expect(c.embeddingService).toBeNull();
      }
      await c.cleanup();
    });
  });
});
