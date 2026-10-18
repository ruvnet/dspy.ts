import { AgentDBClient } from '../../src/memory/agentdb/client';

jest.mock('agentdb', () => ({}));

it('matches full cosine sorting after insertion, update and deletion', async () => {
  const client = new AgentDBClient({ vectorDimension: 4 });
  await client.init();
  const rows: Array<{ id: string; vector: number[] }> = [];
  for (let i = 0; i < 100; i++) {
    const vector = [i % 7, i % 11, i % 3, 1];
    rows.push({ id: await client.store(vector), vector });
  }
  const query = [1, 2, 3, 4];
  const check = async () => {
    const expected = rows.map(r => ({ id: r.id, score: AgentDBClient.cosineSimilarity(query, r.vector) }))
      .sort((a, b) => b.score - a.score).slice(0, 10);
    expect((await client.search(query, { k: 10 })).map(({ id, score }) => ({ id, score }))).toEqual(expected);
  };
  await check();
  rows[0].vector = query;
  await client.update(rows[0].id, { vector: query });
  await check();
  await client.delete(rows.shift()!.id);
  await check();
  await client.cleanup();
});
