/**
 * Configuration options for LM generation
 */
export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
}

/**
 * Abstract interface for language model drivers.
 * All LM implementations must implement this interface.
 */
export interface LMDriver {
  /**
   * Generate output based on the input prompt.
   * @param prompt - The input prompt text
   * @param options - Optional generation parameters
   * @returns A promise that resolves to the generated text
   */
  generate(prompt: string, options?: GenerationOptions): Promise<string>;

  /**
   * Optional method to initialize any resources needed by the LM
   */
  init?(): Promise<void>;

  /**
   * Optional method to clean up resources
   */
  cleanup?(): Promise<void>;
}

/**
 * Error class for LM-related errors
 */
export class LMError extends Error {
  public code?: string;
  public cause?: Error;

  constructor(message: string | Error, codeOrCause?: string | Error) {
    const msg = typeof message === 'string' ? message : message.message;
    super(msg);
    this.name = 'LMError';

    if (typeof codeOrCause === 'string') {
      this.code = codeOrCause;
    } else if (codeOrCause instanceof Error) {
      this.cause = codeOrCause;
    }
  }
}

// Global LM instance
let globalLM: LMDriver | null = null;

/**
 * Configure the global language model
 */
export function configureLM(lm: LMDriver): void {
  globalLM = lm;
}

/**
 * Get the global language model
 */
export function getLM(): LMDriver | null {
  return globalLM;
}
