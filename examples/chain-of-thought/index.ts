/**
 * Chain-of-Thought Example
 *
 * Demonstrates using the ChainOfThought module for step-by-step reasoning
 */

import { ChainOfThought } from '../../src/modules/chain-of-thought';
import { OpenAILM } from '../../src/lm/providers/openai';
import { configureLM } from '../../src/core';

/**
 * Math word problem solver using Chain-of-Thought
 */
async function mathProblemExample() {
  console.log('=== Chain-of-Thought: Math Problem Solver ===\n');

  // Configure LM (requires OPENAI_API_KEY environment variable)
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Please set OPENAI_API_KEY environment variable');
    return;
  }

  const lm = new OpenAILM({
    apiKey,
    model: 'gpt-3.5-turbo',
    defaultOptions: {
      temperature: 0.7,
      maxTokens: 500,
    },
  });

  await lm.init();
  configureLM(lm);

  // Create Chain-of-Thought module
  const solver = new ChainOfThought({
    name: 'MathProblemSolver',
    signature: {
      inputs: [
        {
          name: 'problem',
          type: 'string',
          description: 'A math word problem',
          required: true,
        },
      ],
      outputs: [
        {
          name: 'answer',
          type: 'number',
          description: 'The numerical answer',
          required: true,
        },
        {
          name: 'steps',
          type: 'string',
          description: 'The steps taken to solve',
          required: false,
        },
      ],
    },
  });

  // Example problems
  const problems = [
    {
      problem:
        'A store has 15 apples. They sell 8 apples in the morning and 3 apples in the afternoon. How many apples are left?',
      expected: 4,
    },
    {
      problem:
        'Sarah has $50. She buys a book for $12 and a pen for $3. How much money does she have left?',
      expected: 35,
    },
    {
      problem:
        'A bus has 24 passengers. At the first stop, 8 people get off and 5 people get on. How many passengers are now on the bus?',
      expected: 21,
    },
  ];

  // Solve each problem
  for (const { problem, expected } of problems) {
    console.log(`Problem: ${problem}`);
    console.log('');

    try {
      const result = await solver.run({ problem });

      console.log('Reasoning:');
      console.log(result.reasoning);
      console.log('');

      console.log(`Answer: ${result.answer}`);
      console.log(`Expected: ${expected}`);
      console.log(`Correct: ${result.answer === expected ? '✓' : '✗'}`);
      console.log('\n' + '='.repeat(60) + '\n');
    } catch (error) {
      console.error('Error:', error);
    }
  }

  await lm.cleanup();
}

/**
 * Logical reasoning example
 */
async function logicalReasoningExample() {
  console.log('=== Chain-of-Thought: Logical Reasoning ===\n');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Please set OPENAI_API_KEY environment variable');
    return;
  }

  const lm = new OpenAILM({ apiKey });
  await lm.init();
  configureLM(lm);

  const reasoner = new ChainOfThought({
    name: 'LogicalReasoner',
    signature: {
      inputs: [
        {
          name: 'premise1',
          type: 'string',
          description: 'First premise',
          required: true,
        },
        {
          name: 'premise2',
          type: 'string',
          description: 'Second premise',
          required: true,
        },
      ],
      outputs: [
        {
          name: 'conclusion',
          type: 'string',
          description: 'Logical conclusion',
          required: true,
        },
        {
          name: 'valid',
          type: 'boolean',
          description: 'Whether the reasoning is valid',
          required: true,
        },
      ],
    },
  });

  const example = {
    premise1: 'All humans are mortal',
    premise2: 'Socrates is a human',
  };

  console.log(`Premise 1: ${example.premise1}`);
  console.log(`Premise 2: ${example.premise2}`);
  console.log('');

  try {
    const result = await reasoner.run(example);

    console.log('Reasoning Process:');
    console.log(result.reasoning);
    console.log('');

    console.log(`Conclusion: ${result.conclusion}`);
    console.log(`Valid: ${result.valid}`);
  } catch (error) {
    console.error('Error:', error);
  }

  await lm.cleanup();
}

/**
 * Run examples
 */
async function main() {
  try {
    await mathProblemExample();
    await logicalReasoningExample();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { mathProblemExample, logicalReasoningExample };
