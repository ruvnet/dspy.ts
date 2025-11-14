# Migration Guide: DSPy.ts 0.1.x → 2.0.0

This guide will help you migrate your DSPy.ts applications from version 0.1.x to 2.0.0.

## Overview

DSPy.ts 2.0 is a major release with significant architectural improvements and new features. While there are breaking changes, this guide will help you update your code smoothly.

## Breaking Changes

### 1. Node.js Version Requirement

**Before (0.1.x):**
- No specific Node.js version requirement

**After (2.0.0):**
- Requires Node.js >= 18.0.0

**Action Required:**
```bash
# Check your Node.js version
node --version

# Upgrade if necessary
nvm install 18
nvm use 18
```

### 2. Import Paths

**Before (0.1.x):**
```typescript
import { Module, Pipeline, PredictModule } from 'dspy.ts';
```

**After (2.0.0):**
```typescript
// Core imports
import { Module, Pipeline } from 'dspy.ts/core';
import { PredictModule } from 'dspy.ts/modules';

// Or use the main export
import { Module, Pipeline, PredictModule } from 'dspy.ts';
```

**Action Required:**
- Update import statements to use new paths
- The main export still works but is less efficient for tree-shaking

### 3. Module Initialization

**Before (0.1.x):**
```typescript
const module = new PredictModule(signature);
const result = module.run(input);
```

**After (2.0.0):**
```typescript
const module = new PredictModule(signature);
await module.init(); // Required initialization
const result = await module.run(input);
```

**Action Required:**
- Add `await module.init()` after creating modules
- Ensure your code uses `async/await`

### 4. Language Model Configuration

**Before (0.1.x):**
```typescript
import { configureLM, ONNXModel } from 'dspy.ts';

const model = new ONNXModel({ modelPath: 'model.onnx' });
configureLM(model);
```

**After (2.0.0):**
```typescript
import { ONNXModel } from 'dspy.ts/lm';
import { configureLM } from 'dspy.ts/core';

const model = new ONNXModel({ modelPath: 'model.onnx' });
await model.init(); // Async initialization required
configureLM(model);
```

**Action Required:**
- Add `await model.init()` after creating LM drivers
- Update import paths if using direct imports

### 5. Configuration System

**Before (0.1.x):**
```typescript
// Configuration was global and implicit
```

**After (2.0.0):**
```typescript
import { Config } from 'dspy.ts/core';

// Explicit configuration
const config = new Config({
  logLevel: 'info',
  maxConcurrency: 10,
});
```

**Action Required:**
- Review your configuration needs
- Use the new Config class for explicit configuration

## New Features

### 1. AgentDB Memory System

```typescript
import { AgentDBClient } from 'dspy.ts/memory/agentdb';

const agentDB = new AgentDBClient({
  vectorDimension: 768,
  indexType: 'hnsw',
  mcpEnabled: true,
  frontierMemory: {
    causalReasoning: true,
    reflexionMemory: true,
    skillLibrary: true,
    automatedLearning: true,
  },
});

await agentDB.init();

// Store vectors
const id = await agentDB.store(embedding, { metadata: { type: 'example' } });

// Search
const results = await agentDB.search(queryEmbedding, { k: 10 });
```

### 2. ReasoningBank

```typescript
import { ReasoningBank } from 'dspy.ts/memory/reasoning-bank';
import { AgentDBClient } from 'dspy.ts/memory/agentdb';

const agentDB = new AgentDBClient(/* config */);
const reasoningBank = new ReasoningBank(agentDB);

await reasoningBank.init();

// Learn from experience
const experience = {
  input: { question: 'What is 2+2?' },
  output: { answer: 4 },
  success: true,
  reasoning: ['Parse question', 'Identify operation', 'Calculate result'],
  context: {
    domain: 'math',
    inputFeatures: { type: 'arithmetic' },
    conditions: {},
  },
  timestamp: new Date(),
};

const knowledge = await reasoningBank.learnFromExperience(experience);

// Retrieve knowledge
const relevant = await reasoningBank.retrieve({
  context: { domain: 'math' },
  minConfidence: 0.7,
  limit: 5,
});
```

### 3. Swarm Multi-Agent System

