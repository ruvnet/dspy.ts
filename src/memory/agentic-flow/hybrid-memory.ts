/**
 * Hybrid Memory System
 *
 * Integrates agentic-flow's advanced memory capabilities with DSPy.ts
 * Optimized with shared embedding service and stats caching
 */

import pino from 'pino';
import { RuVectorClient } from '../ruvector/client';
import { EmbeddingService, getEmbeddingService } from '../embedding-service';
import {
  AgenticPatternData,
  AgenticRetrievalOptions,
  AgenticCausalInsight,
  AgenticFailureAnalysis,
  AgenticSkillComposition,
  AgenticFlowConfig,
  DEFAULT_AGENTIC_FLOW_CONFIG,
} from './types';

// Stats cache type
interface CachedStats {
  totalPatterns: number;
  avgConfidence: number;
  ruVectorEnabled: boolean;
  reasoningBankEnabled: boolean;
  embeddingCacheStats?: any;
}

export class HybridMemorySystem {
  private logger: pino.Logger;
  private config: AgenticFlowConfig;
  private vectorClient: RuVectorClient | null = null;
  private reasoningBank: any = null;
  private advancedMemory: any = null;
  private initialized: boolean = false;
  private patterns: Map<string, AgenticPatternData> = new Map();
  private embeddingService: EmbeddingService | null = null;

  // Stats caching
  private cachedStats: CachedStats | null = null;
  private statsCacheTime: number = 0;
  private readonly STATS_CACHE_TTL = 10000; // 10 seconds

  // Running stats for incremental updates
  private totalConfidence: number = 0;
  private patternCount: number = 0;

