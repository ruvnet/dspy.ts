/**
 * Refine Module - DSPy.ts
 *
 * Implements the Refine module for self-refinement based on constraints and feedback.
 * Replaces the deprecated Assert/Suggest system in DSPy Python.
 * Compatible with DSPy Python's dspy.Refine module.
 *
 * Usage:
 *   const refiner = new Refine({
 *     name: 'Refiner',
 *     signature: { ... },
 *     constraints: [...]
 *   });
 *   const result = await refiner.run({ input: "..." });
 */

import { Module } from '../core/module';
import { Signature } from '../core/signature';
import { getLM } from '../lm/base';

export type ValidationResult = {
  valid: boolean;
  message?: string;
  suggestions?: string[];
};

export type ConstraintFunction<TOutput> = (output: TOutput) => ValidationResult | boolean;

export interface Constraint<TOutput> {
  /**
   * Validation function
   */
  validate: ConstraintFunction<TOutput>;

  /**
   * Error message when constraint is violated
   */
  message: string;

  /**
   * Whether this is a hard constraint (stops on failure) or soft (continues with feedback)
   */
  hard?: boolean;

  /**
   * Suggestions for fixing the violation
   */
  suggestions?: string[];
}

export interface RefineConfig<TOutput> {
  /**
   * Module name
   */
  name: string;

  /**
   * Input/output signature
   */
  signature: Signature;

  /**
   * Constraints to enforce
   */
  constraints?: Constraint<TOutput>[];

  /**
   * Maximum refinement iterations (default: 3)
   */
  maxIterations?: number;

  /**
   * Base module to refine (defaults to Predict)
   */
  baseModule?: Module<any, TOutput>;

  /**
   * Strategy to use (default: 'ChainOfThought')
   */
  strategy?: 'Predict' | 'ChainOfThought' | 'ReAct';
}

export interface RefinementStep<TOutput> {
  iteration: number;
  output: TOutput;
  violations: Array<{
    constraint: string;
    message: string;
    suggestions?: string[];
  }>;
  refined: boolean;
}

/**
 * Refine Module
 *
 * This module implements self-refinement with constraints. It generates
 * an initial output, checks it against constraints, and iteratively
 * refines it based on feedback until all constraints are satisfied
 * or max iterations are reached.
 *
 * Features:
 * - Hard constraints (must be satisfied)
 * - Soft constraints (suggestions for improvement)
 * - Iterative refinement with feedback
 * - Automatic prompt construction
 *
 * @example
 * ```typescript
 * const refiner = new Refine({
 *   name: 'EmailWriter',
 *   signature: {
 *     inputs: [{ name: 'topic', type: 'string', required: true }],
 *     outputs: [{ name: 'email', type: 'string', required: true }]
 *   },
 *   constraints: [
 *     {
 *       validate: (output) => output.email.length <= 500,
 *       message: 'Email must be 500 characters or less',
 *       hard: true
 *     },
 *     {
 *       validate: (output) => output.email.includes('Sincerely'),
 *       message: 'Email should include a closing',
 *       hard: false,
 *       suggestions: ['Add "Sincerely," at the end']
 *     }
 *   ],
 *   maxIterations: 3
 * });
 *
 * const result = await refiner.run({ topic: 'Project update' });
 * console.log(result.email);
 * console.log(result.refinementSteps); // Shows the refinement process
 * ```
 */
export class Refine<TInput, TOutput> extends Module<
  TInput,
  TOutput & { refinementSteps: RefinementStep<TOutput>[] }
