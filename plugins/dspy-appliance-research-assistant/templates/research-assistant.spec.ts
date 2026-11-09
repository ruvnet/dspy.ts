import { configureLM, DummyLM } from 'dspy.ts';
import { synthesizer, groundedAnswerMetric } from './research-assistant';

describe('research-assistant appliance', () => {
  beforeEach(async () => { const lm = new DummyLM(); await lm.init(); configureLM(lm); });

  it('synthesizer runs and returns an answer', async () => {
    const out = await synthesizer.run({ question: 'What is X?', evidence: 'n1 (source: doc:1): X is a thing.' });
    expect(typeof out.answer).toBe('string');
  });

  it('groundedAnswerMetric rewards citations that reference gathered evidence', () => {
    const grounded = groundedAnswerMetric({ question: 'q', evidence: 'n1 (source: doc:1): fact' }, { answer: 'fact', citations: [{ source: 'doc:1', claim: 'fact' }] });
    const hallucinated = groundedAnswerMetric({ question: 'q', evidence: 'n1 (source: doc:1): fact' }, { answer: 'fact', citations: [{ source: 'doc:999', claim: 'fact' }] });
    expect(grounded).toBeGreaterThan(hallucinated);
  });

  it('groundedAnswerMetric rewards hedging when there is no evidence', () => {
    const honest = groundedAnswerMetric({ question: 'q', evidence: '' }, { answer: "The evidence is insufficient.", citations: [], gaps: ['everything'] }, { answerable: false });
    expect(honest).toBeGreaterThan(0.9);
  });
});
