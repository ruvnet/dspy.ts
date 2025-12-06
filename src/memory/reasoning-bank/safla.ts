/**
 * SAFLA - Self-Aware Feedback Loop Algorithm
 *
 * Implements the core algorithm for evolving knowledge in ReasoningBank
 * with advanced self-learning, meta-learning, and intelligence optimization capabilities.
 *
 * Key Features:
 * - Meta-learning: Learning how to learn more effectively
 * - Curriculum learning: Ordering experiences by difficulty
 * - Intelligence optimization: Continuous improvement of reasoning capabilities
 * - Adaptive learning rates: Automatic adjustment based on performance
 * - Cross-domain transfer: Applying knowledge across different contexts
 */

import pino from 'pino';
import {
  KnowledgeUnit,
  SAFLAConfig,
  MetaLearningConfig,
  IntelligenceOptimizationConfig,
  IntelligenceMetrics,
  OptimizationResult,
} from './types';

/**
 * Default meta-learning configuration
 */
export const DEFAULT_META_LEARNING_CONFIG: MetaLearningConfig = {
  enabled: true,
  adaptiveLearningRate: true,
  curriculumLearning: true,
  fewShotThreshold: 3,
  crossDomainTransfer: true,
};

/**
 * Default intelligence optimization configuration
 */
export const DEFAULT_INTELLIGENCE_OPTIMIZATION_CONFIG: IntelligenceOptimizationConfig = {
  enabled: true,
  reasoningDepthOptimization: true,
  abstractionLevel: 3,
  causalInferenceStrength: 0.7,
  analogicalReasoningWeight: 0.5,
  selfCritiqueIntensity: 0.6,
};

/**
 * Default SAFLA configuration
 */
export const DEFAULT_SAFLA_CONFIG: SAFLAConfig = {
  minConfidenceThreshold: 0.6,
  minUsageCount: 3,
  minSuccessRate: 0.7,
  maxAgeInDays: 90,
  autoEvolve: true,
  evolutionInterval: 3600000, // 1 hour
  metaLearning: DEFAULT_META_LEARNING_CONFIG,
  intelligenceOptimization: DEFAULT_INTELLIGENCE_OPTIMIZATION_CONFIG,
};

/**
 * SAFLA engine for knowledge evolution and intelligence optimization
 */
export class SAFLA {
  private config: SAFLAConfig;
  private logger: pino.Logger;
  private evolutionTimer?: NodeJS.Timeout;
  private metricsHistory: IntelligenceMetrics[] = [];
  private learningRateMultiplier: number = 1.0;
  private domainPerformance: Map<string, { successes: number; failures: number }> = new Map();

