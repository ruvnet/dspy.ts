import { configureLM, DummyLM } from 'dspy.ts';
import { classify, rowMetric, parseDelimited, toCSV, LABELS } from './data-pipeline';

describe('data-pipeline appliance', () => {
  beforeEach(async () => { const lm = new DummyLM(); await lm.init(); configureLM(lm); });

  it('classify runs and returns a label', async () => {
    const out = await classify.run({ text: 'my invoice is wrong' });
    expect(typeof out.label).toBe('string');
  });

  it('rowMetric: exact label = 1, real-class↔other confusion penalised, off-vocab capped', () => {
    expect(rowMetric({ text: 't' }, { label: 'billing' }, { label: 'billing' })).toBe(1);
    expect(rowMetric({ text: 't' }, { label: 'other' }, { label: 'billing' })).toBeLessThan(rowMetric({ text: 't' }, { label: 'bug' }, { label: 'billing' }));
    expect(rowMetric({ text: 't' }, { label: 'nonsense' }, { label: 'billing' })).toBeLessThanOrEqual(0.1);
  });

  it('CSV round-trips', () => {
    const rows = parseDelimited('raw,label\nhello,how_to\n"a, b",bug');
    expect(rows).toHaveLength(2);
    expect(rows[1].raw).toBe('a, b');
    expect(toCSV(rows)).toContain('raw,label');
  });

  it('LABELS is a fixed non-empty set', () => { expect(LABELS.length).toBeGreaterThan(1); });
});