> {
  private constraints: Constraint<TOutput>[];
  private maxIterations: number;
  private baseModule?: Module<any, TOutput>;

  constructor(config: RefineConfig<TOutput>) {
    super({
      name: config.name,
      signature: config.signature,
      strategy: config.strategy || 'ChainOfThought',
    });

    this.constraints = config.constraints || [];
    this.maxIterations = config.maxIterations || 3;
    this.baseModule = config.baseModule;
  }

  /**
   * Add a constraint
   */
  addConstraint(constraint: Constraint<TOutput>): void {
    this.constraints.push(constraint);
  }

  /**
   * Run the Refine module
   */
  async run(input: TInput): Promise<TOutput & { refinementSteps: RefinementStep<TOutput>[] }> {
    const steps: RefinementStep<TOutput>[] = [];
    let currentOutput: TOutput | null = null;
    let previousFeedback: string[] = [];

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      // Generate or refine output
      const prompt = this.buildRefinePrompt(input, currentOutput, previousFeedback);
      const newOutput = await this.generateOutput(prompt);

      // Validate against constraints
      const violations = this.validateConstraints(newOutput);

      // Record step
      steps.push({
        iteration,
        output: newOutput,
        violations: violations.map((v) => ({
          constraint: v.constraint.message,
          message: v.result.message || v.constraint.message,
          suggestions: v.result.suggestions || v.constraint.suggestions,
        })),
        refined: iteration > 0,
      });

      // Check for hard constraint violations
      const hardViolations = violations.filter((v) => v.constraint.hard);
      if (hardViolations.length === 0) {
        // All hard constraints satisfied, return result
        return {
          ...newOutput,
          refinementSteps: steps,
        } as any;
      }

      // Prepare feedback for next iteration
      previousFeedback = violations.map((v) => {
        const msg = v.result.message || v.constraint.message;
        const suggestions = v.result.suggestions || v.constraint.suggestions || [];
        return suggestions.length > 0 ? `${msg} Suggestions: ${suggestions.join(', ')}` : msg;
      });

      currentOutput = newOutput;
    }

    // Max iterations reached - return best attempt
    console.warn(
      `Refine: Maximum iterations (${this.maxIterations}) reached with ${this.constraints.length} constraint violations`
    );

    return {
      ...currentOutput!,
      refinementSteps: steps,
    } as any;
  }

  /**
   * Build refinement prompt
   */
  private buildRefinePrompt(input: TInput, previousOutput: TOutput | null, feedback: string[]): string {
    const inputStr = this.signature.inputs
      .map((field) => {
        const value = (input as any)[field.name];
        return `${field.name}: ${value}`;
      })
      .join('\n');

    const outputFields = this.signature.outputs.map((field) => field.name).join(', ');

    let prompt = '';

    if (previousOutput === null) {
      // Initial generation
      prompt = `Generate a response for the following input.

Input:
${inputStr}

Required outputs: ${outputFields}

${this.formatConstraints()}

Your response:`;
    } else {
      // Refinement
      const previousStr = this.signature.outputs
        .map((field) => {
          const value = (previousOutput as any)[field.name];
          return `${field.name}: ${value}`;
        })
        .join('\n');

      prompt = `Refine the following response based on the feedback provided.

Original Input:
${inputStr}

Previous Response:
${previousStr}

Feedback:
${feedback.map((f, i) => `${i + 1}. ${f}`).join('\n')}

${this.formatConstraints()}

Refined response:`;
    }

    return prompt;
  }

  /**
   * Format constraints for the prompt
   */
  private formatConstraints(): string {
    if (this.constraints.length === 0) {
      return '';
    }

    const constraintList = this.constraints
      .map((c, i) => {
        const type = c.hard ? '[REQUIRED]' : '[SUGGESTED]';
        return `${i + 1}. ${type} ${c.message}`;
      })
      .join('\n');

    return `Constraints:
${constraintList}`;
  }

  /**
   * Generate output using LM
   */
  private async generateOutput(prompt: string): Promise<TOutput> {
    const lm = getLM();

    const response = await lm.generate(prompt, {
      maxTokens: 1000,
      temperature: 0.7,
    });

    // Parse response into output fields
    return this.parseResponse(response);
  }

  /**
   * Parse LM response into output object
   */
  private parseResponse(response: string): TOutput {
    const output: Record<string, any> = {};

    for (const field of this.signature.outputs) {
      // Try to extract field value from response
      const pattern = new RegExp(`${field.name}:\\s*(.+?)(?=\\n[a-z]+:|$)`, 'is');
      const match = response.match(pattern);

      if (match) {
        output[field.name] = match[1].trim();
      } else {
        // Fallback: use entire response for first output field
        if (this.signature.outputs.indexOf(field) === 0) {
          output[field.name] = response.trim();
        } else {
          output[field.name] = '';
        }
      }
    }

    return output as TOutput;
  }

  /**
   * Validate output against constraints
   */
  private validateConstraints(
    output: TOutput
  ): Array<{ constraint: Constraint<TOutput>; result: ValidationResult }> {
    const violations: Array<{ constraint: Constraint<TOutput>; result: ValidationResult }> = [];

    for (const constraint of this.constraints) {
      const result = constraint.validate(output);

      let validationResult: ValidationResult;
      if (typeof result === 'boolean') {
        validationResult = { valid: result };
      } else {
        validationResult = result;
      }

      if (!validationResult.valid) {
        violations.push({ constraint, result: validationResult });
      }
    }

    return violations;
  }
}

/**
 * Utility function: Create a length constraint
 */
export function lengthConstraint<TOutput>(
  fieldName: keyof TOutput,
  maxLength: number,
  hard: boolean = true
): Constraint<TOutput> {
  return {
    validate: (output) => {
      const value = output[fieldName];
      if (typeof value === 'string') {
        return value.length <= maxLength;
      }
      return true;
    },
    message: `${String(fieldName)} must be ${maxLength} characters or less`,
    hard,
  };
}

/**
 * Utility function: Create a pattern constraint
 */
export function patternConstraint<TOutput>(
  fieldName: keyof TOutput,
  pattern: RegExp,
  message: string,
  hard: boolean = false
): Constraint<TOutput> {
  return {
    validate: (output) => {
      const value = output[fieldName];
      if (typeof value === 'string') {
        return pattern.test(value);
      }
      return true;
    },
    message,
    hard,
  };
}
