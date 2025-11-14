/**
 * OpenAI Language Model Provider
 *
 * Integrates with OpenAI's API for text generation
 */

import { LMDriver, GenerationOptions, LMError } from '../base';

/**
 * OpenAI API configuration
 */
export interface OpenAIConfig {
  /**
   * OpenAI API key
   */
  apiKey: string;

  /**
   * Model to use (default: gpt-3.5-turbo)
   */
  model?: string;

  /**
   * API endpoint (default: https://api.openai.com/v1)
   */
  endpoint?: string;

  /**
   * Organization ID (optional)
   */
  organization?: string;

  /**
   * Default generation options
   */
  defaultOptions?: Partial<GenerationOptions>;
}

/**
 * OpenAI completion response
 */
interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI language model driver
 */
export class OpenAILM implements LMDriver {
  private config: Required<Omit<OpenAIConfig, 'organization'>> & {
    organization?: string;
  };
  private initialized: boolean = false;

  constructor(config: OpenAIConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model || 'gpt-3.5-turbo',
      endpoint: config.endpoint || 'https://api.openai.com/v1',
      organization: config.organization,
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
      throw new LMError('OpenAI API key is required', 'INVALID_CONFIG');
    }

    // Test API connection
    try {
      await this.testConnection();
      this.initialized = true;
    } catch (error) {
      throw new LMError(
        `Failed to initialize OpenAI LM: ${error}`,
        'INIT_ERROR'
      );
    }
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
      const response = await this.callOpenAI(prompt, mergedOptions);
      return response.choices[0]?.message?.content || '';
    } catch (error) {
      throw new LMError(
        `OpenAI generation failed: ${error}`,
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
   * Call OpenAI API
   */
  private async callOpenAI(
    prompt: string,
    options: Partial<GenerationOptions>
  ): Promise<OpenAIResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    if (this.config.organization) {
      headers['OpenAI-Organization'] = this.config.organization;
    }

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
      stop: options.stopSequences,
    };

    const response = await fetch(`${this.config.endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `OpenAI API error: ${response.status} - ${JSON.stringify(error)}`
      );
    }

    return response.json();
  }

  /**
   * Test API connection
   */
  private async testConnection(): Promise<void> {
    try {
      // Make a minimal test call
      await this.callOpenAI('test', { maxTokens: 1 });
    } catch (error) {
      // Even if the test call fails, as long as we get a response from the API, we're good
      // This prevents initialization failures due to rate limits or minor errors
      const errorStr = String(error);
      if (errorStr.includes('401') || errorStr.includes('authentication')) {
        throw new Error('Invalid OpenAI API key');
      }
      // Otherwise, consider it initialized (API is reachable)
    }
  }
}
