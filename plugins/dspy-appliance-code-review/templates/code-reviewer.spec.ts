import { configureLM, DummyLM } from 'dspy.ts';
import { reviewer, actionabilityMetric } from './code-reviewer';

describe('code-review appliance', () => {
  beforeEach(async () => { const lm = new DummyLM(); await lm.init(); configureLM(lm); });

  it('reviewer runs and returns a summary', async () => {
    const out = await reviewer.run({ diff: '+ const x = 1;\n- var x = 1;', context: 'Convention: prefer const over var. (src/style.md)' });
    expect(typeof out.summary).toBe('string');
  });

  it('actionabilityMetric rewards specific, located findings over vague ones', () => {
    const specific = actionabilityMetric({ diff: 'd', context: 'c' }, { summary: 's', findings: [{ severity: 'major', location: 'src/a.ts:12', issue: 'unhandled null', suggestion: 'guard with `if (!x) return`' }] });
    const vague = actionabilityMetric({ diff: 'd', context: 'c' }, { summary: 's', findings: [{ severity: 'major', issue: 'consider refactoring', suggestion: '' }] });
    expect(specific).toBeGreaterThan(vague);
  });

  it('actionabilityMetric penalises blocker/major findings on a PR that should ship', () => {
    const clean = actionabilityMetric({ diff: 'd', context: 'c' }, { summary: 'ship it', findings: [] }, { verdict: 'ship' });
    const falseAlarm = actionabilityMetric({ diff: 'd', context: 'c' }, { summary: 'blocked', findings: [{ severity: 'blocker', location: 'src/a.ts:1', issue: 'x', suggestion: 'y' }] }, { verdict: 'ship' });
    expect(clean).toBeGreaterThan(falseAlarm);
  });
});
