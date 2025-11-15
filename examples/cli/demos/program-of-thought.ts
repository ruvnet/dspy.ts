/**
 * Program-of-Thought Demo
 *
 * Demonstrates code generation and sandboxed execution for solving problems
 */

import { ProgramOfThought } from '../../../src/modules/program-of-thought';
import { OpenRouterLM, OpenRouterModels } from '../../../src/lm/providers/openrouter';
import { configureLM } from '../../../src/lm/base';

export default async function run() {
  console.log('💻 Initializing Program-of-Thought System...\n');

  // 1. Configure Language Model
  const lm = new OpenRouterLM({
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: process.env.MODEL || OpenRouterModels.GPT_3_5_TURBO,
    siteName: 'DSPy.ts Program-of-Thought Demo',
  });

  await lm.init();
  configureLM(lm);

  console.log(`✅ Using model: ${process.env.MODEL || OpenRouterModels.GPT_3_5_TURBO}\n`);

  // 2. Create Program-of-Thought module
  console.log('🏗️  Creating Program-of-Thought module...');

  const potModule = new ProgramOfThought({
    name: 'MathSolver',
    signature: {
      inputs: [
        {
          name: 'problem',
          type: 'string',
          description: 'Math problem to solve',
          required: true,
        },
      ],
      outputs: [
        {
          name: 'answer',
          type: 'string',
          description: 'Final answer',
          required: true,
        },
      ],
    },
    timeout: 5000,
    allowBuiltins: false,
  });

  console.log('✅ Module created\n');

  // 3. Demo problems
  const problems = [
    {
      problem: 'Calculate the compound interest on $1000 at 5% annual rate for 3 years',
      description: 'Financial calculation',
    },
    {
      problem: 'Find the sum of all even numbers from 1 to 100',
      description: 'Loop and conditional',
    },
    {
      problem: 'Calculate the factorial of 10',
      description: 'Recursive thinking',
    },
    {
      problem:
        'A company has 250 employees. 60% work remotely. Of those, 30% are international. How many international remote employees?',
      description: 'Multi-step calculation',
    },
  ];

  console.log('🧮 Solving math problems with code generation:\n');

  for (let i = 0; i < problems.length; i++) {
    const { problem, description } = problems[i];

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`Problem ${i + 1}: ${description}`);
    console.log('═'.repeat(70));
    console.log(`\n📝 ${problem}\n`);

    try {
      const result = await potModule.run({ problem });

      if (result.code) {
        console.log('💻 Generated Code:');
        console.log('─'.repeat(70));
        console.log(result.code);
        console.log('─'.repeat(70));
      }

      if (result.steps) {
        console.log('\n🔍 Solution Steps:');
        console.log(result.steps);
      }

      console.log(`\n✨ Answer: ${(result as any).answer}`);
    } catch (error) {
      console.error(`\n❌ Error: ${error}`);
    }
  }

  console.log('\n\n' + '═'.repeat(70));
  console.log('🎯 Advanced Example: Code with Error Handling');
  console.log('═'.repeat(70));

  const advancedProblem = {
    problem:
      'Calculate the average of the numbers [15, 23, 8, 42, 16, 31] and round to 2 decimal places',
    description: 'Array operations with formatting',
  };

  console.log(`\n📝 ${advancedProblem.problem}\n`);

  try {
    const result = await potModule.run({ problem: advancedProblem.problem });

    if (result.code) {
      console.log('💻 Generated Code:');
      console.log('─'.repeat(70));
      console.log(result.code);
      console.log('─'.repeat(70));
    }

    if (result.steps) {
      console.log('\n🔍 Solution Steps:');
      console.log(result.steps);
    }

    console.log(`\n✨ Answer: ${(result as any).answer}`);
  } catch (error) {
    console.error(`\n❌ Error: ${error}`);
  }

  // 4. Comparison with traditional Chain-of-Thought
  console.log('\n\n' + '═'.repeat(70));
  console.log('🔬 Program-of-Thought vs Chain-of-Thought');
  console.log('═'.repeat(70));

  console.log(`
Program-of-Thought Benefits:
  ✅ Precise numerical calculations (no rounding errors)
  ✅ Complex algorithmic reasoning (loops, conditions)
  ✅ Verifiable execution (actual code runs)
  ✅ Reusable logic (code can be stored/modified)
  ✅ Better for: Math, data processing, structured problems

Chain-of-Thought Benefits:
  ✅ Natural language reasoning
  ✅ Contextual understanding
  ✅ Creative problem solving
  ✅ Better for: Open-ended questions, analysis, judgment calls

Use Case Selection:
  📊 Financial calculations → Program-of-Thought
  🧮 Mathematical proofs → Program-of-Thought
  📝 Essay analysis → Chain-of-Thought
  🔢 Data aggregation → Program-of-Thought
  💭 Philosophical questions → Chain-of-Thought
`);

  console.log('\n💡 Tips:');
  console.log('   - PoT excels at precise numerical calculations');
  console.log('   - Code is executed in a sandboxed environment for safety');
  console.log('   - Adjust timeout and allowedModules for your use case');
  console.log('   - Combine with Chain-of-Thought for hybrid reasoning');
}

if (require.main === module) {
  run().catch(console.error);
}
