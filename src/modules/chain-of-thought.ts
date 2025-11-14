/**
 * ChainOfThought Module
 *
 * Implements the Chain-of-Thought prompting strategy where the model
 * is encouraged to show its reasoning step-by-step before providing an answer.
 */

import { Module } from '../core/module';
import { Signature } from '../core/signature';
import { getLM } from '../lm';

/**
 * Chain-of-Thought module that extends predictions with reasoning
 */
export class ChainOfThought<
  TInput extends Record<string, any>,
  TOutput extends Record<string, any>
> extends Module<TInput, TOutput & { reasoning: string }> {
  /**
   * Create a ChainOfThought module
   * @param config Module configuration with signature
   */
  constructor(config: {
    name: string;
    signature: Signature;
    strategy?: 'ChainOfThought';
  }) {
    super({
      ...config,
      strategy: 'ChainOfThought',
    });

    // Extend signature to include reasoning output
    this.extendSignatureWithReasoning();
  }

  /**
   * Extend the signature to include a reasoning field
   */
  private extendSignatureWithReasoning(): void {
    // Check if reasoning field already exists
    const hasReasoning = this.signature.outputs.some(
      (field) => field.name === 'reasoning'
    );

    if (!hasReasoning) {
      // Add reasoning as the first output field
      this.signature.outputs = [
        {
          name: 'reasoning',
          type: 'string',
          description:
            'Step-by-step reasoning process leading to the answer. Think through the problem carefully.',
          required: true,
        },
        ...this.signature.outputs,
      ];
    }
  }

  /**
   * Execute the Chain-of-Thought module
   */
  async run(input: TInput): Promise<TOutput & { reasoning: string }> {
    // Validate input
    this.validateInput(input);

    // Get language model
    const lm = getLM();
    if (!lm) {
      throw new Error('No language model configured. Call configureLM() first.');
    }

    // Build Chain-of-Thought prompt
    const prompt = this.buildCoTPrompt(input);

    // Generate response
    const response = await lm.generate(prompt, {
      temperature: 0.7, // Slightly higher for reasoning
      maxTokens: 1000, // More tokens for reasoning
    });

    // Parse response
    const output = this.parseCoTResponse(response);

    // Validate output (cast to any to handle generic constraints)
    this.validateOutput(output as any);

    return output as any;
  }

  /**
   * Build a Chain-of-Thought prompt
   */
  private buildCoTPrompt(input: TInput): string {
    const parts: string[] = [];

    // Add instruction emphasizing reasoning
    parts.push('You are an AI assistant that thinks step-by-step.');
    parts.push(
      'Before providing your answer, explain your reasoning process clearly.'
    );
    parts.push('');

    // Add task description
    parts.push('Task:');
    parts.push(
      this.signature.outputs
        .map((o) => `- ${o.name}: ${o.description || 'provide this output'}`)
        .join('\n')
    );
    parts.push('');

    // Add input fields
    parts.push('Input:');
    for (const field of this.signature.inputs) {
      const value = input[field.name];
      if (value !== undefined) {
        parts.push(`${field.name}: ${JSON.stringify(value)}`);
      }
    }
    parts.push('');

    // Add reasoning instruction
    parts.push('Think step-by-step:');
    parts.push('1. First, analyze the input carefully');
    parts.push('2. Break down the problem into steps');
    parts.push('3. Work through each step');
    parts.push('4. Arrive at your final answer');
    parts.push('');

    // Add output format
    parts.push('Output (as JSON):');
    parts.push('{');
    parts.push('  "reasoning": "your step-by-step thought process",');
    const outputFields = this.signature.outputs
      .filter((f) => f.name !== 'reasoning')
      .map((f) => `  "${f.name}": ${this.getFieldExample(f)}`)
      .join(',\n');
    parts.push(outputFields);
    parts.push('}');

    return parts.join('\n');
  }

  /**
   * Get example value for a field type
   */
  private getFieldExample(field: any): string {
    switch (field.type) {
      case 'string':
        return '"your answer here"';
      case 'number':
        return '0';
      case 'boolean':
        return 'true';
      case 'object':
        return '{}';
      default:
        return 'null';
    }
  }

  /**
   * Parse Chain-of-Thought response
   */
  private parseCoTResponse(response: string): Record<string, any> {
    // Try to extract JSON from response
    let jsonMatch = response.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);

        // Ensure reasoning field exists
        if (!parsed.reasoning) {
          parsed.reasoning = this.extractReasoning(response);
        }

        return parsed;
      } catch (error) {
        // JSON parsing failed, fallback
      }
    }

    // Fallback: extract reasoning and answer manually
    return this.extractManually(response);
  }

  /**
   * Extract reasoning from free-form text
   */
  private extractReasoning(text: string): string {
    // Look for reasoning patterns
    const patterns = [
      /(?:reasoning|thinking|analysis|steps?):\s*([^\n{]+(?:\n(?!\{)[^\n]+)*)/i,
      /let's think.*?:\s*([^\n{]+(?:\n(?!\{)[^\n]+)*)/i,
      /(?:first|step 1).*?([^\n{]+(?:\n(?!\{)[^\n]+)*)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // Return first paragraph as reasoning
    const paragraphs = text.split('\n\n');
    return paragraphs[0]?.substring(0, 500) || 'No explicit reasoning provided';
  }

  /**
   * Extract output manually from free-form text
   */
  private extractManually(text: string): Record<string, any> {
    const result: Record<string, any> = {
      reasoning: this.extractReasoning(text),
    };

    // Try to extract other fields
    for (const field of this.signature.outputs) {
      if (field.name === 'reasoning') continue;

      // Look for field in format "fieldName: value"
      const pattern = new RegExp(
        `${field.name}\\s*[:=]\\s*([^\\n]+)`,
        'i'
      );
      const match = text.match(pattern);

      if (match) {
        let value = match[1].trim();

        // Clean up value
        value = value.replace(/^["']|["']$/g, ''); // Remove quotes

        // Type conversion
        if (field.type === 'number') {
          result[field.name] = parseFloat(value) || 0;
        } else if (field.type === 'boolean') {
          result[field.name] = value.toLowerCase() === 'true';
        } else {
          result[field.name] = value;
        }
      } else {
        // Provide default value
        result[field.name] = this.getDefaultValue(field);
      }
    }

    return result;
  }

  /**
   * Get default value for a field
   */
  private getDefaultValue(field: any): any {
    switch (field.type) {
      case 'string':
        return '';
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'object':
        return {};
      default:
        return null;
    }
  }
}
