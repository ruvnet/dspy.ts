import { topK } from '../../src/utils/top-k';

describe('stable bounded top K', () => {
  const compare = (a: { score: number }, b: { score: number }) => b.score - a.score;
  it('matches a full stable sort for seeded scores, ties and legacy limits', () => {
    let seed = 42;
    const values = Array.from({ length: 2000 }, (_, id) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return { id, score: seed % 41 - 20 };
    });
    for (const k of [0, 1, 5, 10, 100, 2000, 3000, -1, 2.5, Infinity, NaN]) {
      expect(topK(values.values(), k, compare)).toEqual([...values].sort(compare).slice(0, k));
    }
    expect(topK([], 10, compare)).toEqual([]);
  });
  it('keeps insertion order for tied candidates at the cutoff', () => {
    const values = Array.from({ length: 100 }, (_, id) => ({ id, score: 1 }));
    expect(topK(values, 5, compare)).toEqual(values.slice(0, 5));
  });
});
