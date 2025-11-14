/**
 * Anthropic Language Model Provider
 *
 * Integrates with Anthropic's Claude API for text generation
 */

import { LMDriver, GenerationOptions, LMError } from '../base';

/**
 * Anthropic API configuration
 */
export interface AnthropicConfig {
  /**
   * Anthropic API key
   */
  apiKey: string;

  /**
   * Model to use (default: claude-3-sonnet-20240229)
   */
  model?: string;

  /**
   * API endpoint (default: https://api.anthropic.com/v1)
   */
  endpoint?: string;

  /**
   * Default generation options
   */
  defaultOptions?: Partial<GenerationOptions>;
}

/**
 * Anthropic completion response
 */
interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic language model driver
 */
export class AnthropicLM implements LMDriver {
  private config: Required<AnthropicConfig>;
  private initialized: boolean = false;

  constructor(config: AnthropicConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model || 'claude-3-sonnet-20240229',
      endpoint: config.endpoint || 'https://api.anthropic.com/v1',
      defaultOptions: config.defaultOptions || {},
    };
  }

  /**
   * Initialize the LM driver
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Validate API key
    if (!this.config.apiKey) {
      throw new LMError('Anthropic API key is required', 'INVALID_CONFIG');
    }

    this.initialized = true;
  }

  /**
   * Generate text completion
   */
  async generate(
    prompt: string,
    options?: GenerationOptions
  ): Promise<string> {
    if (!this.initialized) {
      throw new LMError('LM not initialized. Call init() first.', 'NOT_INITIALIZED');
    }

    const mergedOptions = {
      ...this.config.defaultOptions,
      ...options,
    };

    try {
      const response = await this.callAnthropic(prompt, mergedOptions);
      return response.content[0]?.text || '';
    } catch (error) {
      throw new LMError(
        `Anthropic generation failed: ${error}`,
        'GENERATION_ERROR'
      );
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.initialized = false;
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(
    prompt: string,
    options: Partial<GenerationOptions>
  ): Promise<AnthropicResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
    };

    const body = {
      model: this.config.model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 500,
      top_p: options.topP,
      stop_sequences: options.stopSequences,
    };

    const response = await fetch(`${this.config.endpoint}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Anthropic API error: ${response.status} - ${JSON.stringify(error)}`
      );
    }

    return response.json();
  }
}