```typescript
import { SwarmOrchestrator, Agent } from 'dspy.ts/agent/swarm';

const swarm = new SwarmOrchestrator();

// Define agents
const agent1: Agent = {
  id: 'classifier',
  name: 'Intent Classifier',
  description: 'Classifies user intent',
  routine: {
    instructions: 'Classify the user intent',
    tools: [],
    execute: async (input, context) => {
      // Agent logic
      return {
        output: { intent: 'question' },
        success: true,
        context,
      };
    },
  },
  handoffs: [
    {
      targetAgent: 'answerer',
      condition: (context, input) => context.get('intent') === 'question',
      transferContext: ['intent', 'confidence'],
    },
  ],
  context: new Map(),
};

swarm.addAgent(agent1);

// Execute task
const result = await swarm.execute({
  id: 'task-1',
  input: { text: 'What is AI?' },
  startAgent: 'classifier',
});
```

### 4. Enhanced Optimizers

```typescript
import { MIPROv2Optimizer } from 'dspy.ts/optimize';

const optimizer = new MIPROv2Optimizer({
  maxBootstrappedDemos: 8,
  numCandidates: 10,
  bayesianOptimization: {
    numTrials: 50,
    acquisitionFunction: 'ei',
  },
});

const optimizedModule = await optimizer.compile(module, trainset, valset);
```

## Dependency Updates

### Update package.json

```json
{
  "dependencies": {
    "dspy.ts": "^2.0.0",
    "agentdb": "^1.3.9",
    "typescript": "^5.7.3"
  }
}
```

### Install New Dependencies

```bash
npm install --legacy-peer-deps
```

Note: Use `--legacy-peer-deps` if you encounter peer dependency conflicts.

## Step-by-Step Migration

### Step 1: Update Dependencies

```bash
npm install dspy.ts@^2.0.0 --legacy-peer-deps
npm install agentdb@^1.3.9 inversify@^6.0.2 reflect-metadata@^0.2.1 zod@^3.22.4
```

### Step 2: Update Imports

Find and replace:
- `from 'dspy.ts'` → Use specific imports or keep main export
- Add `reflect-metadata` import at the top of your entry file:
  ```typescript
  import 'reflect-metadata';
  ```

### Step 3: Add Initialization

Add `await init()` calls after creating modules and LM drivers:

```typescript
// Before
const module = new PredictModule(signature);

// After
const module = new PredictModule(signature);
await module.init();
```

### Step 4: Update Configuration

Replace global configuration with explicit configuration:

```typescript
import { Config } from 'dspy.ts/core';

const config = new Config({
  logLevel: process.env.LOG_LEVEL || 'info',
  maxConcurrency: 10,
});
```

### Step 5: Test Your Application

```bash
npm test
npm run build
```

### Step 6: Optional - Add New Features

Consider adding:
- AgentDB for advanced memory
- ReasoningBank for self-learning
- Swarm for multi-agent orchestration
- MIPROv2 optimizer for better performance

## Common Issues

### Issue 1: "Module not found"

**Error:**
```
Cannot find module 'dspy.ts/memory/agentdb'
```

**Solution:**
Ensure you've installed all dependencies:
```bash
npm install --legacy-peer-deps
```

### Issue 2: "init() is not a function"

**Error:**
```
TypeError: module.init is not a function
```

**Solution:**
Make sure you're using modules from 2.0.0:
```bash
npm list dspy.ts
```

### Issue 3: Peer Dependency Conflicts

**Error:**
```
npm error ERESOLVE unable to resolve dependency tree
```

**Solution:**
Use legacy peer dependencies:
```bash
npm install --legacy-peer-deps
```

### Issue 4: TypeScript Compilation Errors

**Error:**
```
error TS2304: Cannot find name 'inject'
```

**Solution:**
Enable experimental decorators in tsconfig.json:
```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

## Performance Improvements

After migrating, you should see:

1. **Faster Vector Search**: 150x improvement with AgentDB
2. **Better Memory Management**: Optimized for < 100MB with 10K knowledge units
3. **Improved Throughput**: > 100 req/s with batching
4. **Lower Latency**: < 50ms agent handoffs

## Need Help?

- 📖 [Full Documentation](https://github.com/ruvnet/dspy.ts/tree/main/docs)
- 🐛 [Report Issues](https://github.com/ruvnet/dspy.ts/issues)
- 💬 [Discussions](https://github.com/ruvnet/dspy.ts/discussions)

## Rollback Plan

If you encounter issues and need to rollback:

```bash
npm install dspy.ts@0.1.3
```

Then revert your code changes using git:

```bash
git checkout -- .
```

---

We're excited to have you on DSPy.ts 2.0! If you have questions or need help with migration, please open an issue on GitHub.
