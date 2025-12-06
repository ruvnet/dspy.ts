/**
 * DSPy.ts 2.5 - Advanced Declarative AI Framework
 *
 * Features:
 * - Multi-agent orchestration with Swarm architecture
 * - Self-learning with SAFLA (Self-Aware Feedback Loop Algorithm)
 * - High-performance vector operations with RuVector
 * - Lorentz Cascade Attention (LCA) for hierarchical data
 * - Advanced memory systems: AgentDB, ReasoningBank, Agentic Flow
 * - ONNX and PyTorch integration
 *
 * @packageDocumentation
 */

import { LMDriver, LMError } from './lm/base';
import { DummyLM } from './lm/dummy';

// Global variable to hold the LM driver
let globalLM: LMDriver | null = null;

/**
 * Configure the global language model driver
 */
export function configureLM(lm: LMDriver): void {
  globalLM = lm;
}

/**
 * Get the currently configured LM driver
 * @throws {LMError} if no LM is configured
 */
export function getLM(): LMDriver {
  if (!globalLM) {
    throw new LMError('No language model configured. Call configureLM() first.');
  }
  return globalLM;
}

// ============================================================================
// Core Exports
// ============================================================================

// LM-related types and implementations
export { LMDriver, GenerationOptions, LMError } from './lm/base';
export { DummyLM } from './lm/dummy';

// Core framework
export * from './core';

// Modules (Predict, ChainOfThought, ReAct)
export * from './modules';

// ============================================================================
// Memory Systems
// ============================================================================

// AgentDB - Vector database with MCP integration
export { AgentDBClient } from './memory/agentdb/client';
export { AgentDBConfig, DEFAULT_AGENTDB_CONFIG } from './memory/agentdb/config';
export type {
  VectorData,
  SearchResult,
  SearchOptions,
  BatchResult,
  AgentDBStats,
} from './memory/agentdb/types';

// RuVector - High-performance native vector operations with optimized caching
export { RuVectorClient } from './memory/ruvector/client';
export {
  runBenchmarkSuite as runVectorBenchmark,
  formatBenchmarkResults as formatVectorBenchmark,
} from './memory/ruvector/benchmark';
export type {
  RuVectorEntry,
  RuVectorQuery,
  RuVectorResult,
  RuVectorConfig,
  RuVectorStats,
  // Batch operations
  RuVectorBatchQuery,
  RuVectorBatchResult,
  // Distance computation for attention
  RuVectorDistanceRequest,
  RuVectorDistanceResult,
  RuVectorCentroidRequest,
  RuVectorCentroidResult,
  // Cache management
  RuVectorCacheStats,
  RuVectorCacheConfig,
  RuVectorEnhancedStats,
  RuVectorOptimizeOptions,
} from './memory/ruvector/types';

// ReasoningBank - Self-learning memory system with intelligence optimization
export { ReasoningBank } from './memory/reasoning-bank/bank';
export {
  SAFLA,
  DEFAULT_META_LEARNING_CONFIG,
  DEFAULT_INTELLIGENCE_OPTIMIZATION_CONFIG,
} from './memory/reasoning-bank/safla';
export type {
  KnowledgeUnit,
  Experience,
  PatternMatch,
  SAFLAConfig,
  MetaLearningConfig,
  IntelligenceOptimizationConfig,
  IntelligenceMetrics,
  OptimizationResult,
} from './memory/reasoning-bank/types';

// Agentic Flow - Advanced reasoning integration
export { HybridMemorySystem } from './memory/agentic-flow/hybrid-memory';
export type {
  AgenticPatternData,
  AgenticRetrievalOptions,
  AgenticCausalInsight,
  AgenticFailureAnalysis,
  AgenticSkillComposition,
  AgenticFlowConfig,
} from './memory/agentic-flow/types';

// ============================================================================
// Attention Mechanisms
// ============================================================================

// Lorentz Cascade Attention (LCA) - Optimized hyperbolic attention
export { LorentzAttention, LorentzSelfAttention, LorentzCrossAttention } from './attention/lorentz-attention';
export {
  LorentzCascadeAttention,
  AdaptiveCascadeAttention,
  createLorentzCascadeAttention,
} from './attention/cascade-attention';

// Lorentz operations
export {
  euclideanToLorentz,
  lorentzToEuclidean,
  lorentzDistance,
  lorentzCentroid,
  lorentzExpMap,
  lorentzLogMap,
  lorentzParallelTransport,
  poincareToLorentz,
  lorentzToPoincare,
} from './attention/lorentz-ops';

// Attention benchmarks
export {
  runAttentionBenchmarkSuite,
  formatAttentionBenchmarkResults,
  benchmarkDistance,
  benchmarkAggregation,
  benchmarkAttention,
  benchmarkCascade,
} from './attention/benchmark';

// Attention types
export type {
  LorentzVector,
  LorentzAttentionOutput,
  CascadeLevel,
  LorentzCascadeConfig,
  AttentionBenchmarkResult,
  AttentionComparison,
} from './attention/types';

// ============================================================================
// Agents & Swarm
// ============================================================================

// Export agent module with explicit naming to avoid Tool conflict with modules/react
export {
  SwarmOrchestrator,
  DEFAULT_SWARM_CONFIG,
} from './agent/swarm';

export type {
  Agent as SwarmAgent,
  Routine as SwarmRoutine,
  RoutineResult as SwarmRoutineResult,
  Handoff as SwarmHandoff,
  // Rename Tool to SwarmTool to avoid conflict with modules/react Tool
  Tool as SwarmTool,
  ToolParameter as SwarmToolParameter,
  Task as SwarmTask,
  TaskResult as SwarmTaskResult,
  AgentExecution as SwarmAgentExecution,
  SwarmConfig,
} from './agent/swarm';

// ============================================================================
// Utilities
// ============================================================================

// Export utils without re-exporting conflicting names
export { TorchUtils } from './utils/torch-helpers';
export { ONNXUtils } from './utils/onnx-helpers';
