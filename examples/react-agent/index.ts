/**
 * ReAct Agent Example
 *
 * Demonstrates using the ReAct module for reasoning and acting with tools
 */

import { ReAct, Tool } from '../../src/modules/react';
import { OpenAILM } from '../../src/lm/providers/openai';
import { configureLM } from '../../src/core';

/**
 * Simple calculator tool
 */
const calculatorTool: Tool = {
  name: 'calculator',
  description: 'Performs basic arithmetic operations. Input format: "5 + 3" or "10 * 2"',
  execute: async (input: string): Promise<string> => {
    try {
      // Simple eval (in production, use a proper expression parser)
      const sanitized = input.replace(/[^0-9+\-*/().\s]/g, '');
      const result = eval(sanitized);
      return `Result: ${result}`;
    } catch (error) {
      return `Error: Invalid calculation`;
    }
  },
};

/**
 * Wikipedia search tool (mock)
 */
const wikipediaTool: Tool = {
  name: 'wikipedia',
  description: 'Searches Wikipedia for information. Input: search query',
  execute: async (query: string): Promise<string> => {
    // Mock implementation - in production, call actual Wikipedia API
    const mockData: Record<string, string> = {
      'eiffel tower':
        'The Eiffel Tower is a wrought-iron lattice tower in Paris, France. Built in 1889, it stands 330 meters tall.',
      'albert einstein':
        'Albert Einstein (1879-1955) was a German-born theoretical physicist who developed the theory of relativity.',
      'photosynthesis':
        'Photosynthesis is the process by which plants use sunlight to synthesize foods from carbon dioxide and water.',
      'python programming':
        'Python is a high-level, interpreted programming language created by Guido van Rossum in 1991.',
    };

    const key = query.toLowerCase();
    for (const [topic, info] of Object.entries(mockData)) {
      if (key.includes(topic)) {
        return info;
      }
    }

    return `No information found for: ${query}`;
  },
};

/**
 * Current time tool
 */
const timeTool: Tool = {
  name: 'time',
  description: 'Gets the current time and date',
  execute: async (): Promise<string> => {
    const now = new Date();
    return `Current time: ${now.toLocaleString()}`;
  },
};

/**
 * Question answering with ReAct
 */
async function questionAnsweringExample() {
  console.log('=== ReAct Agent: Question Answering ===\n');

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
      maxTokens: 800,
    },
  });

  await lm.init();
  configureLM(lm);

  // Create ReAct agent with tools
  const agent = new ReAct({
    name: 'QAAgent',
    signature: {
      inputs: [
        {
          name: 'question',
          type: 'string',
          description: 'A question to answer',
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
      ],
    },
    tools: [calculatorTool, wikipediaTool, timeTool],
    maxIterations: 5,
  });

  // Example questions
  const questions = [
    'What is the height of the Eiffel Tower in meters?',
    'If the Eiffel Tower is 330 meters tall and a building is half its height, how tall is the building?',
    'Who developed the theory of relativity?',
  ];

  for (const question of questions) {
    console.log(`Question: ${question}`);
    console.log('');

    try {
      const result = await agent.run({ question });

      console.log('Reasoning Trace:');
      console.log(result.reasoning);
      console.log('');

      console.log('Steps Taken:');
      for (const step of result.steps) {
        console.log(`  [${step.type.toUpperCase()}] ${step.content}`);
        if (step.tool) {
          console.log(`    Tool: ${step.tool}`);
        }
      }
      console.log('');

      console.log(`Final Answer: ${result.answer}`);
      console.log('\n' + '='.repeat(60) + '\n');
    } catch (error) {
      console.error('Error:', error);
    }
  }

  await lm.cleanup();
}

/**
 * Multi-step problem solving
 */
async function problemSolvingExample() {
  console.log('=== ReAct Agent: Multi-Step Problem Solving ===\n');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Please set OPENAI_API_KEY environment variable');
    return;
  }

  const lm = new OpenAILM({ apiKey });
  await lm.init();
  configureLM(lm);

  const agent = new ReAct({
    name: 'ProblemSolver',
    signature: {
      inputs: [
        {
          name: 'problem',
          type: 'string',
          description: 'A complex problem to solve',
          required: true,
        },
      ],
      outputs: [
        {
          name: 'solution',
          type: 'string',
          description: 'The solution to the problem',
          required: true,
        },
        {
          name: 'confidence',
          type: 'number',
          description: 'Confidence in the solution (0-1)',
          required: false,
        },
      ],
    },
    tools: [calculatorTool, wikipediaTool],
    maxIterations: 8,
  });

  const problem =
    'Einstein developed the theory of relativity. If he published his special relativity paper in 1905 and lived for 76 years, what year did he die? Also calculate his age at death.';

  console.log(`Problem: ${problem}`);
  console.log('');

  try {
    const result = await agent.run({ problem });

    console.log('Agent Reasoning:');
    console.log(result.reasoning);
    console.log('');

    console.log(`Solution: ${result.solution}`);
    if (result.confidence !== undefined) {
      console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    }

    console.log('');
    console.log(`Total Steps: ${result.steps.length}`);
    console.log(
      `Tool Uses: ${result.steps.filter((s) => s.type === 'action').length}`
    );
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
    await questionAnsweringExample();
    await problemSolvingExample();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { questionAnsweringExample, problemSolvingExample };
