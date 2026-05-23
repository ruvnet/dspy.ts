/**
 * OpenRouter Language Model Provider
 *
 * Integrates with OpenRouter (https://openrouter.ai) — an OpenAI-compatible
 * gateway that routes to 200+ models including Claude, GPT-4, Gemini, Mistral,
 * Llama, and open-source models. Resolves issue #1 requesting OpenRouter support.
 */

import { LMDriver, GenerationOptions, LMError } from '../base';

/**
 * Validate that an LM API endpoint URL uses HTTPS and does not point at a
 * private/loopback address. This prevents SSRF when callers supply a custom
 * endpoint at runtime.
 */
function validateEndpoint(endpoint: string): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new LMError(`Invalid endpoint URL: ${endpoint}`, 'INVALID_CONFIG');
  }
  if (url.protocol !== 'https:') {
    throw new LMError(
      `Endpoint must use HTTPS. Got: ${url.protocol}`,
      'INVALID_CONFIG'
    );
  }
  const host = url.hostname.toLowerCase();
  const privatePatterns = [
    /^localhost$/,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^::1$/,
    /^fd[0-9a-f]{2}:/i,
  ];
  if (privatePatterns.some((p) => p.test(host))) {
    throw new LMError(
      `Endpoint must not resolve to a private or loopback address. Got: ${host}`,
      'INVALID_CONFIG'
    );
  }
}

/**
 * OpenRouter API configuration
 */
export interface OpenRouterConfig {
  /**
   * OpenRouter API key (get one at https://openrouter.ai/keys)
   */
  apiKey: string;

  /**
   * Model identifier in provider/model format, e.g. "anthropic/claude-3-5-sonnet",
   * "openai/gpt-4o", "google/gemini-2.0-flash", "meta-llama/llama-3.3-70b-instruct".
   * See https://openrouter.ai/models for the full list.
   * Default: "anthropic/claude-3-5-sonnet"
   */
  model?: string;

  /**
   * API endpoint (default: https://openrouter.ai/api/v1)
   */
  endpoint?: string;

  /**
   * HTTP Referer for attribution on openrouter.ai (optional but recommended)
   */
  siteUrl?: string;

  /**
   * Site name shown on openrouter.ai usage dashboards (optional)
   */
  siteName?: string;

  /**
   * Default generation options
   */
  defaultOptions?: Partial<GenerationOptions>;
}

/**
 * OpenRouter uses the OpenAI chat-completion response shape.
 */
interface OpenRouterResponse {
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
 * OpenRouter language model driver.
 *
 * @example
 * ```ts
 * import { OpenRouterLM, configureLM } from 'dspy.ts';
 *
 * configureLM(new OpenRouterLM({
 *   apiKey: process.env.OPENROUTER_API_KEY!,
 *   model: 'anthropic/claude-3-5-sonnet',
 * }));
 * ```
 */
export class OpenRouterLM implements LMDriver {
  private config: Required<Omit<OpenRouterConfig, 'siteUrl' | 'siteName'>> & {
    siteUrl?: string;
    siteName?: string;
  };
  private initialized: boolean = false;

  constructor(config: OpenRouterConfig) {
    const endpoint = config.endpoint || 'https://openrouter.ai/api/v1';
    validateEndpoint(endpoint);
    this.config = {
      apiKey: config.apiKey,
      model: config.model || 'anthropic/claude-3-5-sonnet',
      endpoint,
      siteUrl: config.siteUrl,
      siteName: config.siteName,
      defaultOptions: config.defaultOptions || {},
    };
  }

  /**
   * Initialize the LM driver — validates the API key.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.config.apiKey) {
      throw new LMError('OpenRouter API key is required', 'INVALID_CONFIG');
    }

    this.initialized = true;
  }

  /**
   * Generate text via OpenRouter.
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
      const response = await this.callOpenRouter(prompt, mergedOptions);
      return response.choices[0]?.message?.content || '';
    } catch (error) {
      throw new LMError(
        `OpenRouter generation failed: ${error}`,
        'GENERATION_ERROR'
      );
    }
  }

  /**
   * Cleanup resources.
   */
  async cleanup(): Promise<void> {
    this.initialized = false;
  }

  /**
   * Call the OpenRouter API (OpenAI-compatible /chat/completions).
   */
  private async callOpenRouter(
    prompt: string,
    options: Partial<GenerationOptions>
  ): Promise<OpenRouterResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };

    if (this.config.siteUrl) {
      headers['HTTP-Referer'] = this.config.siteUrl;
    }
    if (this.config.siteName) {
      headers['X-Title'] = this.config.siteName;
    }

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 500,
    };

    if (options.topP !== undefined) {
      body['top_p'] = options.topP;
    }
    if (options.stopSequences?.length) {
      body['stop'] = options.stopSequences;
    }

    const response = await fetch(`${this.config.endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `OpenRouter API error: ${response.status} - ${JSON.stringify(error)}`
      );
    }

    return response.json() as Promise<OpenRouterResponse>;
  }
}
