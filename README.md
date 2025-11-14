# DSPy.ts 🚀

[![npm version](https://badge.fury.io/js/dspy.ts.svg)](https://www.npmjs.com/package/dspy.ts)
[![npm downloads](https://img.shields.io/npm/dm/dspy.ts.svg)](https://www.npmjs.com/package/dspy.ts)
[![GitHub stars](https://img.shields.io/github/stars/ruvnet/dspy.ts.svg?style=social&label=Star)](https://github.com/ruvnet/dspy.ts)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Build Status](https://img.shields.io/github/workflow/status/ruvnet/dspy.ts/CI)](https://github.com/ruvnet/dspy.ts/actions)

DSPy.ts helps you build powerful AI applications right in your web browser. It's based on Stanford's DSPy framework but made specifically for JavaScript and TypeScript developers. Unlike traditional AI frameworks that require expensive servers and complex infrastructure, DSPy.ts lets you create and run sophisticated AI models directly in your users' browsers. This means you can build everything from smart chatbots to image recognition systems that work entirely on your users' devices, making your AI applications faster, cheaper, and more private.

Here's what makes it special:

- **Run AI Models in Your Browser**: Build and run complete AI models (both applied and generative) directly in your users' browsers - no server needed!
- **Use Your Device's Power**: Takes advantage of your computer's GPU or CPU to run AI tasks faster
- **Save Money**: Cut costs by running AI on users' devices instead of expensive cloud servers
- **Works Everywhere**: Run the same models on computers, phones, or IoT devices
- **Easy to Use**: Write clean TypeScript code instead of complex AI prompts

**created by rUv, cause he could.**

## Quick Install

```bash
npm install dspy.ts
```

## What is DSPy.ts?

DSPy.ts stands for **Declarative Self-improving TypeScript**. It makes building AI apps easier by:

1. **Simple Code Instead of Prompts**: Write clear TypeScript code instead of complex prompts
2. **Gets Better Over Time**: Your AI learns and improves automatically as you use it
3. **Catches Mistakes Early**: TypeScript helps prevent errors before running your code
4. **Works Everywhere**: buid & Run AI models right in your browser:
   - **Fast Local Processing**: Run models directly on your device, no server needed
   - **Uses Your Graphics Card**: Speed up AI tasks using your computer's GPU
   - **Backup Cloud Option**: Switch to cloud services when you need more power

Key Benefits:
- Run AI models without a server
- Fast performance using your device's hardware
- Save memory with optimized models
- Works in any modern browser
- Easy to test and debug
- Simple to deploy and scale

## Integrations & Ecosystem

DSPy.ts seamlessly integrates with:

- **ONNX Runtime Web**: Run models locally in browsers and Node.js
- **js-pytorch**: Use PyTorch models directly in JavaScript
- **OpenRouter**: Access various LLM providers
- **Vector Databases**: Connect with Pinecone, Weaviate, etc.
- **Development Tools**: VS Code extensions, ESLint rules
- **Monitoring**: Prometheus, Grafana dashboards

## Agentic Systems

Build sophisticated AI agents that can:

1. **Reason & Act**: Use the ReAct pattern for structured thinking
2. **Use Tools**: Integrate with APIs, databases, and external services
3. **Learn & Improve**: Automatically optimize performance
4. **Chain Thoughts**: Break complex tasks into manageable steps

Example of an agentic system:
```typescript
// Create a research agent with tools
const researcher = new ReActModule({
  tools: [
    new WebSearch(),
    new PDFReader(),
    new Summarizer(),
    new CitationManager()
  ],
  strategy: 'ReAct',
  optimization: {
    metric: accuracyMetric,
    method: 'BootstrapFewShot'
  }
});

// The agent can:
// 1. Search for relevant papers
// 2. Read and understand PDFs
// 3. Generate summaries
// 4. Manage citations
// 5. Learn from feedback
```


## 🌟 Why DSPy.ts?

1. **Programming, Not Prompting**: Focus on building modular AI systems with code, not strings
2. **Self-Improving**: Automatically optimize prompts and weights based on your metrics
3. **Type-Safe**: Catch errors at compile time with TypeScript's static typing
4. **Local Inference**: Run models locally with ONNX Runtime Web and js-pytorch
5. **Production Ready**: Built for enterprise deployment with monitoring and scaling

## 🚀 Quick Start

```bash
npm install dspy.ts onnxruntime-web js-pytorch
```

```typescript
import { PredictModule, configureLM, ONNXModel } from 'dspy.ts';

// Configure local inference with ONNX Runtime
const model = new ONNXModel({
  modelPath: 'path/to/model.onnx',
  executionProvider: 'wasm'
});
configureLM(model);

// Create a self-improving module
class MathSolver extends PredictModule {
  constructor() {
    super({
      name: 'MathSolver',
      signature: {
        inputs: [{ name: 'question', type: 'string' }],
        outputs: [
          { name: 'reasoning', type: 'string' },
          { name: 'answer', type: 'number' }
        ]
      },
      strategy: 'ChainOfThought'
    });
  }
}

// Use and optimize the module
const solver = new MathSolver();
const optimizer = new BootstrapFewShot(exactMatchMetric);
const optimizedSolver = await optimizer.compile(solver, trainset);
```

## 🎯 Core Concepts

### 1. Declarative Modules
Build AI systems as composable TypeScript modules:
```typescript
// Question answering with context
const qa = new Pipeline([
  new ContextRetriever(),
  new QuestionAnswerer(),
  new ResponseValidator()
]);
```

### 2. Self-Improvement
Automatically optimize your systems:
```typescript
// Optimize with few-shot learning
const optimizer = new BootstrapFewShot(metric);
const betterQA = await optimizer.compile(qa, examples);
```

### 3. Local & Cloud Flexibility
Choose your execution environment:
```typescript
// Local inference with ONNX
const localLM = new ONNXModel({
  modelPath: 'model.onnx',
  executionProvider: 'wasm'
});

// Cloud fallback
const cloudLM = new OpenRouterLM(API_KEY);
```

## 💡 Key Features

### 1. Type-Safe AI Programming
- Catch errors at compile time
- Validate inputs/outputs automatically
- Ensure consistent data flow

### 2. Self-Improving Systems
- Automatic few-shot learning
- Metric-based optimization
- Continuous improvement

### 3. Local Inference
- ONNX Runtime integration
- Complete neural network execution in browser
- Browser and Node.js compatibility

### 4. Enterprise Ready
- Production monitoring
- Error handling
- Scalable deployment

## 📈 Use Cases & Performance

### Performance Metrics

| Task Type | Model | Local (ONNX) | Cloud API | Memory Usage | Optimization Gain |
|-----------|-------|--------------|-----------|--------------|------------------|
| QA (RAG) | BERT | 80-150ms | 500-800ms | 150-300MB | +15-25% accuracy |
| Classification | DistilBERT | 30-50ms | 300-500ms | 80-120MB | +10-20% accuracy |
| Agents | GPT-2 | 100-200ms | 600-1000ms | 200-400MB | +20-30% success |
| Generation | T5 | 150-250ms | 700-1200ms | 250-500MB | +15-25% quality |

*Benchmarks run on standard hardware (4-core CPU, 16GB RAM). Local inference uses ONNX Runtime with WASM backend.*

### 1. Enterprise Applications

#### Customer Service
```typescript
// Intelligent support agent
const supportAgent = new Pipeline([
  new IntentClassifier(),
  new ContextRetriever({ source: 'knowledge-base' }),
  new ResponseGenerator({ style: 'professional' }),
  new SentimentValidator()
]);

// Optimize for your metrics
const optimizer = new BootstrapFewShot(satisfactionMetric);
const betterAgent = await optimizer.compile(supportAgent, examples);
```

#### Document Processing
```typescript
// Automated document analysis
const docProcessor = new Pipeline([
  new DocumentParser(),
  new EntityExtractor(),
  new RelationshipMapper(),
  new SummaryGenerator()
]);
```

### 2. Development Tools

#### Code Assistant
```typescript
// Intelligent coding assistant
const codeAssistant = new ReActModule({
  tools: [
    new CodeAnalyzer(),
    new TestGenerator(),
    new DocumentationWriter()
  ],
  strategy: 'ReAct'
});
```

#### API Generation
```typescript
// OpenAPI spec generator
const apiGenerator = new Pipeline([
  new SchemaAnalyzer(),
  new EndpointDesigner(),
  new DocumentationBuilder()
]);
```

### 3. Content & Marketing

#### Multi-Channel Content
```typescript
// Cross-platform content generator
const contentEngine = new Pipeline([
  new TopicExpander(),
  new ContentGenerator({
    variants: ['blog', 'social', 'email']
  }),
  new ToneOptimizer(),
  new SEOEnhancer()
]);
```

#### Market Analysis
```typescript
// Market intelligence system
const marketAnalyzer = new Pipeline([
  new DataCollector({ sources: ['news', 'social', 'reports'] }),
  new TrendAnalyzer(),
  new InsightGenerator(),
  new RecommendationEngine()
]);
```

### 4. Research & Analysis

#### Academic Research
```typescript
// Research assistant
const researchAssistant = new ReActModule({
  tools: [
    new PaperSearch(),
    new CitationAnalyzer(),
    new SummaryGenerator(),
    new BibtexFormatter()
  ],
  strategy: 'ChainOfThought'
});
```

#### Data Analysis
```typescript
// Automated data analysis
const dataAnalyst = new Pipeline([
  new DataCleaner(),
  new StatisticalAnalyzer(),
  new VisualizationGenerator(),
  new InsightExtractor()
]);
```

## 🔧 Technical Benefits

### 1. ONNX Integration
- Run models locally
- Hardware acceleration
- Build & run both applied and generative models
- Reduced latency

### 2. js-pytorch Support
- Direct PyTorch model usage
- Leverage client GPU/CPU resources
- Efficient inference
- Edge computing across devices (computers, mobile, IoT)

### 3. Enterprise Features
- Monitoring & logging
- Error recovery
- Load balancing
- Reduced infrastructure costs through edge computing

## 📚 Documentation

- [Getting Started](docs/guides/getting-started.md)
- [API Reference](docs/api/README.md)
- [Examples](docs/examples/README.md)
- [Deployment Guide](docs/guides/deployment.md)

## 🤝 Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

DSPy.ts is MIT licensed. See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

DSPy.ts is inspired by Stanford's [DSPy](https://github.com/stanfordnlp/dspy) project, bringing its powerful concepts of declarative, self-improving AI systems to the JavaScript ecosystem. We extend our gratitude to the Stanford NLP group and the DSPy community.
