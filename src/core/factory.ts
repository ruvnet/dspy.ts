import { Module } from './module';
import { Signature } from './signature';
import { PredictModule } from '../modules/predict';

/**
 * Options for creating a module
 */
export interface ModuleOptions<TInput extends Record<string, any>> {
  name: string;
  signature: Signature;
  promptTemplate: (input: TInput) => string;
  strategy?: 'Predict' | 'ChainOfThought' | 'ReAct';
}

/**
 * Factory function to create modules based on strategy
 */
export function defineModule<TInput extends Record<string, any>, TResult extends Record<string, any>>(
  options: ModuleOptions<TInput>
): Module<TInput, TResult> {
  const strategy = options.strategy || 'Predict';

  switch (strategy) {
    case 'Predict':
      return new PredictModule<TInput, TResult>(options);
    
    case 'ChainOfThought':
    case 'ReAct':
      // These will be implemented in future phases
      throw new Error(`Strategy ${strategy} not yet implemented`);
    
    default:
      throw new Error(`Unknown strategy: ${strategy}`);
  }
}
