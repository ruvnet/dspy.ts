/**
 * RAG with AgentDB Demo
 *
 * Demonstrates Retrieval-Augmented Generation using AgentDB vector search
 */

import { Retrieve } from '../../../src/modules/retrieve';
import { ChainOfThought } from '../../../src/modules/chain-of-thought';
import { Pipeline } from '../../../src/core/pipeline';
import { AgentDBClient } from '../../../src/memory/agentdb/client';
import { OpenRouterLM, OpenRouterModels } from '../../../src/lm/providers/openrouter';
import { configureLM } from '../../../src/lm/base';

export default async function run() {
  console.log('🔍 Initializing RAG System with AgentDB...\n');

  // 1. Configure Language Model
  const lm = new OpenRouterLM({
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: process.env.MODEL || OpenRouterModels.GPT_3_5_TURBO,
    siteName: 'DSPy.ts RAG Demo',
  });

  await lm.init();
  configureLM(lm);

  console.log(`✅ Using model: ${process.env.MODEL || OpenRouterModels.GPT_3_5_TURBO}\n`);

  // 2. Initialize AgentDB
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

  // 3. Create knowledge base
  console.log('📚 Creating knowledge base...');

  const knowledgeBase = [
    {
      text: 'DSPy.ts is a TypeScript framework for programming language models. It provides declarative modules that automatically optimize themselves.',
      metadata: { topic: 'dspy', category: 'introduction' },
    },
    {
      text: 'AgentDB is a vector database that provides 150x faster search capabilities with caching and MCP tool support.',
      metadata: { topic: 'agentdb', category: 'features' },
    },
    {
      text: 'ReasoningBank implements the SAFLA algorithm for self-learning and knowledge evolution over time.',
      metadata: { topic: 'reasoning-bank', category: 'features' },
    },
    {
      text: 'Chain-of-Thought is a module that teaches language models to think step-by-step before providing answers.',
      metadata: { topic: 'chain-of-thought', category: 'modules' },
    },
    {
      text: 'MIPROv2 is an optimizer that uses Bayesian optimization to find the best instructions and demonstrations for your AI pipeline.',
      metadata: { topic: 'miprov2', category: 'optimizers' },
    },
  ];

  // 4. Initialize Retrieve module
  const retriever = new Retrieve({
    k: 3,
    threshold: 0.3,
    rerank: true,
  });

  await retriever.init(agentDB);

  // Simple embedding function for demo (must be async)
  const simpleEmbed = async (text: string): Promise<number[]> => {
    const vector = new Array(384).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length; j++) {
        const charCode = word.charCodeAt(j);
        vector[(i * word.length + j) % 384] += charCode / 1000;
      }
    }

    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map((val) => val / (magnitude || 1));
  };

  // Store knowledge
  await retriever.store(knowledgeBase, simpleEmbed);
  console.log(`✅ Stored ${knowledgeBase.length} documents\n`);

  // 5. Create RAG pipeline
  console.log('🔧 Building RAG pipeline...');

  const ragSystem = new ChainOfThought({
    name: 'RAGSystem',
    signature: {
      inputs: [
        {
          name: 'question',
          type: 'string',
          description: 'User question',
          required: true,
        },
        {
          name: 'context',
          type: 'string',
          description: 'Retrieved context',
          required: true,
        },
      ],
      outputs: [
        {
          name: 'answer',
          type: 'string',
          description: 'Answer based on context',
          required: true,
        },
        {
          name: 'sources',
          type: 'string',
          description: 'Which context was most relevant',
          required: false,
        },
      ],
    },
  });

  console.log('✅ RAG pipeline ready\n');

  // 6. Demo queries
  const queries = [
    'What is DSPy.ts?',
    'Tell me about AgentDB features',
    'How does optimization work in DSPy?',
  ];

  console.log('🔍 Running RAG queries:\n');

  for (const query of queries) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Query: ${query}`);
    console.log('═'.repeat(60));

    try {
      // Retrieve relevant passages
      const retrieved = await retriever.run({ query });

      console.log(`\n📊 Retrieved ${retrieved.passages.length} passages:`);
      retrieved.passages.forEach((p, i) => {
        console.log(`\n${i + 1}. [Score: ${p.score.toFixed(3)}]`);
        console.log(`   ${p.passage.substring(0, 100)}...`);
      });

      // Build context from passages
      const context = retrieved.passages.map((p, i) => `[${i + 1}] ${p.passage}`).join('\n\n');

      // Generate answer with context
      const result = await ragSystem.run({
        question: query,
        context,
      });

      console.log('\n💭 Reasoning:');
      console.log(result.reasoning);

      console.log('\n✨ Answer:');
      console.log(result.answer);

      if (result.sources) {
        console.log(`\n📚 Sources used: ${result.sources}`);
      }
    } catch (error) {
      console.error(`\n❌ Error: ${error}`);
    }
  }

  console.log('\n');
  console.log('💡 Tips:');
  console.log('   - AgentDB caches searches for 15 minutes');
  console.log('   - Reranking improves relevance of results');
  console.log('   - Adjust k and threshold for different use cases');
}

if (require.main === module) {
  run().catch(console.error);
}
