#!/usr/bin/env node

/**
 * DSPy.ts Demo Runner
 *
 * Interactive CLI for running DSPy.ts examples
 *
 * Usage:
 *   npm run demo                    # Interactive mode
 *   npm run demo simple-qa          # Run specific demo
 *   npm run demo --list             # List all demos
 */

import * as readline from 'readline';

// Demo configurations
const DEMOS = {
  'simple-qa': {
    name: 'Simple Q&A with Chain-of-Thought',
    description: 'Basic question answering with step-by-step reasoning',
    file: './demos/simple-qa',
    requiredEnv: ['OPENROUTER_API_KEY'],
  },
  'rag-agentdb': {
    name: 'RAG with AgentDB',
    description: 'Retrieval-Augmented Generation using AgentDB vector search',
    file: './demos/rag-agentdb',
    requiredEnv: ['OPENROUTER_API_KEY'],
  },
  'reasoning-bank': {
    name: 'ReasoningBank Learning',
    description: 'Self-learning system with SAFLA algorithm',
    file: './demos/reasoning-bank',
    requiredEnv: ['OPENROUTER_API_KEY'],
  },
  'multi-agent': {
    name: 'Multi-Agent with Swarm',
    description: 'Orchestrated multi-agent system with handoffs',
    file: './demos/multi-agent',
    requiredEnv: ['OPENROUTER_API_KEY'],
  },
  'optimization': {
    name: 'MIPROv2 Optimization',
    description: 'Automatic prompt optimization with MIPROv2',
    file: './demos/optimization',
    requiredEnv: ['OPENROUTER_API_KEY'],
  },
  'program-of-thought': {
    name: 'Program-of-Thought Coding',
    description: 'Code generation and execution for math problems',
    file: './demos/program-of-thought',
    requiredEnv: ['OPENROUTER_API_KEY'],
  },
} as const;

type DemoKey = keyof typeof DEMOS;

async function main() {
  const args = process.argv.slice(2);

  // List demos
  if (args.includes('--list') || args.includes('-l')) {
    listDemos();
    return;
  }

  // Check for specific demo
  const demoArg = args[0] as DemoKey;

  if (demoArg && DEMOS[demoArg]) {
    await runDemo(demoArg);
  } else if (demoArg) {
    console.error(`\n❌ Unknown demo: ${demoArg}`);
    console.log('\nAvailable demos:');
    listDemos();
    process.exit(1);
  } else {
    // Interactive mode
    await interactiveMode();
  }
}

function listDemos() {
  console.log('\n📚 Available DSPy.ts Demos:\n');

  Object.entries(DEMOS).forEach(([key, demo], index) => {
    console.log(`${index + 1}. ${key}`);
    console.log(`   ${demo.name}`);
    console.log(`   ${demo.description}`);
    console.log('');
  });

  console.log('Run with: npm run demo <demo-name>');
  console.log('Example: npm run demo simple-qa\n');
}

async function interactiveMode() {
  console.log('\n🚀 DSPy.ts Interactive Demo Runner\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const demoKeys = Object.keys(DEMOS) as DemoKey[];

  console.log('Available demos:\n');
  demoKeys.forEach((key, index) => {
    const demo = DEMOS[key];
    console.log(`${index + 1}. ${demo.name}`);
    console.log(`   ${demo.description}\n`);
  });

  rl.question('Select a demo (1-6) or press Ctrl+C to exit: ', async (answer) => {
    rl.close();

    const selection = parseInt(answer) - 1;

    if (selection >= 0 && selection < demoKeys.length) {
      await runDemo(demoKeys[selection]);
    } else {
      console.error('\n❌ Invalid selection');
      process.exit(1);
    }
  });
}

async function runDemo(demoKey: DemoKey) {
  const demo = DEMOS[demoKey];

  console.log(`\n🎯 Running: ${demo.name}`);
  console.log(`📝 ${demo.description}\n`);

  // Check environment variables
  const missing = demo.requiredEnv.filter((env) => !process.env[env]);

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables:`);
    missing.forEach((env) => console.error(`   - ${env}`));
    console.log('\nSet them in your .env file or export them:');
    missing.forEach((env) => console.log(`   export ${env}=your-key-here`));
    process.exit(1);
  }

  console.log('─'.repeat(60));
  console.log('');

  try {
    // Dynamic import of demo module
    const demoModule = await import(demo.file);

    if (typeof demoModule.default === 'function') {
      await demoModule.default();
    } else if (typeof demoModule.run === 'function') {
      await demoModule.run();
    } else {
      throw new Error('Demo module must export a default function or run function');
    }

    console.log('');
    console.log('─'.repeat(60));
    console.log('✅ Demo completed successfully!');
  } catch (error) {
    console.error('');
    console.error('─'.repeat(60));
    console.error('❌ Demo failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runDemo, listDemos };
