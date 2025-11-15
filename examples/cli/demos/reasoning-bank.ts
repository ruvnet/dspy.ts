/**
 * ReasoningBank Learning Demo
 *
 * Demonstrates self-learning system with SAFLA algorithm
 */

import { ReasoningBank } from '../../../src/memory/reasoning-bank/bank';
import { AgentDBClient } from '../../../src/memory/agentdb/client';
import { ChainOfThought } from '../../../src/modules/chain-of-thought';
import { OpenRouterLM, OpenRouterModels } from '../../../src/lm/providers/openrouter';
import { configureLM } from '../../../src/lm/base';

export default async function run() {
  console.log('🧠 Initializing ReasoningBank with SAFLA...\n');

  // 1. Configure Language Model
  const lm = new OpenRouterLM({
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: process.env.MODEL || OpenRouterModels.GPT_3_5_TURBO,
    siteName: 'DSPy.ts ReasoningBank Demo',
  });

  await lm.init();
  configureLM(lm);

  console.log(`✅ Using model: ${process.env.MODEL || OpenRouterModels.GPT_3_5_TURBO}\n`);

  // 2. Initialize AgentDB for ReasoningBank
  console.log('📊 Initializing AgentDB...');
  const agentDB = new AgentDBClient({
    vectorDimension: 384,
    indexType: 'hnsw',
    storage: {
      path: './data',
      inMemory: true,
    },
  });

  await agentDB.init();
  console.log('✅ AgentDB initialized\n');

  // 3. Initialize ReasoningBank
  console.log('🏦 Initializing ReasoningBank with SAFLA...');
  const reasoningBank = new ReasoningBank(agentDB, {
    minConfidenceThreshold: 0.6,
    minUsageCount: 1,
    minSuccessRate: 0.5,
    maxAgeInDays: 30,
    autoEvolve: true,
    evolutionInterval: 24 * 60 * 60 * 1000, // Daily
  });

  await reasoningBank.init();
  console.log('✅ ReasoningBank initialized\n');

  // 4. Create Chain-of-Thought module
  const reasoner = new ChainOfThought({
    name: 'Reasoner',
    signature: {
      inputs: [
        {
          name: 'problem',
          type: 'string',
          description: 'The problem to solve',
          required: true,
        },
      ],
      outputs: [
        {
          name: 'solution',
          type: 'string',
          description: 'The solution',
          required: true,
        },
      ],
    },
  });

  // 5. Demo: Learning from experiences
  console.log('📚 Learning Phase: Processing math problems...\n');

  const problems = [
    {
      problem: 'If 5 apples cost $10, how much do 3 apples cost?',
      expectedAnswer: '$6',
      category: 'unit-price',
    },
    {
      problem: 'A rectangle has length 8m and width 5m. What is its area?',
      expectedAnswer: '40 square meters',
      category: 'geometry',
    },
    {
      problem: 'If 10 widgets cost $50, what is the unit price?',
      expectedAnswer: '$5 per widget',
      category: 'unit-price',
    },
  ];

  for (const { problem, expectedAnswer, category } of problems) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Problem: ${problem}`);
    console.log('─'.repeat(60));

    try {
      // Generate solution
      const result = await reasoner.run({ problem });

      console.log(`\n💭 Reasoning: ${result.reasoning.substring(0, 200)}...`);
      console.log(`\n✨ Solution: ${result.solution}`);

      // Determine success (simplified - in production, use proper evaluation)
      const success = result.solution.toLowerCase().includes(expectedAnswer.toLowerCase().replace(/\$/g, ''));

      console.log(`\n${success ? '✅' : '❌'} Evaluation: ${success ? 'Correct' : 'Incorrect'}`);

      // Learn from experience
      const knowledge = await reasoningBank.learnFromExperience({
        input: { problem },
        output: result,
        success,
        reasoning: result.reasoning ? [result.reasoning] : [],
        context: {
          domain: category,
          inputFeatures: { problem },
          conditions: { expectedAnswer },
        },
        timestamp: new Date(),
      });

      console.log(`\n🧠 Knowledge Unit Created:`);
      console.log(`   ID: ${knowledge.id}`);
      console.log(`   Pattern: ${knowledge.pattern.substring(0, 50)}...`);
      console.log(`   Confidence: ${knowledge.confidence.toFixed(2)}`);
      console.log(`   Uses: ${knowledge.usageCount}`);
    } catch (error) {
      console.error(`\n❌ Error: ${error}`);
    }
  }

  // 6. Retrieve learned patterns
  console.log(`\n\n${'═'.repeat(60)}`);
  console.log('📖 Retrieval Phase: Using learned knowledge...');
  console.log('═'.repeat(60));

  const newProblem = 'If 8 pencils cost $16, how much do 5 pencils cost?';
  console.log(`\nNew Problem: ${newProblem}`);

  // Retrieve relevant knowledge
  const relevantKnowledge = await reasoningBank.retrieve({
    context: {
      domain: 'unit-price',
      inputFeatures: {},
      conditions: {},
    },
    limit: 3,
    minConfidence: 0.5,
  });

  console.log(`\n📚 Retrieved ${relevantKnowledge.length} relevant knowledge units:`);
  relevantKnowledge.forEach((k, i) => {
    console.log(`\n${i + 1}. Knowledge Unit (confidence: ${k.confidence.toFixed(2)})`);
    console.log(`   Pattern: ${k.pattern.substring(0, 100)}...`);
    console.log(`   Used: ${k.usageCount} times`);
  });

  // Find patterns
  console.log(`\n\n🔍 Pattern Detection:`);
  const patterns = await reasoningBank.findPatterns({
    domain: 'unit-price',
    inputFeatures: {},
    conditions: {},
  });

  patterns.forEach((match, i) => {
    console.log(`\n${i + 1}. Pattern Match (similarity: ${match.similarity.toFixed(2)})`);
    console.log(`   ${match.explanation}`);
    console.log(`   Pattern: ${match.unit.pattern.substring(0, 100)}...`);
  });

  // 7. SAFLA Evolution
  console.log(`\n\n${'═'.repeat(60)}`);
  console.log('🧬 SAFLA Evolution: Improving knowledge base...');
  console.log('═'.repeat(60));

  await reasoningBank.evolve();

  console.log('\n✅ Evolution complete!');
  console.log('\n📊 Knowledge Base Stats:');
  console.log(`   Total Knowledge Units: ${relevantKnowledge.length}`);
  console.log(`   Patterns Identified: ${patterns.length}`);
  console.log(`   Confidence Range: ${Math.min(...relevantKnowledge.map(k => k.confidence)).toFixed(2)} - ${Math.max(...relevantKnowledge.map(k => k.confidence)).toFixed(2)}`);

  console.log('\n');
  console.log('💡 SAFLA Features Demonstrated:');
  console.log('   ✅ Experience-based learning');
  console.log('   ✅ Confidence tracking');
  console.log('   ✅ Pattern recognition');
  console.log('   ✅ Knowledge evolution');
  console.log('   ✅ Automatic pruning of low-quality knowledge');
}

if (require.main === module) {
  run().catch(console.error);
}
