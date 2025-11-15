/**
 * Simple Q&A with Chain-of-Thought Demo
 *
 * Demonstrates basic question answering with step-by-step reasoning
 */

import { ChainOfThought } from '../../../src/modules/chain-of-thought';
import { OpenRouterLM, OpenRouterModels } from '../../../src/lm/providers/openrouter';
import { configureLM } from '../../../src/lm/base';

export default async function run() {
  console.log('🧠 Initializing Chain-of-Thought Q&A System...\n');

  // 1. Configure Language Model
  const lm = new OpenRouterLM({
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: process.env.MODEL || OpenRouterModels.GPT_3_5_TURBO,
    siteName: 'DSPy.ts Demo',
  });

  await lm.init();
  configureLM(lm);

  console.log(`✅ Using model: ${process.env.MODEL || OpenRouterModels.GPT_3_5_TURBO}\n`);

  // 2. Create Chain-of-Thought module
  const qaSystem = new ChainOfThought({
    name: 'QASystem',
    signature: {
      inputs: [
        {
          name: 'question',
          type: 'string',
          description: 'The question to answer',
          required: true,
        },
      ],
      outputs: [
        {
          name: 'answer',
          type: 'string',
          description: 'The answer to the question',
          required: true,
        },
        {
          name: 'confidence',
          type: 'string',
          description: 'Confidence level (low/medium/high)',
          required: false,
        },
      ],
    },
  });

  // 3. Demo questions
  const questions = [
    'What is the capital of France?',
    'If a train travels 120 km in 2 hours, what is its average speed?',
    'Why is the sky blue?',
  ];

  console.log('📝 Asking questions with Chain-of-Thought reasoning:\n');

  for (const question of questions) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Question: ${question}`);
    console.log('═'.repeat(60));

    try {
      const result = await qaSystem.run({ question });

      console.log('\n💭 Reasoning:');
      console.log(result.reasoning);

      console.log('\n✨ Answer:');
      console.log(result.answer);

      if (result.confidence) {
        console.log(`\n📊 Confidence: ${result.confidence}`);
      }
    } catch (error) {
      console.error(`\n❌ Error: ${error}`);
    }
  }

  console.log('\n');
}

if (require.main === module) {
  run().catch(console.error);
}
