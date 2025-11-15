/**
 * Multi-Agent with Swarm Demo
 *
 * Demonstrates orchestrated multi-agent system with handoffs
 */

import { SwarmOrchestrator } from '../../../src/agent/swarm/orchestrator';
import { Agent, Task } from '../../../src/agent/swarm/types';
import { ChainOfThought } from '../../../src/modules/chain-of-thought';
import { OpenRouterLM, OpenRouterModels } from '../../../src/lm/providers/openrouter';
import { configureLM } from '../../../src/lm/base';

export default async function run() {
  console.log('🤖 Initializing Multi-Agent Swarm System...\n');

  // 1. Configure Language Model
  const lm = new OpenRouterLM({
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: process.env.MODEL || OpenRouterModels.GPT_3_5_TURBO,
    siteName: 'DSPy.ts Swarm Demo',
  });

  await lm.init();
  configureLM(lm);

  console.log(`✅ Using model: ${process.env.MODEL || OpenRouterModels.GPT_3_5_TURBO}\n`);

  // 2. Create specialized agents
  console.log('🏗️  Creating specialized agents...\n');

  // Research Agent
  const researchModule = new ChainOfThought({
    name: 'Researcher',
    signature: {
      inputs: [{ name: 'topic', type: 'string', required: true }],
      outputs: [{ name: 'findings', type: 'string', required: true }],
    },
  });

  const researchAgent: Agent = {
    id: 'researcher',
    name: 'Research Agent',
    description: 'Gathers and analyzes information on topics',
    routine: {
      instructions: 'You are a research specialist. Provide comprehensive, well-researched information.',
      tools: [],
      execute: async (input: any, context: Map<string, any>) => {
        const result = await researchModule.run(input);
        return {
          output: result,
          success: true,
          context,
        };
      },
    },
    handoffs: [
      {
        condition: (context: Map<string, any>, input: any) => {
          const output = context.get('lastOutput');
          return output?.findings && output.findings.length > 100;
        },
        targetAgent: 'writer',
        transferContext: ['findings'],
        description: 'Research complete, ready for writing',
      },
    ],
    context: new Map(),
  };

  // Writer Agent
  const writerModule = new ChainOfThought({
    name: 'Writer',
    signature: {
      inputs: [
        { name: 'research', type: 'string', required: true },
        { name: 'style', type: 'string', required: false },
      ],
      outputs: [{ name: 'article', type: 'string', required: true }],
    },
  });

  const writerAgent: Agent = {
    id: 'writer',
    name: 'Writer Agent',
    description: 'Transforms research into engaging content',
    routine: {
      instructions: 'You are a skilled writer. Create clear, engaging content from research.',
      tools: [],
      execute: async (input: any, context: Map<string, any>) => {
        const result = await writerModule.run({
          research: input.findings || input.research,
          style: input.style || 'professional',
        });
        return {
          output: result,
          success: true,
          context,
        };
      },
    },
    handoffs: [
      {
        condition: (context: Map<string, any>, input: any) => {
          const output = context.get('lastOutput');
          return output?.article && output.article.length > 100;
        },
        targetAgent: 'reviewer',
        transferContext: ['article'],
        description: 'Article complete, ready for review',
      },
    ],
    context: new Map(),
  };

  // Reviewer Agent
  const reviewerModule = new ChainOfThought({
    name: 'Reviewer',
    signature: {
      inputs: [{ name: 'content', type: 'string', required: true }],
      outputs: [
        { name: 'feedback', type: 'string', required: true },
        { name: 'approved', type: 'string', required: true },
      ],
    },
  });

  const reviewerAgent: Agent = {
    id: 'reviewer',
    name: 'Reviewer Agent',
    description: 'Reviews and provides feedback on content',
    routine: {
      instructions: 'You are a quality reviewer. Provide constructive feedback and approve good content.',
      tools: [],
      execute: async (input: any, context: Map<string, any>) => {
        const result = await reviewerModule.run({
          content: input.article || input.content,
        });
        return {
          output: result,
          success: true,
          context,
        };
      },
    },
    handoffs: [],
    context: new Map(),
  };

  console.log('✅ Created 3 agents: Researcher, Writer, Reviewer\n');

  // 3. Initialize Swarm Orchestrator
  console.log('🎯 Initializing Swarm Orchestrator...');
  const swarm = new SwarmOrchestrator();

  swarm.addAgent(researchAgent);
  swarm.addAgent(writerAgent);
  swarm.addAgent(reviewerAgent);

  console.log('✅ Swarm ready with agent handoffs configured\n');

  // 4. Execute collaborative task
  const task: Task = {
    id: 'article-creation',
    input: {
      topic: 'The benefits of declarative AI programming with DSPy',
    },
    startAgent: 'researcher',
    maxHandoffs: 5,
  };

  console.log('═'.repeat(60));
  console.log('🚀 Executing Multi-Agent Task');
  console.log('═'.repeat(60));
  console.log(`\nTopic: ${task.input.topic}`);
  console.log(`Starting Agent: ${task.startAgent}\n`);

  try {
    const result = await swarm.execute(task);

    console.log('\n' + '═'.repeat(60));
    console.log('📊 Execution Trace');
    console.log('═'.repeat(60));

    result.trace.forEach((execution, i) => {
      console.log(`\n${i + 1}. Agent: ${execution.agentName}`);
      console.log(`   Duration: ${execution.duration}ms`);
      console.log(`   Success: ${execution.success ? '✅' : '❌'}`);

      if (execution.handoffTo) {
        console.log(`   → Handoff to: ${execution.handoffTo}`);
      }
    });

    console.log('\n' + '═'.repeat(60));
    console.log('📝 Final Result');
    console.log('═'.repeat(60));

    if (result.output.article) {
      console.log('\n✍️  Article:');
      console.log(result.output.article);
    }

    if (result.output.feedback) {
      console.log('\n📋 Reviewer Feedback:');
      console.log(result.output.feedback);
    }

    if (result.output.approved) {
      console.log(`\n${result.output.approved.toLowerCase().includes('yes') ? '✅' : '⚠️'} Approval Status: ${result.output.approved}`);
    }

    console.log('\n' + '═'.repeat(60));
    console.log('📈 Summary');
    console.log('═'.repeat(60));
    console.log(`\nTotal Agents Used: ${result.trace.length}`);
    console.log(`Total Time: ${result.trace.reduce((sum, e) => sum + e.duration, 0)}ms`);
    console.log(`Handoffs: ${result.trace.filter(e => e.handoffTo).length}`);
    console.log(`Success Rate: ${(result.trace.filter(e => e.success).length / result.trace.length * 100).toFixed(0)}%`);
  } catch (error) {
    console.error(`\n❌ Task execution failed: ${error}`);
  }

  console.log('\n');
  console.log('💡 Swarm Features Demonstrated:');
  console.log('   ✅ Multi-agent collaboration');
  console.log('   ✅ Intelligent handoffs');
  console.log('   ✅ Execution tracing');
  console.log('   ✅ Task orchestration');
  console.log('   ✅ Agent specialization');
}

if (require.main === module) {
  run().catch(console.error);
}
