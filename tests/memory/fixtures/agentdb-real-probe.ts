/**
 * Child-process probe for tests/memory/agentdb-real.spec.ts.
 *
 * Runs outside jest (jest's vm cannot `import()` the ESM-only agentdb 3.x) via
 * `node -r ts-node/register/transpile-only`, exercises AgentDBClient against
 * the real agentdb RVF backend and prints one JSON line of observations.
 */
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { AgentDBClient } from '../../../src/memory/agentdb/client';

async function main(): Promise<void> {
  const dir = process.argv[2];
  const out: Record<string, unknown> = {};
  const agentdbVersion = require('agentdb/package.json').version;
  out.agentdbVersion = agentdbVersion;

  const docs = [
    { v: [1, 0, 0, 0], m: { kind: 'x', n: 1 } },
    { v: [0.9, 0.1, 0, 0], m: { kind: 'y', n: 2 } },
    { v: [0.8, 0.2, 0, 0], m: { kind: 'x', n: 3 } },
    { v: [0.7, 0.3, 0, 0], m: { kind: 'y', n: 4 } },
  ];
  const q = [1, 0, 0, 0];

  // 1. In-memory agentdb store: native filtered search.
  const mem = new AgentDBClient({ vectorDimension: 4, storage: { path: '', inMemory: true, backend: 'agentdb' } });
  await mem.init();
  out.memBackend = mem.backendKind;
  out.memPersistent = mem.isPersistent;
  for (const d of docs) await mem.store(d.v, d.m);
  out.unfiltered = (await mem.search(q, { k: 10 })).map((r) => r.data.metadata.n);
  out.dslX = (await mem.search(q, { k: 10, filter: { kind: 'x' } })).map((r) => r.data.metadata.n);
  out.exprY = (await mem.search(q, { k: 10, filter: { op: 'eq', field: 'kind', value: 'y' } })).map(
    (r) => r.data.metadata.n
  );
  out.rangeAndGt = (
    await mem.search(q, { k: 10, filter: { kind: 'y', n: { $range: [1, 4] } } })
  ).map((r) => r.data.metadata.n);
  out.topOneY = (await mem.search(q, { k: 1, filter: { kind: 'y' } })).map((r) => r.data.metadata.n);
  out.none = (await mem.search(q, { k: 10, filter: { kind: 'z' } })).length;

  // 2. Isolation: a second in-memory client sees nothing from the first.
  const other = new AgentDBClient({ vectorDimension: 4, storage: { path: '', inMemory: true, backend: 'agentdb' } });
  await other.init();
  out.isolatedCount = (await other.search(q, { k: 10 })).length;
  const memStorePath = (mem.vectorIndex as any).getStoragePath() as string;
  await other.cleanup();
  await mem.cleanup();
  out.memTempRemoved = !existsSync(dirname(memStorePath));

  // 3. Persistence: write, close, reopen from the same path.
  const path = join(dir, 'store');
  const w = new AgentDBClient({ vectorDimension: 4, storage: { path, inMemory: false } });
  await w.init();
  out.writerBackend = w.backendKind;
  out.writerPersistent = w.isPersistent;
  for (const d of docs) await w.store(d.v, d.m);
  await w.cleanup();
  out.fileExists = existsSync(join(path, 'vectors.rvf'));

  const r = new AgentDBClient({ vectorDimension: 4, storage: { path, inMemory: false } });
  await r.init();
  out.reopenTotal = r.getStats().totalVectors;
  out.reopenX = (await r.search(q, { k: 10, filter: { kind: 'x' } })).map((h) => h.data.metadata.n);
  await r.cleanup();

  process.stdout.write(`PROBE ${JSON.stringify(out)}\n`);
}

main().catch((err) => {
  process.stdout.write(`PROBE_ERROR ${String(err && err.stack ? err.stack : err)}\n`);
  process.exit(1);
});
