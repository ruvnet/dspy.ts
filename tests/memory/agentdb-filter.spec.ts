/**
 * Metadata filters on AgentDBClient's in-memory fallback.
 *
 * Inside jest agentdb 3.x (ESM-only) cannot be imported, so `'auto'` falls back
 * to the pure-JS store — exactly the path these tests cover.
 */
import { AgentDBClient } from '../../src/memory/agentdb/client';
import { toFilterExpr, matchesFilter } from '../../src/memory/agentdb/filter';

const q = [1, 0, 0, 0];
const docs = [
  { v: [1, 0, 0, 0], m: { kind: 'x', n: 1, tag: 'a' } },
  { v: [0.9, 0.1, 0, 0], m: { kind: 'y', n: 2, tag: 'b' } },
  { v: [0.8, 0.2, 0, 0], m: { kind: 'x', n: 3 } },
  { v: [0.7, 0.3, 0, 0], m: { kind: 'y', n: 4, flag: true } },
];

async function seeded(overrides: Record<string, any> = {}): Promise<AgentDBClient> {
  const c = new AgentDBClient({
    vectorDimension: 4,
    storage: { path: '', inMemory: true },
    performance: { maxConcurrency: 1, cacheSize: 16, batchEnabled: true },
    ...overrides,
  });
  await c.init();
  for (const d of docs) await c.store(d.v, d.m);
  return c;
}

const ns = (rs: Array<{ data: { metadata: Record<string, any> } }>) => rs.map((r) => r.data.metadata.n);

describe('AgentDBClient filtered search (in-memory fallback)', () => {
  it('falls back to the in-memory backend when agentdb cannot load', async () => {
    const c = await seeded();
    expect(c.backendKind).toBe('memory');
    expect(c.isNative).toBe(false);
    expect(c.isPersistent).toBe(false);
    await c.cleanup();
  });

  it('regression: filter was ignored and all items came back', async () => {
    // Before this fix `search(q, { filter })` passed the filter to a backend
    // that never read it, so this returned [1, 2, 3, 4].
    const c = await seeded();
    expect(ns(await c.search(q, { filter: { kind: 'x' } }))).toEqual([1, 3]);
    expect(await c.search(q, { filter: { kind: 'nope' } })).toEqual([]);
    await c.cleanup();
  });

  it('applies the filter before top-k', async () => {
    const c = await seeded();
    expect(ns(await c.search(q, { k: 1, filter: { kind: 'y' } }))).toEqual([2]);
    await c.cleanup();
  });

  it('supports the predicate DSL and raw agentdb expressions', async () => {
    const c = await seeded();
    expect(ns(await c.search(q, { filter: { n: { $gt: 2 } } }))).toEqual([3, 4]);
    expect(ns(await c.search(q, { filter: { n: { $range: [2, 3] } } }))).toEqual([2, 3]);
    expect(ns(await c.search(q, { filter: { tag: { $in: ['a', 'b'] } } }))).toEqual([1, 2]);
    expect(ns(await c.search(q, { filter: { kind: 'y', flag: true } }))).toEqual([4]);
    expect(ns(await c.search(q, { filter: { op: 'eq', field: 'kind', value: 'y' } }))).toEqual([2, 4]);
    expect(
      ns(
        await c.search(q, {
          filter: { op: 'or', exprs: [{ op: 'eq', field: 'tag', value: 'a' }, { op: 'ge', field: 'n', value: 4 }] },
        })
      )
    ).toEqual([1, 4]);
    // missing field: ne / not match, like rvf
    expect(ns(await c.search(q, { filter: { tag: { $ne: 'a' } } }))).toEqual([2, 3, 4]);
    expect(ns(await c.search(q, { filter: { op: 'not', expr: { op: 'eq', field: 'tag', value: 'a' } } }))).toEqual([
      2, 3, 4,
    ]);
    await c.cleanup();
  });

  it('honours filters on the rabitq quantized path', async () => {
    const c = await seeded({
      performance: { maxConcurrency: 1, cacheSize: 16, batchEnabled: true, quantization: 'rabitq' },
    });
    expect(ns(await c.search(q, { filter: { kind: 'y' } }))).toEqual([2, 4]);
    await c.cleanup();
  });

  it('rejects unsupported filters instead of silently widening them', async () => {
    const c = await seeded();
    await expect(c.search(q, { filter: { kind: { nested: 1 } } as any })).rejects.toThrow(/filter/i);
    await expect(c.search(q, { filter: { kind: ['x'] } as any })).rejects.toThrow(/filter/i);
    await expect(c.search(q, { filter: { op: 'bogus' } as any })).rejects.toThrow(/filter op/i);
    await c.cleanup();
  });

  it("storage.backend 'agentdb' fails clearly when agentdb is unavailable", async () => {
    const c = new AgentDBClient({ vectorDimension: 4, storage: { path: '', inMemory: true, backend: 'agentdb' } });
    await expect(c.init()).rejects.toThrow(/agentdb vector backend unavailable/);
  });
});

describe('filter helpers', () => {
  it('toFilterExpr emits name-based agentdb expressions', () => {
    expect(toFilterExpr({ kind: 'x' })).toEqual({ op: 'eq', field: 'kind', value: 'x' });
    expect(toFilterExpr({ kind: 'x', n: { $lt: 3 } })).toEqual({
      op: 'and',
      exprs: [
        { op: 'eq', field: 'kind', value: 'x' },
        { op: 'lt', field: 'n', value: 3 },
      ],
    });
    expect(toFilterExpr({})).toBeNull();
    expect(toFilterExpr(undefined)).toBeNull();
    expect(() => toFilterExpr({ __proto__: 'x' } as any)).not.toThrow(); // literal __proto__ sets the prototype, not a key
    expect(() => toFilterExpr({ op: 'eq', field: 'constructor', value: 1 })).toThrow(/Forbidden/);
  });

  it('matchesFilter never matches across types', () => {
    expect(matchesFilter({ op: 'eq', field: 'n', value: 1 }, { n: '1' })).toBe(false);
    expect(matchesFilter({ op: 'range', field: 'n', low: 1, high: 3 }, { n: 3 })).toBe(false); // half-open
    expect(matchesFilter(null, {})).toBe(true);
  });
});
