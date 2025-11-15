/**
 * MIPROv2 Optimization Demo
 *
 * Demonstrates automatic prompt optimization with MIPROv2
 */

import { MIPROv2 } from '../../../src/optimize/mipro-v2';
import { ChainOfThought } from '../../../src/modules/chain-of-thought';
import { exactMatch } from '../../../src/metrics';
import { OpenRouterLM, OpenRouterModels } from '../../../src/lm/providers/openrouter';
import { configureLM } from '../../../src/lm/base';

export default async function run() {
  console.log('🎯 Initializing MIPROv2 Optimizer...\n');

  // 1. Configure Language Model
  const lm = new OpenRouterLM({
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: process.env.MODEL || OpenRouterModels.GPT_3_5_TURBO,
    siteName: 'DSPy.ts Optimization Demo',
  });

  await lm.init();
  configureLM(lm);

  console.log(`✅ Using model: ${process.env.MODEL || OpenRouterModels.GPT_3_5_TURBO}\n`);

  // 2. Create base module to optimize
  console.log('🏗️  Creating base classification module...');

  const classifier = new ChainOfThought({
    name: 'SentimentClassifier',
    signature: {
      inputs: [
        {
          name: 'text',
          type: 'string',
          description: 'Text to classify',
          required: true,
        },
      ],
      outputs: [
        {
          name: 'sentiment',
          type: 'string',
          description: 'Sentiment (positive/negative/neutral)',
          required: true,
        },
      ],
    },
  });

  console.log('✅ Base module created\n');

  // 3. Prepare training data
  console.log('📚 Preparing training data...');

  const trainset = [
    { text: 'I love this product! It works great!', sentiment: 'positive' },
    { text: 'Terrible experience, very disappointed.', sentiment: 'negative' },
    { text: 'It is okay, nothing special.', sentiment: 'neutral' },
    { text: 'Amazing quality and fast shipping!', sentiment: 'positive' },
    { text: 'Waste of money, do not buy.', sentiment: 'negative' },
  ];

  const valset = [
    { text: 'Best purchase ever!', sentiment: 'positive' },
    { text: 'Not worth the price.', sentiment: 'negative' },
    { text: 'Average product.', sentiment: 'neutral' },
  ];

  console.log(`✅ Training set: ${trainset.length} examples`);
  console.log(`✅ Validation set: ${valset.length} examples\n`);

  // 4. Define metric
  const metric = (example: any, prediction: any) => {
    const match = example.sentiment.toLowerCase() === prediction.sentiment.toLowerCase();
    return match ? 1.0 : 0.0;
  };

  console.log('📏 Metric: Exact match on sentiment field\n');

  // 5. Test baseline performance
  console.log('═'.repeat(60));
  console.log('🔍 Baseline Performance (Before Optimization)');
  console.log('═'.repeat(60) + '\n');

  let baselineCorrect = 0;
  for (const example of valset) {
    try {
      const result = await classifier.run({ text: example.text });
      const correct = metric(example, result) === 1.0;
      baselineCorrect += correct ? 1 : 0;

      console.log(`Text: "${example.text}"`);
      console.log(`Expected: ${example.sentiment}`);
      console.log(`Predicted: ${result.sentiment}`);
      console.log(`${correct ? '✅' : '❌'} ${correct ? 'Correct' : 'Incorrect'}\n`);
    } catch (error) {
      console.error(`Error: ${error}\n`);
    }
  }

  const baselineAccuracy = baselineCorrect / valset.length;
  console.log(`Baseline Accuracy: ${(baselineAccuracy * 100).toFixed(1)}%\n`);

  // 6. Run MIPROv2 optimization
  console.log('═'.repeat(60));
  console.log('⚡ Running MIPROv2 Optimization');
  console.log('═'.repeat(60) + '\n');

  console.log('⏳ This may take a few minutes...\n');

  const optimizer = new MIPROv2({
    metric,
    auto: 'light', // Use light mode for demo (faster)
    numTrials: 5, // Reduced for demo
    numCandidates: 3,
    maxBootstrappedDemos: 2,
    maxLabeledDemos: 2,
  });

  try {
    const optimized = await optimizer.compile(classifier, trainset, valset);

    console.log('\n' + '═'.repeat(60));
    console.log('✅ Optimization Complete!');
    console.log('═'.repeat(60) + '\n');

    console.log(`Best Score: ${(optimized.score * 100).toFixed(1)}%`);
    console.log(`Improvement: ${((optimized.score - baselineAccuracy) * 100).toFixed(1)}%\n`);

    // 7. Test optimized performance
    console.log('═'.repeat(60));
    console.log('🚀 Optimized Performance (After MIPROv2)');
    console.log('═'.repeat(60) + '\n');

    let optimizedCorrect = 0;
    for (const example of valset) {
      try {
        const result = await optimized.program.run({ text: example.text });
        const correct = metric(example, result) === 1.0;
        optimizedCorrect += correct ? 1 : 0;

        console.log(`Text: "${example.text}"`);
        console.log(`Expected: ${example.sentiment}`);
        console.log(`Predicted: ${result.sentiment}`);
        console.log(`${correct ? '✅' : '❌'} ${correct ? 'Correct' : 'Incorrect'}\n`);
      } catch (error) {
        console.error(`Error: ${error}\n`);
      }
    }

    const optimizedAccuracy = optimizedCorrect / valset.length;
    console.log(`Optimized Accuracy: ${(optimizedAccuracy * 100).toFixed(1)}%\n`);

    // 8. Summary
    console.log('═'.repeat(60));
    console.log('📊 Optimization Summary');
    console.log('═'.repeat(60) + '\n');

    console.log(`Before: ${(baselineAccuracy * 100).toFixed(1)}% accuracy`);
    console.log(`After:  ${(optimizedAccuracy * 100).toFixed(1)}% accuracy`);
    console.log(`Change: ${((optimizedAccuracy - baselineAccuracy) * 100).toFixed(1)}% ${optimizedAccuracy > baselineAccuracy ? '📈' : optimizedAccuracy < baselineAccuracy ? '📉' : '➡️'}`);
  } catch (error) {
    console.error(`\n❌ Optimization failed: ${error}`);
  }

  console.log('\n');
  console.log('💡 MIPROv2 Features:');
  console.log('   ✅ Automatic instruction generation');
  console.log('   ✅ Few-shot demonstration bootstrapping');
  console.log('   ✅ Bayesian optimization');
  console.log('   ✅ Minibatch evaluation');
  console.log('   ✅ Multi-mode (light/medium/heavy)');
}

if (require.main === module) {
  run().catch(console.error);
}
