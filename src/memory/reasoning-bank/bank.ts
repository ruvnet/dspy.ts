/**
 * ReasoningBank - Main Memory System
 *
 * Persistent memory system for AI agents with self-learning capabilities
 */

import pino from 'pino';
import { AgentDBClient } from '../agentdb/client';
import { SAFLA, DEFAULT_SAFLA_CONFIG } from './safla';
import {
  KnowledgeUnit,
  Experience,
  KnowledgeQuery,
  PatternMatch,
  SAFLAConfig,
} from './types';

export class ReasoningBank {
  private logger: pino.Logger;
  private agentDB: AgentDBClient;
  private safla: SAFLA;
  private units: Map<string, KnowledgeUnit> = new Map();
  private initialized: boolean = false;

  constructor(
    agentDB: AgentDBClient,
    saflaConfig?: Partial<SAFLAConfig>
  ) {
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      name: 'reasoning-bank',
    });
    this.agentDB = agentDB;
    this.safla = new SAFLA(saflaConfig);
  }

  /**
   * Initialize ReasoningBank
   */
  async init(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('ReasoningBank already initialized');
      return;
    }

    try {
      this.logger.info('Initializing ReasoningBank');

      // Ensure AgentDB is initialized
      await this.agentDB.init();

      // Load existing knowledge units
      await this.loadKnowledgeUnits();

      // Start SAFLA auto-evolution
      this.safla.startAutoEvolution(async () => {
        await this.evolve();
      });

      this.initialized = true;
      this.logger.info({
        units: this.units.size,
      }, 'ReasoningBank initialized');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize ReasoningBank');
      throw error;
    }
  }

  /**
   * Store a knowledge unit
   */
  async store(unit: KnowledgeUnit): Promise<void> {
    this.ensureInitialized();

    try {
      // Generate embedding for semantic search
      const embedding = await this.generateEmbedding(unit);

      // Store in AgentDB
      await this.agentDB.store(embedding, {
        type: 'knowledge-unit',
        unit: unit,
      });

      // Store in local map
      this.units.set(unit.id, unit);

      this.logger.debug({ id: unit.id }, 'Knowledge unit stored');
    } catch (error) {
      this.logger.error({ error }, 'Failed to store knowledge unit');
      throw error;
    }
  }

  /**
   * Retrieve knowledge units matching query
   */
  async retrieve(query: KnowledgeQuery): Promise<KnowledgeUnit[]> {
    this.ensureInitialized();

    try {
      const {
        context,
        minConfidence = 0.5,
        successfulOnly = false,
        transferableOnly = false,
        limit = 10,
      } = query;

      // Filter units based on criteria
      let results = Array.from(this.units.values());

      if (minConfidence > 0) {
        results = results.filter((u) => u.confidence >= minConfidence);
      }

      if (successfulOnly) {
        results = results.filter((u) => u.success);
      }

      if (transferableOnly) {
        results = results.filter((u) => u.transferable);
      }

      if (context) {
        results = results.filter((u) => this.matchesContext(u, context));
      }

      // Sort by confidence and success rate
      results.sort((a, b) => {
        const scoreA = a.confidence * 0.6 + a.successRate * 0.4;
        const scoreB = b.confidence * 0.6 + b.successRate * 0.4;
        return scoreB - scoreA;
      });

      // Limit results
      results = results.slice(0, limit);

      this.logger.debug({ count: results.length }, 'Retrieved knowledge units');
      return results;
    } catch (error) {
      this.logger.error({ error }, 'Failed to retrieve knowledge units');
      throw error;
    }
  }

  /**
   * Learn from experience
   */
  async learnFromExperience(experience: Experience): Promise<KnowledgeUnit> {
    this.ensureInitialized();

    try {
      this.logger.debug({
        success: experience.success,
      }, 'Learning from experience');

      // Check if similar knowledge already exists
      const similar = await this.findSimilar(experience);

      let unit: KnowledgeUnit;

      if (similar) {
        // Update existing knowledge
        unit = this.safla.updateFromExperience(
          similar,
          experience.success,
          experience.feedback
        );
        await this.store(unit);
      } else {
        // Create new knowledge unit
        unit = this.createKnowledgeUnit(experience);
        await this.store(unit);
      }

      this.logger.info({ unitId: unit.id }, 'Learned from experience');
      return unit;
    } catch (error) {
      this.logger.error({ error }, 'Failed to learn from experience');
      throw error;
    }
  }

  /**
   * Find pattern matches for a given context
   */
  async findPatterns(context: any): Promise<PatternMatch[]> {
    this.ensureInitialized();

    try {
      // Retrieve relevant units
      const units = await this.retrieve({
        context: { domain: context.domain },
        minConfidence: 0.6,
        transferableOnly: true,
        limit: 20,
      });

      // Calculate similarity scores
      const matches: PatternMatch[] = units.map((unit) => ({
        unit,
        similarity: this.calculateSimilarity(unit, context),
        explanation: this.generateExplanation(unit, context),
      }));

      // Sort by similarity
      matches.sort((a, b) => b.similarity - a.similarity);

      this.logger.debug({ count: matches.length }, 'Found pattern matches');
      return matches;
    } catch (error) {
      this.logger.error({ error }, 'Failed to find patterns');
      throw error;
    }
  }

  /**
   * Semantic retrieval — embeds `queryText` and pulls the most similar stored
   * knowledge units from the AgentDB vector index (real similarity search, not
   * just an in-memory metadata filter like `retrieve()`), then applies the
   * confidence / success / transferable filters. Returns `PatternMatch`es ranked
   * by vector similarity.
   */
  async retrieveSemantic(
    queryText: string,
    query: {
      minConfidence?: number;
      successfulOnly?: boolean;
      transferableOnly?: boolean;
      limit?: number;
    } = {}
  ): Promise<PatternMatch[]> {
    this.ensureInitialized();
    const { minConfidence = 0.5, successfulOnly = false, transferableOnly = false, limit = 10 } = query;
    const emb = await this.embedText(queryText);
    const hits = await this.agentDB.search(emb, { k: Math.max(limit * 3, limit) });
    const out: PatternMatch[] = [];
    for (const h of hits) {
      const unit = h.data?.metadata?.unit as KnowledgeUnit | undefined;
      if (!unit) continue;
      if (unit.confidence < minConfidence) continue;
      if (successfulOnly && !unit.success) continue;
      if (transferableOnly && !unit.transferable) continue;
      out.push({ unit, similarity: h.score, explanation: `semantic match (score ${h.score.toFixed(3)})` });
      if (out.length >= limit) break;
    }
    return out;
  }

  /**
   * Evolve knowledge through SAFLA
   */
  async evolve(): Promise<void> {
    this.ensureInitialized();

    try {
      this.logger.info('Starting knowledge evolution');

      const allUnits = Array.from(this.units.values());

      // Prune low-quality knowledge
      const { keep, prune } = this.safla.evaluateForPruning(allUnits);

      // Remove pruned units
      for (const unit of prune) {
        this.units.delete(unit.id);
        await this.agentDB.delete(unit.id);
      }

      // Evolve remaining knowledge
      const evolution = await this.safla.evolve(keep);

      this.logger.info({
        pruned: prune.length,
        kept: keep.length,
        insights: evolution.insights.length,
      }, 'Knowledge evolution complete');
    } catch (error) {
      this.logger.error({ error }, 'Evolution failed');
      throw error;
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalUnits: number;
    successfulUnits: number;
    transferableUnits: number;
    avgConfidence: number;
    avgSuccessRate: number;
  } {
    const units = Array.from(this.units.values());
    const successful = units.filter((u) => u.success);
    const transferable = units.filter((u) => u.transferable);

    const avgConfidence =
      units.reduce((sum, u) => sum + u.confidence, 0) / units.length || 0;
    const avgSuccessRate =
      units.reduce((sum, u) => sum + u.successRate, 0) / units.length || 0;

    return {
      totalUnits: units.length,
      successfulUnits: successful.length,
      transferableUnits: transferable.length,
      avgConfidence,
      avgSuccessRate,
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      this.logger.info('Cleaning up ReasoningBank');

      this.safla.stopAutoEvolution();
      await this.agentDB.cleanup();
      this.units.clear();

      this.initialized = false;
      this.logger.info('ReasoningBank cleaned up');
    } catch (error) {
      this.logger.error({ error }, 'Cleanup failed');
      throw error;
    }
  }

  /**
   * Load knowledge units from AgentDB
   */
  private async loadKnowledgeUnits(): Promise<void> {
    try {
      // This would query AgentDB for all knowledge units
      // For now, we start with empty set
      this.logger.debug('Loading knowledge units from AgentDB');
    } catch (error) {
      this.logger.error({ error }, 'Failed to load knowledge units');
      throw error;
    }
  }

  /**
   * Create knowledge unit from experience
   */
  private createKnowledgeUnit(experience: Experience): KnowledgeUnit {
    const now = new Date();

    return {
      id: this.generateId(),
      pattern: this.extractPattern(experience),
      context: experience.context,
      success: experience.success,
      reasoning: experience.reasoning,
      transferable: this.assessTransferability(experience),
      confidence: experience.feedback?.score || (experience.success ? 0.7 : 0.3),
      usageCount: 1,
      successRate: experience.success ? 1.0 : 0.0,
      lessons: experience.feedback?.comments,
      relatedUnits: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };
  }

  /**
   * Find similar knowledge unit
   */
  private async findSimilar(experience: Experience): Promise<KnowledgeUnit | null> {
    const candidates = await this.retrieve({
      context: experience.context,
      limit: 5,
    });

    for (const unit of candidates) {
      const similarity = this.calculateSimilarity(unit, experience.context);
      if (similarity > 0.85) {
        return unit;
      }
    }

    return null;
  }

  /**
   * Extract pattern from experience
   */
  private extractPattern(experience: Experience): string {
    // Simple pattern extraction: join reasoning steps
    return experience.reasoning.join(' -> ');
  }

  /**
   * Assess if knowledge is transferable
   */
  private assessTransferability(experience: Experience): boolean {
    // Heuristic: successful experiences with multiple reasoning steps
    // are more likely to be transferable
    return experience.success && experience.reasoning.length >= 3;
  }

  /**
   * Calculate similarity between unit and context
   */
  private calculateSimilarity(unit: KnowledgeUnit, context: any): number {
    let score = 0;
    let factors = 0;

    // Domain match
    if (unit.context.domain === context.domain) {
      score += 0.5;
    }
    factors++;

    // Feature overlap (simple Jaccard similarity)
    const unitFeatures = Object.keys(unit.context.inputFeatures);
    const contextFeatures = Object.keys(context.inputFeatures || {});
    const intersection = unitFeatures.filter((f) =>
      contextFeatures.includes(f)
    );
    if (unitFeatures.length > 0 && contextFeatures.length > 0) {
      score +=
        intersection.length / Math.max(unitFeatures.length, contextFeatures.length);
      factors++;
    }

    return factors > 0 ? score / factors : 0;
  }

  /**
   * Generate explanation for pattern match
   */
  private generateExplanation(unit: KnowledgeUnit, context: any): string {
    const parts: string[] = [];

    if (unit.context.domain === context.domain) {
      parts.push(`Same domain: ${unit.context.domain}`);
    }

    parts.push(`Confidence: ${(unit.confidence * 100).toFixed(1)}%`);
    parts.push(`Success rate: ${(unit.successRate * 100).toFixed(1)}%`);

    if (unit.transferable) {
      parts.push('Transferable pattern');
    }

    return parts.join(', ');
  }

  /**
   * Generate an embedding for a knowledge unit — uses the AgentDB
   * EmbeddingService (transformers.js / ONNX) when available, falling back to a
   * deterministic hash embedding so it works in any environment.
   */
  private async generateEmbedding(unit: KnowledgeUnit): Promise<number[]> {
    return this.embedText(`${unit.pattern} ${unit.reasoning.join(' ')}`);
  }

  /** Embed text via the AgentDB EmbeddingService, with a hash fallback. */
  private async embedText(text: string): Promise<number[]> {
    try {
      return await this.agentDB.embed(text);
    } catch {
      return this.fallbackEmbedding(text);
    }
  }

  /** Deterministic hash-based embedding — used only when no real embedder is available. */
  private fallbackEmbedding(text: string): number[] {
    const dimension = 768; // AgentDBClient default vectorDimension
    const vector = new Array(dimension).fill(0);
    for (let i = 0; i < text.length; i++) {
      vector[i % dimension] += text.charCodeAt(i) / 1000;
    }
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map((v) => v / magnitude);
  }

  /**
   * Check if unit matches context
   */
  private matchesContext(
    unit: KnowledgeUnit,
    context: Partial<KnowledgeUnit['context']>
  ): boolean {
    if (context.domain && unit.context.domain !== context.domain) {
      return false;
    }

    // Add more matching logic as needed
    return true;
  }

  /**
   * Ensure initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ReasoningBank not initialized. Call init() first.');
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `ku-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if context matches
   */
  private matchContext(
    unit: KnowledgeUnit,
    context: Partial<KnowledgeUnit['context']>
  ): boolean {
    if (context.domain && unit.context.domain !== context.domain) {
      return false;
    }

    return true;
  }
}

