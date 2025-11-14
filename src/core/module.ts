import { Signature, FieldDefinition } from './signature';

/**
 * Base class for DSPy.ts modules.
 * Each module must define a signature and implement the run method.
 */
export abstract class Module<TInput extends Record<string, any>, TOutput extends Record<string, any>> {
  public readonly name: string;
  public readonly signature: Signature;
  public readonly promptTemplate: (input: TInput) => string;
  public readonly strategy: 'Predict' | 'ChainOfThought' | 'ReAct';

  constructor(options: {
    name: string;
    signature: Signature;
    promptTemplate?: (input: TInput) => string;
    strategy: 'Predict' | 'ChainOfThought' | 'ReAct';
  }) {
    this.name = options.name;
    this.signature = options.signature;
    this.promptTemplate = options.promptTemplate || ((input: TInput) => JSON.stringify(input));
    this.strategy = options.strategy;
  }

  /**
   * Runs the module on the given input.
   * @param input - The input data to process
   * @returns A promise that resolves to the output data
   */
  public abstract run(input: TInput): Promise<TOutput>;

  /**
   * Validates that the input matches the module's input signature
   */
  protected validateInput(input: TInput): void {
    for (const field of this.signature.inputs) {
      const value = input[field.name];

      // Check required fields
      if (field.required && value === undefined) {
        throw new Error(`Missing required input field: ${field.name}`);
      }

      // Skip validation for optional undefined fields
      if (value === undefined) {
        continue;
      }

      // Validate type
      switch (field.type) {
        case 'string':
          if (typeof value !== 'string') {
            throw new Error(`Invalid input: ${field.name} must be of type string`);
          }
          break;
        case 'number':
          if (typeof value !== 'number') {
            throw new Error(`Invalid input: ${field.name} must be of type number`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            throw new Error(`Invalid input: ${field.name} must be of type boolean`);
          }
          break;
        case 'object':
          if (typeof value !== 'object' || value === null) {
            throw new Error(`Invalid input: ${field.name} must be of type object`);
          }
          break;
      }
    }
  }

  /**
   * Validates that the output matches the module's output signature
   */
  protected validateOutput(output: TOutput): void {
    for (const field of this.signature.outputs) {
      const value = output[field.name];

      // Check required fields
      if (field.required && value === undefined) {
        throw new Error(`Missing required output field: ${field.name}`);
      }

      // Skip validation for optional undefined fields
      if (value === undefined) {
        continue;
      }

      // Validate type
      switch (field.type) {
        case 'string':
          if (typeof value !== 'string') {
            throw new Error(`Invalid output: ${field.name} must be of type string`);
          }
          break;
        case 'number':
          if (typeof value !== 'number') {
            throw new Error(`Invalid output: ${field.name} must be of type number`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            throw new Error(`Invalid output: ${field.name} must be of type boolean`);
          }
          break;
        case 'object':
          if (typeof value !== 'object' || value === null) {
            throw new Error(`Invalid output: ${field.name} must be of type object`);
          }
          break;
      }
    }
  }
}
