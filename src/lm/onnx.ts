import * as ort from 'onnxruntime-web';
import { LMDriver, GenerationOptions, LMError } from './base';

/**
 * Configuration for the ONNX model
 */
export interface ONNXModelConfig {
  modelPath: string;
  executionProvider?: 'wasm' | 'webgl' | 'webgpu';
  maxTokens?: number;
  tokenizer?: {
    vocabPath: string;
    maxLength: number;
  };
}

/**
 * ONNXModel implements LMDriver to run ONNX-format language models.
 */
export class ONNXModel implements LMDriver {
  private session: ort.InferenceSession | null = null;
  private config: ONNXModelConfig;
  private tokenizer: any = null; // Will be implemented in future phases

  constructor(config: ONNXModelConfig) {
    this.config = config;
  }

  /**
   * Initialize the ONNX model and tokenizer
   */
  public async init(): Promise<void> {
    try {
      // Configure session options
      const sessionOptions: ort.InferenceSession.SessionOptions = {
        executionProviders: [this.config.executionProvider || 'wasm']
      };

      // Create inference session
      this.session = await ort.InferenceSession.create(
        this.config.modelPath,
        sessionOptions
      );

      // Initialize tokenizer if configured
      if (this.config.tokenizer) {
        await this.initializeTokenizer();
      }
    } catch (error) {
      throw new LMError('Failed to initialize ONNX model', error as Error);
    }
  }

  /**
   * Generate text using the ONNX model
   */
  public async run(inputs: Record<string, any>): Promise<Record<string, any>> {
    if (!this.session) {
      throw new LMError('ONNX model not initialized. Call init() first.');
    }

    try {
      // Convert inputs to tensors
      const inputTensors = await this.prepareInputs(inputs);

      // Run inference
      const outputs = await this.session.run(inputTensors);

      // Process output tensors
      if (!outputs || typeof outputs !== 'object') {
        throw new LMError('Invalid output tensor format');
      }
      return outputs;
    } catch (error) {
      throw new LMError('ONNX model inference failed', error as Error);
    }
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    try {
      if (this.session) {
        // `release()` lives on the runtime InferenceSession implementation but
        // is not part of the public `InferenceSession` interface in newer
        // onnxruntime-web (>=1.21). Call it if present; otherwise drop the
        // reference and let GC reclaim the WASM session.
        const releasable = this.session as { release?: () => Promise<void> };
        if (typeof releasable.release === 'function') {
          await releasable.release();
        }
        this.session = null;
      }
    } catch (error) {
      throw new LMError('Failed to cleanup ONNX model', error as Error);
    }
  }

  /**
   * Initialize the tokenizer (placeholder for future implementation)
   */
  private async initializeTokenizer(): Promise<void> {
    if (!this.config.tokenizer) return;

    // TODO: Implement tokenizer initialization
    // This will be expanded in future phases to handle actual tokenization
    this.tokenizer = {
      encode: (text: string) => new Float32Array([text.length]), // Dummy implementation
      decode: (_tokens: Float32Array) => 'Decoded text' // Dummy implementation
    };
  }

  /**
   * Prepare input tensor from prompt text
   */
  private async prepareInputs(inputs: Record<string, any>): Promise<Record<string, ort.Tensor>> {
    const tensors: Record<string, ort.Tensor> = {};
    
    for (const [name, value] of Object.entries(inputs)) {
      if (value instanceof Float32Array) {
        tensors[name] = new ort.Tensor('float32', value, [1, value.length]);
      } else if (typeof value === 'string') {
        const inputData = new Float32Array([value.length]);
        tensors[name] = new ort.Tensor('float32', inputData, [1, 1]);
      } else {
        throw new LMError(`Unsupported input type for ${name}`);
      }
    }

    return tensors;
  }

  /**
   * Run the ONNX model on a prompt and return a textual representation of the
   * output tensor. When a tokenizer is configured the output is decoded; otherwise
   * a shape summary is returned (full text generation requires a real tokenizer +
   * autoregressive decode loop — tracked as a known limitation).
   */
  public async generate(prompt: string, _options?: GenerationOptions): Promise<string> {
    if (!this.session) {
      throw new LMError('ONNX model not initialized. Call init() first.');
    }

    try {
      const inputTensors = await this.prepareInputs({ input: prompt });
      const outputs = await this.session.run(inputTensors);

      const firstKey = outputs && typeof outputs === 'object' ? Object.keys(outputs)[0] : undefined;
      const outputTensor = firstKey ? (outputs as Record<string, unknown>)[firstKey] : undefined;

      if (
        !outputTensor ||
        typeof outputTensor !== 'object' ||
        !Array.isArray((outputTensor as { dims?: unknown }).dims)
      ) {
        throw new LMError('Invalid output tensor format');
      }

      const dims = (outputTensor as { dims: number[] }).dims;
      const shapeStr = `shape: ${dims.join('x')}`;
      const data = (outputTensor as { data?: unknown }).data;

      if (this.tokenizer && data) {
        const decoded = this.tokenizer.decode(data as Float32Array);
        return `${decoded} (${shapeStr})`;
      }
      return `ONNX output ${shapeStr}`;
    } catch (error) {
      if (error instanceof LMError) throw error;
      throw new LMError('ONNX model inference failed', error as Error);
    }
  }
}
