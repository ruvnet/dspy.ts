import { configureLM, DummyLM } from 'dspy.ts';
import { answerer, supportMetric } from './support-bot';

describe('support-bot appliance', () => {
  beforeEach(async () => { const lm = new DummyLM(); await lm.init(); configureLM(lm); });

  it('answerer runs and returns an answer string', async () => {
    const out = await answerer.run({ question: 'How do I reset my password?', context: 'Go to Settings > Security > Reset password. (source: kb/security)' });
    expect(typeof out.answer).toBe('string');
  });

  it('supportMetric rewards an honest "I don\'t know" when the KB cannot answer', () => {
    const s = supportMetric({ question: 'q', context: 'unrelated' }, { answer: "I don't know — that isn't in our knowledge base." }, { answerable: false });
    expect(s).toBeGreaterThan(0.9);
  });

  it('supportMetric penalises a hallucinated citation', () => {
    const grounded = supportMetric({ question: 'q', context: 'A: see kb/x' }, { answer: 'A', citations: [{ source: 'kb/x' }] });
    const hallucinated = supportMetric({ question: 'q', context: 'A: see kb/x' }, { answer: 'A', citations: [{ source: 'kb/nope' }] });
    expect(grounded).toBeGreaterThan(hallucinated);
  });
});