  constructor(config?: Partial<AgenticFlowConfig>) {
    this.config = { ...DEFAULT_AGENTIC_FLOW_CONFIG, ...config };
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      name: 'hybrid-memory',
    });
  }

  /**
   * Initialize the hybrid memory system
   */
  async init(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Hybrid memory system already initialized');
      return;
    }

    try {
      this.logger.info('Initializing hybrid memory system', this.config);

      // Initialize shared embedding service
      this.embeddingService = getEmbeddingService({
        dimension: this.config.embeddingDimension,
        cacheSize: 10000,
        cacheTtlMs: 3600000, // 1 hour
      });
      this.logger.info('Embedding service initialized');

      // Initialize RuVector for high-performance vector operations
      try {
        this.vectorClient = new RuVectorClient({
          dimension: this.config.embeddingDimension,
          metric: 'cosine',
        });
        await this.vectorClient.init();
        this.logger.info('RuVector initialized for hybrid memory');
      } catch (error) {
        this.logger.warn('RuVector not available for hybrid memory', { error });
      }

      // Initialize agentic-flow reasoningbank
      if (this.config.enableReasoningBank) {
        try {
          const agenticFlow = await import('agentic-flow');

          if (agenticFlow.reasoningbank) {
            await agenticFlow.reasoningbank.initialize();
            this.reasoningBank = agenticFlow.reasoningbank;
            this.logger.info('Agentic-flow reasoningbank initialized');
          }
        } catch (error) {
          this.logger.warn('Agentic-flow reasoningbank not available', { error });
        }
      }

      this.initialized = true;
      this.logger.info('Hybrid memory system initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize hybrid memory system', { error });
      throw error;
    }
  }

  /**
   * Store a reasoning pattern
   */
  async storePattern(pattern: Omit<AgenticPatternData, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    this.ensureInitialized();

    const id = this.generateId();
    const now = new Date();

    const patternData: AgenticPatternData = {
      id,
      ...pattern,
      createdAt: now,
      updatedAt: now,
    };

    // Update running stats
    this.totalConfidence += pattern.confidence;
    this.patternCount++;
    this.invalidateStatsCache();

    // Use optimized storage strategy
    const { storageStrategy, storagePriority, parallelStorageWrites } = this.config;

    // Define storage operations
    const storeLocal = () => {
      this.patterns.set(id, patternData);
    };

    const storeVector = async () => {
      if (this.vectorClient) {
        const embedding = await this.computeEmbedding(pattern.pattern);
        await this.vectorClient.insert({
          id,
          vector: embedding,
          metadata: {
            type: 'pattern',
            ...patternData,
          },
        });
      }
    };

    const storeReasoningBank = async () => {
      if (this.reasoningBank && this.reasoningBank.db) {
        try {
          await this.reasoningBank.db.insertPattern({
            id,
            pattern: pattern.pattern,
            context: JSON.stringify(pattern.context),
            success: pattern.success,
            confidence: pattern.confidence,
          });
        } catch (error) {
          this.logger.warn('Failed to store in reasoningbank', { error });
        }
      }
    };

    const storageOps: Record<string, () => Promise<void> | void> = {
      local: storeLocal,
      vector: storeVector,
      reasoningBank: storeReasoningBank,
    };

    // Execute based on strategy
    if (storageStrategy === 'all') {
      // Original behavior: write to all stores
      if (parallelStorageWrites) {
        await Promise.all([storeLocal(), storeVector(), storeReasoningBank()]);
      } else {
        storeLocal();
        await storeVector();
        await storeReasoningBank();
      }
    } else if (storageStrategy === 'primary-only') {
      // Write only to primary store
      await storageOps[storagePriority.primary]();
    } else {
      // primary-with-backup: write to primary and backup
      if (parallelStorageWrites && storagePriority.backup) {
        await Promise.all([
          storageOps[storagePriority.primary](),
          storageOps[storagePriority.backup](),
        ]);
      } else {
        await storageOps[storagePriority.primary]();
        if (storagePriority.backup) {
          await storageOps[storagePriority.backup]();
        }
      }
    }

    this.logger.debug('Pattern stored', { id });
    return id;
  }

  /**
   * Retrieve relevant patterns
   */
  async retrievePatterns(options: AgenticRetrievalOptions): Promise<AgenticPatternData[]> {
    this.ensureInitialized();

    const { query, k = 10, minScore = 0.5, domain, includePatterns = true } = options;

    // Try agentic-flow reasoningbank first
    if (this.reasoningBank && this.reasoningBank.retrieveMemories) {
      try {
        const memories = await this.reasoningBank.retrieveMemories(query, {
          topK: k,
          minScore,
          domain,
        });

        if (memories.length > 0) {
          return memories.map((m: any) => ({
            id: m.id,
            pattern: m.pattern || m.content,
            context: m.context || {},
            success: m.success ?? true,
            confidence: m.confidence || m.score,
            usageCount: m.usageCount || 1,
            createdAt: m.createdAt || new Date(),
            updatedAt: m.updatedAt || new Date(),
          }));
        }
      } catch (error) {
        this.logger.warn('ReasoningBank retrieval failed, using vector search', { error });
      }
    }

    // Fall back to RuVector semantic search
    if (this.vectorClient) {
      const embedding = await this.computeEmbedding(query);
      const results = await this.vectorClient.search({
        vector: embedding,
        k,
        threshold: minScore,
      });

      return results
        .filter((r) => r.metadata?.type === 'pattern')
        .map((r) => ({
          id: r.id,
          pattern: r.metadata?.pattern || '',
          context: r.metadata?.context || {},
          success: r.metadata?.success ?? true,
          confidence: r.score,
          usageCount: r.metadata?.usageCount || 1,
          createdAt: r.metadata?.createdAt ? new Date(r.metadata.createdAt) : new Date(),
          updatedAt: r.metadata?.updatedAt ? new Date(r.metadata.updatedAt) : new Date(),
        }));
    }

    // Fall back to local pattern matching
    return this.localPatternSearch(query, k, minScore);
  }

  /**
   * Analyze causal relationships
   */
  async analyzeCausality(events: string[]): Promise<AgenticCausalInsight[]> {
    this.ensureInitialized();

    // Try agentic-flow causal analysis first
    if (this.reasoningBank && this.config.enableCausalReasoning) {
      try {
        const insights = await this.reasoningBank.CausalMemoryGraph?.analyze(events);
        if (insights && insights.length > 0) {
          return insights;
        }
      } catch (error) {
        this.logger.warn('Causal analysis failed', { error });
      }
    }

    // Simple causal inference based on pattern co-occurrence
    return this.simpleCausalInference(events);
  }

  /**
   * Analyze failure and suggest fixes
   */
  async analyzeFailure(context: {
    error: string;
    steps: string[];
    metadata?: Record<string, any>;
  }): Promise<AgenticFailureAnalysis> {
    this.ensureInitialized();

    // Try agentic-flow failure analysis
    if (this.reasoningBank && this.config.enableReflexion) {
      try {
        const analysis = await this.reasoningBank.AdvancedMemorySystem?.analyzeFailure(context);
        if (analysis) {
          return analysis;
        }
      } catch (error) {
        this.logger.warn('Failure analysis via agentic-flow failed', { error });
      }
    }

    // Simple failure analysis
    return {
      failureType: 'unknown',
      rootCause: context.error,
      suggestedFix: 'Review the error and retry with modified approach',
      confidence: 0.5,
      relatedPatterns: [],
    };
  }

  /**
   * Compose skills for complex tasks
   */
  async composeSkills(task: string, availableSkills: string[]): Promise<AgenticSkillComposition> {
    this.ensureInitialized();

    // Try agentic-flow skill composition
    if (this.reasoningBank && this.config.enableSkillLibrary) {
      try {
        const composition = await this.reasoningBank.SkillLibrary?.composeForTask(task, availableSkills);
        if (composition) {
          return composition;
        }
      } catch (error) {
        this.logger.warn('Skill composition via agentic-flow failed', { error });
      }
    }

    // Simple skill ordering based on task analysis
    return {
      skills: availableSkills,
      ordering: 'sequential',
      dependencies: new Map(),
    };
  }

  /**
   * Run consolidation on stored memories
   */
  async consolidate(): Promise<{ consolidated: number; removed: number }> {
    this.ensureInitialized();

    // Try agentic-flow consolidation
    if (this.reasoningBank && this.reasoningBank.consolidate) {
      try {
        const result = await this.reasoningBank.consolidate();
        this.logger.info('Memory consolidation complete', result);
        return result;
      } catch (error) {
        this.logger.warn('Consolidation via agentic-flow failed', { error });
      }
    }

    // Simple consolidation: remove low-confidence patterns
    let consolidated = 0;
    let removed = 0;

    for (const [id, pattern] of this.patterns.entries()) {
      if (pattern.confidence < 0.3 && pattern.usageCount < 2) {
        this.patterns.delete(id);
        if (this.vectorClient) {
          await this.vectorClient.delete(id);
        }
        // Update running stats
        this.totalConfidence -= pattern.confidence;
        this.patternCount--;
        removed++;
      } else {
        consolidated++;
      }
    }

    this.invalidateStatsCache();
    return { consolidated, removed };
  }

  /**
   * Get system statistics (with caching)
   */
  getStats(): CachedStats {
    const now = Date.now();

    // Return cached stats if still valid
    if (this.cachedStats && now - this.statsCacheTime < this.STATS_CACHE_TTL) {
      return this.cachedStats;
    }

    // Use incremental stats instead of O(n) computation
    const avgConfidence = this.patternCount > 0
      ? this.totalConfidence / this.patternCount
      : 0;

    const stats: CachedStats = {
      totalPatterns: this.patternCount,
      avgConfidence,
      ruVectorEnabled: this.vectorClient !== null,
      reasoningBankEnabled: this.reasoningBank !== null,
      embeddingCacheStats: this.embeddingService?.getCacheStats(),
    };

    // Cache the stats
    this.cachedStats = stats;
    this.statsCacheTime = now;

    return stats;
  }

  /**
   * Invalidate stats cache
   */
  private invalidateStatsCache(): void {
    this.cachedStats = null;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (!this.initialized) return;

    try {
      this.patterns.clear();
      this.initialized = false;
      this.logger.info('Hybrid memory system cleaned up');
    } catch (error) {
      this.logger.error('Cleanup failed', { error });
      throw error;
    }
  }

  /**
   * Compute embedding for text (using shared embedding service with caching)
   */
  private async computeEmbedding(text: string): Promise<number[]> {
    // Try shared embedding service first (has caching)
    if (this.embeddingService) {
      return await this.embeddingService.computeEmbedding(text);
    }

    // Try agentic-flow embedding service
    if (this.reasoningBank && this.reasoningBank.computeEmbedding) {
      try {
        return await this.reasoningBank.computeEmbedding(text);
      } catch (error) {
        // Fall back to simple embedding
      }
    }

    // Simple hash-based embedding (fallback)
    const dimension = this.config.embeddingDimension;
    const vector = new Array(dimension).fill(0);

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      vector[i % dimension] += charCode / 1000;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return magnitude > 0 ? vector.map((v) => v / magnitude) : vector;
  }

  /**
   * Local pattern search
   */
  private localPatternSearch(
    query: string,
    k: number,
    minScore: number
  ): AgenticPatternData[] {
    const queryLower = query.toLowerCase();
    const scored: Array<{ pattern: AgenticPatternData; score: number }> = [];

    for (const pattern of this.patterns.values()) {
      const patternLower = pattern.pattern.toLowerCase();

      // Simple keyword matching score
      const queryWords = queryLower.split(/\s+/);
      const patternWords = patternLower.split(/\s+/);
      const matchingWords = queryWords.filter((w) => patternWords.includes(w));
      const score = matchingWords.length / Math.max(queryWords.length, 1);

      if (score >= minScore) {
        scored.push({ pattern, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((s) => s.pattern);
  }

  /**
   * Simple causal inference
   */
  private simpleCausalInference(events: string[]): AgenticCausalInsight[] {
    const insights: AgenticCausalInsight[] = [];

    for (let i = 0; i < events.length - 1; i++) {
      insights.push({
        cause: events[i],
        effect: events[i + 1],
        confidence: 0.5,
        evidence: [`Sequential occurrence in event chain`],
      });
    }

    return insights;
  }

  /**
   * Ensure system is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Hybrid memory system not initialized. Call init() first.');
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `hm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