  constructor(config: Partial<SAFLAConfig> = {}) {
    this.config = {
      ...DEFAULT_SAFLA_CONFIG,
      ...config,
      metaLearning: {
        ...DEFAULT_META_LEARNING_CONFIG,
        ...config.metaLearning,
      },
      intelligenceOptimization: {
        ...DEFAULT_INTELLIGENCE_OPTIMIZATION_CONFIG,
        ...config.intelligenceOptimization,
      },
    };
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      name: 'safla',
    });
  }

  /**
   * Start automatic evolution
   */
  startAutoEvolution(callback: () => Promise<void>): void {
    if (!this.config.autoEvolve) {
      return;
    }

    this.logger.info('Starting SAFLA auto-evolution', {
      interval: this.config.evolutionInterval,
    });

    this.evolutionTimer = setInterval(async () => {
      try {
        await callback();
      } catch (error) {
        this.logger.error('Auto-evolution failed', { error });
      }
    }, this.config.evolutionInterval);
  }

  /**
   * Stop automatic evolution
   */
  stopAutoEvolution(): void {
    if (this.evolutionTimer) {
      clearInterval(this.evolutionTimer);
      this.evolutionTimer = undefined;
      this.logger.info('SAFLA auto-evolution stopped');
    }
  }

  /**
   * Evaluate knowledge units for pruning
   */
  evaluateForPruning(units: KnowledgeUnit[]): {
    keep: KnowledgeUnit[];
    prune: KnowledgeUnit[];
  } {
    const keep: KnowledgeUnit[] = [];
    const prune: KnowledgeUnit[] = [];

    for (const unit of units) {
      if (this.shouldPrune(unit)) {
        prune.push(unit);
      } else {
        keep.push(unit);
      }
    }

    this.logger.info('Pruning evaluation completed', {
      total: units.length,
      keep: keep.length,
      prune: prune.length,
    });

    return { keep, prune };
  }

  /**
   * Determine if a knowledge unit should be pruned
   */
  private shouldPrune(unit: KnowledgeUnit): boolean {
    // Never prune highly confident, successful knowledge
    if (unit.confidence >= 0.9 && unit.successRate >= 0.9) {
      return false;
    }

    // Check confidence threshold
    if (unit.confidence < this.config.minConfidenceThreshold) {
      this.logger.debug('Pruning low confidence unit', { id: unit.id, confidence: unit.confidence });
      return true;
    }

    // Check if unit has been used enough times
    if (unit.usageCount >= this.config.minUsageCount) {
      // Check success rate
      if (unit.successRate < this.config.minSuccessRate) {
        this.logger.debug('Pruning low success rate unit', {
          id: unit.id,
          successRate: unit.successRate,
        });
        return true;
      }
    }

    // Check age
    const ageInDays = this.getAgeInDays(unit);
    if (ageInDays > this.config.maxAgeInDays && unit.usageCount === 0) {
      this.logger.debug('Pruning old unused unit', { id: unit.id, ageInDays });
      return true;
    }

    return false;
  }

  /**
   * Update knowledge unit based on new experience
   */
  updateFromExperience(
    unit: KnowledgeUnit,
    success: boolean,
    feedback?: { score: number; comments: string[] }
  ): KnowledgeUnit {
    const updated = { ...unit };

    // Update usage count
    updated.usageCount++;

    // Update success rate
    const totalSuccesses = unit.successRate * (unit.usageCount - 1) + (success ? 1 : 0);
    updated.successRate = totalSuccesses / updated.usageCount;

    // Update confidence based on feedback and success
    if (feedback) {
      // Incorporate feedback score into confidence
      updated.confidence = this.updateConfidence(
        updated.confidence,
        feedback.score,
        success
      );

      // Add lessons from feedback if unsuccessful
      if (!success && feedback.comments.length > 0) {
        updated.lessons = [...(updated.lessons || []), ...feedback.comments];
      }
    } else {
      // Update confidence based on success/failure
      updated.confidence = this.updateConfidence(
        updated.confidence,
        success ? 1.0 : 0.0,
        success
      );
    }

    // Update timestamp
    updated.updatedAt = new Date();

    this.logger.debug('Updated knowledge unit from experience', {
      id: unit.id,
      success,
      newConfidence: updated.confidence,
      newSuccessRate: updated.successRate,
    });

    return updated;
  }

  /**
   * Update confidence score using exponential moving average
   */
  private updateConfidence(
    currentConfidence: number,
    newScore: number,
    success: boolean
  ): number {
    // Weight factor (0-1): how much to trust new evidence vs. history
    // More usage = trust history more
    const alpha = 0.3; // 30% weight to new evidence, 70% to history

    // Calculate new confidence
    let updated = currentConfidence * (1 - alpha) + newScore * alpha;

    // Apply success/failure adjustment
    if (!success) {
      updated *= 0.9; // Penalize failures
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, updated));
  }

  /**
   * Merge related knowledge units
   */
  mergeUnits(units: KnowledgeUnit[]): KnowledgeUnit {
    if (units.length === 0) {
      throw new Error('Cannot merge empty array of units');
    }

    if (units.length === 1) {
      return units[0];
    }

    this.logger.info('Merging knowledge units', { count: units.length });

    // Sort by confidence
    const sorted = [...units].sort((a, b) => b.confidence - a.confidence);
    const base = sorted[0];

    // Merge reasoning steps
    const allReasoning = new Set<string>();
    units.forEach((u) => u.reasoning.forEach((r) => allReasoning.add(r)));

    // Merge lessons
    const allLessons = new Set<string>();
    units.forEach((u) => (u.lessons || []).forEach((l) => allLessons.add(l)));

    // Merge related units
    const allRelated = new Set<string>();
    units.forEach((u) => u.relatedUnits.forEach((r) => allRelated.add(r)));

    // Calculate weighted averages
    const totalUsage = units.reduce((sum, u) => sum + u.usageCount, 0);
    const avgConfidence =
      units.reduce((sum, u) => sum + u.confidence * u.usageCount, 0) / totalUsage;
    const avgSuccessRate =
      units.reduce((sum, u) => sum + u.successRate * u.usageCount, 0) / totalUsage;

    return {
      ...base,
      id: this.generateMergedId(units),
      reasoning: Array.from(allReasoning),
      lessons: Array.from(allLessons),
      relatedUnits: Array.from(allRelated),
      confidence: avgConfidence,
      successRate: avgSuccessRate,
      usageCount: totalUsage,
      updatedAt: new Date(),
      metadata: {
        ...base.metadata,
        mergedFrom: units.map((u) => u.id),
        mergedAt: new Date(),
      },
    };
  }

  /**
   * Generate ID for merged unit
   */
  private generateMergedId(units: KnowledgeUnit[]): string {
    const ids = units.map((u) => u.id).sort();
    return `merged-${ids.join('-')}`;
  }

  /**
   * Get age of knowledge unit in days
   */
  private getAgeInDays(unit: KnowledgeUnit): number {
    const now = new Date();
    const created = new Date(unit.createdAt);
    const diffMs = now.getTime() - created.getTime();
    return diffMs / (1000 * 60 * 60 * 24);
  }

  /**
   * Evolve knowledge through reflection
   *
   * Analyzes patterns and generates insights
   */
  async evolve(units: KnowledgeUnit[]): Promise<{
    insights: string[];
    patterns: string[];
    recommendations: string[];
  }> {
    this.logger.info('Evolving knowledge', { totalUnits: units.length });

    const insights: string[] = [];
    const patterns: string[] = [];
    const recommendations: string[] = [];

    // Analyze success patterns
    const successful = units.filter((u) => u.success && u.successRate > 0.8);
    if (successful.length > 0) {
      insights.push(
        `${successful.length} highly successful patterns identified`
      );
      patterns.push(...this.extractPatterns(successful));
    }

    // Analyze failure patterns
    const failed = units.filter((u) => !u.success || u.successRate < 0.5);
    if (failed.length > 0) {
      insights.push(`${failed.length} patterns with low success identified`);
      recommendations.push(
        ...this.generateRecommendations(failed, successful)
      );
    }

    // Analyze transferability
    const transferable = units.filter((u) => u.transferable);
    if (transferable.length > 0) {
      insights.push(
        `${transferable.length} transferable patterns can be applied across domains`
      );
    }

    this.logger.info('Evolution complete', {
      insights: insights.length,
      patterns: patterns.length,
      recommendations: recommendations.length,
    });

    return { insights, patterns, recommendations };
  }

  /**
   * Extract common patterns from knowledge units
   */
  private extractPatterns(units: KnowledgeUnit[]): string[] {
    const patterns = new Set<string>();

    for (const unit of units) {
      // Extract patterns from reasoning steps
      unit.reasoning.forEach((step) => {
        if (step.length > 20) {
          // Only meaningful patterns
          patterns.add(step);
        }
      });
    }

    return Array.from(patterns);
  }

  /**
   * Generate recommendations based on failures and successes
   */
  private generateRecommendations(
    failed: KnowledgeUnit[],
    successful: KnowledgeUnit[]
  ): string[] {
    const recommendations: string[] = [];

    // Extract lessons from failures
    const lessons = new Set<string>();
    failed.forEach((u) => (u.lessons || []).forEach((l) => lessons.add(l)));

    if (lessons.size > 0) {
      recommendations.push(
        'Review and apply lessons learned from failed attempts'
      );
      recommendations.push(...Array.from(lessons));
    }

    // Suggest patterns from successful units
    if (successful.length > 0) {
      recommendations.push(
        'Consider applying successful patterns to similar problems'
      );
    }

    return recommendations;
  }

  // ============================================================================
  // Intelligence Optimization Methods
  // ============================================================================

  /**
   * Measure current intelligence metrics
   */
  measureIntelligence(units: KnowledgeUnit[]): IntelligenceMetrics {
    if (units.length === 0) {
      return this.createEmptyMetrics();
    }

    const successful = units.filter((u) => u.success);
    const transferable = units.filter((u) => u.transferable);

    // Calculate reasoning accuracy
    const reasoningAccuracy =
      units.reduce((sum, u) => sum + u.successRate, 0) / units.length;

    // Calculate learning efficiency
    const learningEfficiency = this.calculateLearningEfficiency(units);

    // Calculate adaptation speed
    const adaptationSpeed = this.calculateAdaptationSpeed(units);

    // Calculate transfer capability
    const transferCapability =
      transferable.length > 0
        ? transferable.reduce((sum, u) => sum + u.successRate, 0) / transferable.length
        : 0;

    // Calculate pattern recognition depth
    const patternRecognitionDepth = this.calculatePatternDepth(units);

    // Calculate self-improvement rate
    const selfImprovementRate = this.calculateSelfImprovementRate();

    // Calculate overall score (weighted combination)
    const overallScore =
      reasoningAccuracy * 25 +
      learningEfficiency * 20 +
      adaptationSpeed * 15 +
      transferCapability * 15 +
      patternRecognitionDepth * 15 +
      selfImprovementRate * 10;

    const metrics: IntelligenceMetrics = {
      overallScore: Math.min(100, overallScore * 100),
      reasoningAccuracy,
      learningEfficiency,
      adaptationSpeed,
      transferCapability,
      patternRecognitionDepth,
      selfImprovementRate,
      measuredAt: new Date(),
    };

    // Store in history for tracking improvement
    this.metricsHistory.push(metrics);

    this.logger.info('Intelligence metrics measured', {
      overallScore: metrics.overallScore.toFixed(1),
      reasoningAccuracy: (metrics.reasoningAccuracy * 100).toFixed(1) + '%',
    });

    return metrics;
  }

  /**
   * Optimize intelligence based on current knowledge
   */
  async optimizeIntelligence(units: KnowledgeUnit[]): Promise<OptimizationResult> {
    if (!this.config.intelligenceOptimization.enabled) {
      throw new Error('Intelligence optimization is disabled');
    }

    const startTime = performance.now();
    const beforeMetrics = this.measureIntelligence(units);
    const improvements: string[] = [];
    const strategiesApplied: string[] = [];

    this.logger.info('Starting intelligence optimization', {
      unitCount: units.length,
      currentScore: beforeMetrics.overallScore.toFixed(1),
    });

    // Strategy 1: Reasoning depth optimization
    if (this.config.intelligenceOptimization.reasoningDepthOptimization) {
      const depthImprovements = this.optimizeReasoningDepth(units);
      improvements.push(...depthImprovements);
      strategiesApplied.push('reasoning-depth-optimization');
    }

    // Strategy 2: Pattern abstraction
    if (this.config.intelligenceOptimization.abstractionLevel > 0) {
      const abstractionImprovements = this.applyPatternAbstraction(units);
      improvements.push(...abstractionImprovements);
      strategiesApplied.push('pattern-abstraction');
    }

    // Strategy 3: Causal inference strengthening
    if (this.config.intelligenceOptimization.causalInferenceStrength > 0) {
      const causalImprovements = this.strengthenCausalInference(units);
      improvements.push(...causalImprovements);
      strategiesApplied.push('causal-inference');
    }

    // Strategy 4: Analogical reasoning enhancement
    if (this.config.intelligenceOptimization.analogicalReasoningWeight > 0) {
      const analogicalImprovements = this.enhanceAnalogicalReasoning(units);
      improvements.push(...analogicalImprovements);
      strategiesApplied.push('analogical-reasoning');
    }

    // Strategy 5: Self-critique and refinement
    if (this.config.intelligenceOptimization.selfCritiqueIntensity > 0) {
      const critiqueImprovements = this.applySelfCritique(units);
      improvements.push(...critiqueImprovements);
      strategiesApplied.push('self-critique');
    }

    const afterMetrics = this.measureIntelligence(units);
    const durationMs = performance.now() - startTime;

    const result: OptimizationResult = {
      before: beforeMetrics,
      after: afterMetrics,
      improvements,
      strategiesApplied,
      durationMs,
    };

    this.logger.info('Intelligence optimization complete', {
      scoreDelta: (afterMetrics.overallScore - beforeMetrics.overallScore).toFixed(1),
      improvements: improvements.length,
      durationMs: durationMs.toFixed(0),
    });

    return result;
  }

  // ============================================================================
  // Meta-Learning Methods
  // ============================================================================

  /**
   * Apply meta-learning to improve learning effectiveness
   */
  applyMetaLearning(units: KnowledgeUnit[]): {
    adjustedUnits: KnowledgeUnit[];
    learningInsights: string[];
  } {
    if (!this.config.metaLearning.enabled) {
      return { adjustedUnits: units, learningInsights: [] };
    }

    const adjustedUnits: KnowledgeUnit[] = [];
    const learningInsights: string[] = [];

    // Adaptive learning rate adjustment
    if (this.config.metaLearning.adaptiveLearningRate) {
      this.adjustLearningRate(units);
      learningInsights.push(
        `Learning rate adjusted to ${this.learningRateMultiplier.toFixed(2)}x`
      );
    }

    // Curriculum learning: order by difficulty
    if (this.config.metaLearning.curriculumLearning) {
      const orderedUnits = this.orderByCurriculum(units);
      adjustedUnits.push(...orderedUnits);
      learningInsights.push('Applied curriculum learning ordering');
    } else {
      adjustedUnits.push(...units);
    }

    // Cross-domain transfer analysis
    if (this.config.metaLearning.crossDomainTransfer) {
      const transferInsights = this.analyzeCrossDomainTransfer(units);
      learningInsights.push(...transferInsights);
    }

    // Few-shot learning optimization
    const fewShotInsights = this.optimizeFewShotLearning(units);
    learningInsights.push(...fewShotInsights);

    this.logger.info('Meta-learning applied', {
      insights: learningInsights.length,
    });

    return { adjustedUnits, learningInsights };
  }

  /**
   * Get current learning rate multiplier
   */
  getLearningRateMultiplier(): number {
    return this.learningRateMultiplier;
  }

  /**
   * Get metrics history for trend analysis
   */
  getMetricsHistory(): IntelligenceMetrics[] {
    return [...this.metricsHistory];
  }

  /**
   * Get domain performance statistics
   */
  getDomainPerformance(): Map<string, { successes: number; failures: number; successRate: number }> {
    const result = new Map<string, { successes: number; failures: number; successRate: number }>();

    for (const [domain, stats] of this.domainPerformance.entries()) {
      const total = stats.successes + stats.failures;
      result.set(domain, {
        ...stats,
        successRate: total > 0 ? stats.successes / total : 0,
      });
    }

    return result;
  }

  /**
   * Record domain performance for meta-learning
   */
  recordDomainPerformance(domain: string, success: boolean): void {
    const current = this.domainPerformance.get(domain) || { successes: 0, failures: 0 };

    if (success) {
      current.successes++;
    } else {
      current.failures++;
    }

    this.domainPerformance.set(domain, current);
  }

  // ============================================================================
  // Private Intelligence Optimization Helpers
  // ============================================================================

  private calculateLearningEfficiency(units: KnowledgeUnit[]): number {
    if (units.length === 0) return 0;

    // Learning efficiency = average confidence gain per usage
    let totalEfficiency = 0;
    let count = 0;

    for (const unit of units) {
      if (unit.usageCount > 1) {
        // Estimate efficiency from confidence and usage
        totalEfficiency += unit.confidence / Math.log2(unit.usageCount + 1);
        count++;
      }
    }

    return count > 0 ? Math.min(1, totalEfficiency / count) : 0.5;
  }

  private calculateAdaptationSpeed(units: KnowledgeUnit[]): number {
    if (units.length === 0) return 0;

    // Adaptation speed based on how quickly units achieve high confidence
    let adaptationScore = 0;

    for (const unit of units) {
      if (unit.confidence >= 0.8 && unit.usageCount <= 5) {
        adaptationScore += 1;
      } else if (unit.confidence >= 0.6 && unit.usageCount <= 10) {
        adaptationScore += 0.5;
      }
    }

    return Math.min(1, adaptationScore / units.length);
  }

  private calculatePatternDepth(units: KnowledgeUnit[]): number {
    if (units.length === 0) return 0;

    // Pattern depth based on reasoning chain lengths and relationships
    let totalDepth = 0;

    for (const unit of units) {
      const reasoningDepth = Math.min(unit.reasoning.length / 5, 1);
      const relationshipDepth = Math.min(unit.relatedUnits.length / 3, 1);
      totalDepth += (reasoningDepth + relationshipDepth) / 2;
    }

    return totalDepth / units.length;
  }

  private calculateSelfImprovementRate(): number {
    if (this.metricsHistory.length < 2) return 0;

    // Calculate improvement trend from metrics history
    const recent = this.metricsHistory.slice(-10);
    if (recent.length < 2) return 0;

    let improvements = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].overallScore > recent[i - 1].overallScore) {
        improvements++;
      }
    }

    return improvements / (recent.length - 1);
  }

  private createEmptyMetrics(): IntelligenceMetrics {
    return {
      overallScore: 0,
      reasoningAccuracy: 0,
      learningEfficiency: 0,
      adaptationSpeed: 0,
      transferCapability: 0,
      patternRecognitionDepth: 0,
      selfImprovementRate: 0,
      measuredAt: new Date(),
    };
  }

  private optimizeReasoningDepth(units: KnowledgeUnit[]): string[] {
    const improvements: string[] = [];
    const shallowUnits = units.filter((u) => u.reasoning.length < 3 && u.success);

    if (shallowUnits.length > 0) {
      improvements.push(
        `Identified ${shallowUnits.length} successful patterns with shallow reasoning that could benefit from deeper analysis`
      );
    }

    const deepUnits = units.filter((u) => u.reasoning.length > 7 && u.successRate < 0.5);
    if (deepUnits.length > 0) {
      improvements.push(
        `Identified ${deepUnits.length} patterns with overly complex reasoning that may need simplification`
      );
    }

    return improvements;
  }

  private applyPatternAbstraction(units: KnowledgeUnit[]): string[] {
    const improvements: string[] = [];
    const level = this.config.intelligenceOptimization.abstractionLevel;

    // Group units by domain
    const domainGroups = new Map<string, KnowledgeUnit[]>();
    for (const unit of units) {
      const domain = unit.context.domain;
      const group = domainGroups.get(domain) || [];
      group.push(unit);
      domainGroups.set(domain, group);
    }

    // Find abstraction opportunities
    for (const [domain, group] of domainGroups.entries()) {
      if (group.length >= level * 2) {
        const successful = group.filter((u) => u.success && u.successRate > 0.7);
        if (successful.length >= level) {
          improvements.push(
            `Domain "${domain}": ${successful.length} patterns could be abstracted into ${Math.ceil(successful.length / level)} higher-level patterns`
          );
        }
      }
    }

    return improvements;
  }

  private strengthenCausalInference(units: KnowledgeUnit[]): string[] {
    const improvements: string[] = [];
    const strength = this.config.intelligenceOptimization.causalInferenceStrength;

    // Identify potential causal relationships
    const highConfidenceUnits = units.filter((u) => u.confidence >= strength);

    if (highConfidenceUnits.length > 1) {
      // Look for potential cause-effect chains
      const potentialChains = this.findCausalChains(highConfidenceUnits);
      if (potentialChains > 0) {
        improvements.push(
          `Identified ${potentialChains} potential causal chains for deeper analysis`
        );
      }
    }

    return improvements;
  }

  private findCausalChains(units: KnowledgeUnit[]): number {
    let chains = 0;

    for (let i = 0; i < units.length; i++) {
      for (let j = 0; j < units.length; j++) {
        if (i !== j && units[i].relatedUnits.includes(units[j].id)) {
          chains++;
        }
      }
    }

    return Math.floor(chains / 2); // Bidirectional relationships count as one
  }

  private enhanceAnalogicalReasoning(units: KnowledgeUnit[]): string[] {
    const improvements: string[] = [];
    const weight = this.config.intelligenceOptimization.analogicalReasoningWeight;

    // Find transferable patterns that could apply to other domains
    const transferable = units.filter((u) => u.transferable && u.successRate >= weight);

    if (transferable.length > 0) {
      const domains = new Set(units.map((u) => u.context.domain));
      const transferDomains = new Set(transferable.map((u) => u.context.domain));

      const targetDomains = [...domains].filter((d) => !transferDomains.has(d));

      if (targetDomains.length > 0) {
        improvements.push(
          `${transferable.length} transferable patterns could be applied to domains: ${targetDomains.join(', ')}`
        );
      }
    }

    return improvements;
  }

  private applySelfCritique(units: KnowledgeUnit[]): string[] {
    const improvements: string[] = [];
    const intensity = this.config.intelligenceOptimization.selfCritiqueIntensity;

    // Identify units that need review
    const needsReview = units.filter(
      (u) => u.usageCount >= 5 && u.successRate < intensity
    );

    if (needsReview.length > 0) {
      improvements.push(
        `${needsReview.length} patterns flagged for self-critique due to declining performance`
      );
    }

    // Identify potentially conflicting patterns
    const potentialConflicts = this.findConflictingPatterns(units);
    if (potentialConflicts > 0) {
      improvements.push(
        `${potentialConflicts} potential pattern conflicts identified for resolution`
      );
    }

    return improvements;
  }

  private findConflictingPatterns(units: KnowledgeUnit[]): number {
    let conflicts = 0;

    // Group by domain
    const domainGroups = new Map<string, KnowledgeUnit[]>();
    for (const unit of units) {
      const domain = unit.context.domain;
      const group = domainGroups.get(domain) || [];
      group.push(unit);
      domainGroups.set(domain, group);
    }

    // Find opposing outcomes in same domain
    for (const group of domainGroups.values()) {
      const successful = group.filter((u) => u.success);
      const failed = group.filter((u) => !u.success);

      // Simple heuristic: if we have both success and failure for similar patterns
      if (successful.length > 0 && failed.length > 0) {
        conflicts++;
      }
    }

    return conflicts;
  }

  // ============================================================================
  // Private Meta-Learning Helpers
  // ============================================================================

  private adjustLearningRate(units: KnowledgeUnit[]): void {
    if (units.length === 0) return;

    const avgSuccessRate =
      units.reduce((sum, u) => sum + u.successRate, 0) / units.length;

    // Increase learning rate if doing well, decrease if struggling
    if (avgSuccessRate > 0.8) {
      this.learningRateMultiplier = Math.min(2.0, this.learningRateMultiplier * 1.1);
    } else if (avgSuccessRate < 0.4) {
      this.learningRateMultiplier = Math.max(0.5, this.learningRateMultiplier * 0.9);
    }
  }

  private orderByCurriculum(units: KnowledgeUnit[]): KnowledgeUnit[] {
    // Order by difficulty (estimated from reasoning length and confidence)
    return [...units].sort((a, b) => {
      const difficultyA = a.reasoning.length / (a.confidence + 0.1);
      const difficultyB = b.reasoning.length / (b.confidence + 0.1);
      return difficultyA - difficultyB; // Easier first
    });
  }

  private analyzeCrossDomainTransfer(units: KnowledgeUnit[]): string[] {
    const insights: string[] = [];

    // Group by domain
    const domainGroups = new Map<string, KnowledgeUnit[]>();
    for (const unit of units) {
      const domain = unit.context.domain;
      const group = domainGroups.get(domain) || [];
      group.push(unit);
      domainGroups.set(domain, group);
    }

    // Find domains with successful transferable patterns
    const strongDomains: string[] = [];
    const weakDomains: string[] = [];

    for (const [domain, group] of domainGroups.entries()) {
      const avgSuccess = group.reduce((sum, u) => sum + u.successRate, 0) / group.length;
      const transferable = group.filter((u) => u.transferable).length;

      if (avgSuccess > 0.7 && transferable > 2) {
        strongDomains.push(domain);
      } else if (avgSuccess < 0.5) {
        weakDomains.push(domain);
      }
    }

    if (strongDomains.length > 0 && weakDomains.length > 0) {
      insights.push(
        `Cross-domain transfer opportunity: patterns from ${strongDomains.join(', ')} ` +
        `could help improve ${weakDomains.join(', ')}`
      );
    }

    return insights;
  }

  private optimizeFewShotLearning(units: KnowledgeUnit[]): string[] {
    const insights: string[] = [];
    const threshold = this.config.metaLearning.fewShotThreshold;

    // Find domains with few examples but high success
    const domainStats = new Map<string, { count: number; avgSuccess: number }>();

    for (const unit of units) {
      const domain = unit.context.domain;
      const stats = domainStats.get(domain) || { count: 0, avgSuccess: 0 };
      stats.count++;
      stats.avgSuccess =
        (stats.avgSuccess * (stats.count - 1) + unit.successRate) / stats.count;
      domainStats.set(domain, stats);
    }

    for (const [domain, stats] of domainStats.entries()) {
      if (stats.count <= threshold && stats.avgSuccess > 0.7) {
        insights.push(
          `Domain "${domain}": Achieving high success with few-shot learning (${stats.count} examples)`
        );
      }
    }

    return insights;
  }
}
