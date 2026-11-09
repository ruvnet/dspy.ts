/**
 * AgentDBClient against the real agentdb 3.x package.
 *
 * jest's vm cannot `import()` ESM-only agentdb, so the client runs in a child
 * Node process (tests/memory/fixtures/agentdb-real-probe.ts) and this spec
 * asserts on what it observed. agentdb 3.x needs Node >= 20.9; on older Node
 * the suite is skipped (the fallback store is covered by agentdb-filter.spec.ts).
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const [major, minor] = process.versions.node.split('.').map(Number);
const supported = major > 20 || (major === 20 && minor >= 9);
const maybe = supported ? describe : describe.skip;

maybe('AgentDBClient on agentdb 3.x (real import, child process)', () => {
  let dir: string;
  let probe: Record<string, any>;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'dspy-agentdb-real-'));
    const root = resolve(__dirname, '../..');
    const stdout = execFileSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', join(__dirname, 'fixtures/agentdb-real-probe.ts'), dir],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 90_000,
        killSignal: 'SIGKILL',
        env: { ...process.env, TMPDIR: dir, LOG_LEVEL: 'silent' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    const line = stdout.split('\n').find((l) => l.startsWith('PROBE '));
    if (!line) throw new Error(`probe produced no result:\n${stdout}`);
    probe = JSON.parse(line.slice('PROBE '.length));
  }, 120_000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('loads agentdb >= 3.7.2 and uses its RVF backend', () => {
    const [ma, mi, pa] = String(probe.agentdbVersion).split('.').map(Number);
    expect(ma > 3 || (ma === 3 && (mi > 7 || (mi === 7 && pa >= 2)))).toBe(true);
    expect(probe.memBackend).toBe('agentdb-rvf');
    expect(probe.memPersistent).toBe(false);
  });

  it('filtered search returns only matching items', () => {
    expect(probe.unfiltered).toEqual([1, 2, 3, 4]);
    expect(probe.dslX).toEqual([1, 3]);
    expect(probe.exprY).toEqual([2, 4]);
    expect(probe.rangeAndGt).toEqual([2, 4]);
    // filter applies before top-k: best *matching* item, not best overall
    expect(probe.topOneY).toEqual([2]);
    expect(probe.none).toBe(0);
  });

  it('isolates in-memory stores and removes their temp dir on cleanup()', () => {
    expect(probe.isolatedCount).toBe(0);
    expect(probe.memTempRemoved).toBe(true);
  });

  it('persists across close and reopen when a path is given', () => {
    expect(probe.writerBackend).toBe('agentdb-rvf');
    expect(probe.writerPersistent).toBe(true);
    expect(probe.fileExists).toBe(true);
    expect(probe.reopenTotal).toBe(4);
    expect(probe.reopenX).toEqual([1, 3]);
  });
});
