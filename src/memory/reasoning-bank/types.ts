/**
 * ReasoningBank Types
 *
 * Type definitions for the ReasoningBank memory system
 */

/**
 * Knowledge unit stored in ReasoningBank
 *
 * Represents a structured piece of knowledge extracted from experiences
 */
export interface KnowledgeUnit {
  /**
   * Unique identifier
   */
  id: string;

  /**
   * Reasoning pattern or strategy
   */
  pattern: string;

  /**
   * Context in which this knowledge applies
   */
  context: {
    /**
     * Task type or domain
     */
    domain: string;

    /**
     * Input characteristics
     */
    inputFeatures: Record<string, any>;

    /**
     * Environmental conditions
     */
    conditions: Record<string, any>;
  };

  /**
   * Whether this experience was successful
   */
  success: boolean;

  /**
   * Step-by-step reasoning trace
   */
  reasoning: string[];

  /**
   * Whether this knowledge is transferrable to other contexts
   */
  transferable: boolean;

  /**
   * Confidence score (0-1)
   */
  confidence: number;

  /**
   * Number of times this knowledge has been successfully applied
   */
  usageCount: number;

  /**
   * Success rate when applied
   */
  successRate: number;

  /**
   * Lessons learned from failures
   */
  lessons?: string[];

  /**
   * Related knowledge unit IDs
   */
  relatedUnits: string[];

  /**
   * Creation timestamp
   */
  createdAt: Date;

  /**
   * Last updated timestamp
   */
  updatedAt: Date;

  /**
   * Metadata
   */
  metadata: Record<string, any>;
}

/**
 * Experience to be distilled into knowledge
 */
export interface Experience {
  /**
   * Input provided
   */
  input: any;

  /**
   * Output produced
   */
  output: any;

  /**
   * Whether the experience was successful
   */
  success: boolean;

  /**
   * Reasoning steps taken
   */
  reasoning: string[];

  /**
   * Context of the experience
   */
  context: {
    domain: string;
    inputFeatures: Record<string, any>;
    conditions: Record<string, any>;
  };

  /**
   * Feedback on the experience
   */
  feedback?: {
    score: number;
    comments: string[];
  };

  /**
   * Timestamp
   */
  timestamp: Date;
}

/**
 * Query for retrieving knowledge
 */
export interface KnowledgeQuery {
  /**
   * Context to match
   */
  context?: Partial<KnowledgeUnit['context']>;

  /**
   * Minimum confidence threshold
   */
  minConfidence?: number;

  /**
   * Only retrieve successful knowledge
   */
  successfulOnly?: boolean;

  /**
   * Only retrieve transferable knowledge
   */
  transferableOnly?: boolean;

  /**
   * Maximum number of results
   */
  limit?: number;
}

/**
 * SAFLA (Self-Aware Feedback Loop Algorithm) configuration
 */
export interface SAFLAConfig {
  /**
   * Minimum confidence threshold for keeping knowledge
   */
  minConfidenceThreshold: number;

  /**
   * Minimum usage count before pruning consideration
   */
  minUsageCount: number;

  /**
   * Success rate threshold for keeping knowledge
   */
  minSuccessRate: number;

  /**
   * Maximum age in days before pruning consideration
   */
  maxAgeInDays: number;

  /**
   * Whether to enable automatic evolution
   */
  autoEvolve: boolean;

  /**
   * Evolution interval in milliseconds
   */
  evolutionInterval: number;
}

/**
 * Pattern matching result
 */
export interface PatternMatch {
  /**
   * Knowledge unit that matched
   */
  unit: KnowledgeUnit;

  /**
   * Similarity score (0-1)
   */
  similarity: number;

  /**
   * Explanation of why it matched
   */
  explanation: string;
}
