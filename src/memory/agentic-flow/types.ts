/**
 * Agentic Flow Types
 *
 * Type definitions for agentic-flow integration
 */

/**
 * Pattern data for reasoning patterns
 */
export interface AgenticPatternData {
  id: string;
  pattern: string;
  context: Record<string, any>;
  success: boolean;
  confidence: number;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Retrieval options for memory lookup
 */
export interface AgenticRetrievalOptions {
  query: string;
  k?: number;
  minScore?: number;
  domain?: string;
  includePatterns?: boolean;
}

/**
 * Causal insight from memory analysis
 */
export interface AgenticCausalInsight {
  cause: string;
  effect: string;
  confidence: number;
  evidence: string[];
}

/**
 * Failure analysis result
 */
export interface AgenticFailureAnalysis {
  failureType: string;
  rootCause: string;
  suggestedFix: string;
  confidence: number;
  relatedPatterns: string[];
}

/**
 * Skill composition for multi-step tasks
 */
export interface AgenticSkillComposition {
  skills: string[];
  ordering: 'sequential' | 'parallel' | 'adaptive';
  dependencies: Map<string, string[]>;
}

/**
 * Storage strategy for memory writes
 */
export type StorageStrategy = 'all' | 'primary-only' | 'primary-with-backup';

/**
 * Storage priority configuration
 */
export interface StoragePriority {
  primary: 'local' | 'vector' | 'reasoningBank';
  backup?: 'local' | 'vector' | 'reasoningBank';
}

/**
 * Memory system configuration
 */
export interface AgenticFlowConfig {
  enableReasoningBank: boolean;
  enableAdvancedMemory: boolean;
  enableCausalReasoning: boolean;
  enableReflexion: boolean;
  enableSkillLibrary: boolean;
  enableNightlyLearning: boolean;
  embeddingDimension: number;
  maxMemorySize: number;
  consolidationThreshold: number;
  // Storage optimization settings
  storageStrategy: StorageStrategy;
  storagePriority: StoragePriority;
  parallelStorageWrites: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_AGENTIC_FLOW_CONFIG: AgenticFlowConfig = {
  enableReasoningBank: true,
  enableAdvancedMemory: true,
  enableCausalReasoning: true,
  enableReflexion: true,
  enableSkillLibrary: true,
  enableNightlyLearning: false,
  embeddingDimension: 768,
  maxMemorySize: 10000,
  consolidationThreshold: 0.85,
  // Optimized defaults - primary storage with optional backup
  storageStrategy: 'primary-with-backup',
  storagePriority: { primary: 'vector', backup: 'local' },
  parallelStorageWrites: true,
};
