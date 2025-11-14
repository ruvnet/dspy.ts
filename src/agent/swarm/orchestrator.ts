/**
 * Swarm Orchestrator
 *
 * Coordinates execution of multiple agents with handoffs
 */

import { injectable } from 'inversify';
import pino from 'pino';
import {
  Agent,
  Task,
  TaskResult,
  AgentExecution,
  SwarmConfig,
} from './types';

/**
 * Default swarm configuration
 */
export const DEFAULT_SWARM_CONFIG: SwarmConfig = {
  defaultMaxHandoffs: 10,
  defaultTimeout: 60000, // 1 minute
  enableLogging: true,
  maxConcurrentTasks: 100,
};

@injectable()
export class SwarmOrchestrator {
  private agents: Map<string, Agent> = new Map();
  private logger: pino.Logger;
  private config: SwarmConfig;
  private activeTasks: Map<string, Promise<TaskResult>> = new Map();

  constructor(config: Partial<SwarmConfig> = {}) {
    this.config = { ...DEFAULT_SWARM_CONFIG, ...config };
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      name: 'swarm-orchestrator',
      enabled: this.config.enableLogging,
    });
  }

  /**
   * Register an agent with the swarm
   */
  addAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
    this.logger.info('Agent registered', {
      id: agent.id,
      name: agent.name,
      handoffs: agent.handoffs.length,
    });
  }

  /**
   * Remove an agent from the swarm
   */
  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.logger.info('Agent removed', { id: agentId });
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Execute a task through the swarm
   */
  async execute(task: Task): Promise<TaskResult> {
    // Check concurrent task limit
    if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
      throw new Error('Maximum concurrent tasks reached');
    }

    const {
      id,
      input,
      startAgent,
      maxHandoffs = this.config.defaultMaxHandoffs,
      timeout = this.config.defaultTimeout,
      context = new Map(),
    } = task;

    this.logger.info('Executing task', {
      taskId: id,
      startAgent,
      maxHandoffs,
    });

    const startTime = Date.now();
    const trace: AgentExecution[] = [];

    try {
      // Determine starting agent
      let currentAgentId = startAgent || this.getDefaultAgent();
      if (!currentAgentId) {
        throw new Error('No starting agent specified and no default available');
      }

      let currentInput = input;
      let handoffCount = 0;

      // Execute agent loop with handoffs
      while (handoffCount <= maxHandoffs) {
        const agent = this.agents.get(currentAgentId);
        if (!agent) {
          throw new Error(`Agent not found: ${currentAgentId}`);
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          throw new Error('Task timeout exceeded');
        }

        // Execute agent
        const execution = await this.executeAgent(
          agent,
          currentInput,
          context
        );
        trace.push(execution);

        // Check if agent suggests handoff
        if (execution.handoffTo) {
          currentAgentId = execution.handoffTo;
          currentInput = execution.output;
          handoffCount++;

          this.logger.debug('Handoff', {
            from: agent.id,
            to: currentAgentId,
            count: handoffCount,
          });
          continue;
        }

        // No handoff, task complete
        const duration = Date.now() - startTime;
        this.logger.info('Task completed', {
          taskId: id,
          duration,
          handoffs: handoffCount,
        });

        return {
          taskId: id,
          output: execution.output,
          success: execution.success,
          trace,
          duration,
        };
      }

      // Max handoffs exceeded
      throw new Error(`Maximum handoffs (${maxHandoffs}) exceeded`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Task failed', {
        taskId: id,
        duration,
        error,
      });

      return {
        taskId: id,
        output: null,
        success: false,
        trace,
        duration,
        error: error as Error,
      };
    } finally {
      this.activeTasks.delete(id);
    }
  }

  /**
   * Execute a single agent
   */
  private async executeAgent(
    agent: Agent,
    input: any,
    context: Map<string, any>
  ): Promise<AgentExecution> {
    const startTime = Date.now();

    try {
      this.logger.debug('Executing agent', {
        id: agent.id,
        name: agent.name,
      });

      // Merge agent context with task context
      const mergedContext = new Map([...context, ...agent.context]);

      // Execute routine
      const result = await agent.routine.execute(input, mergedContext);

      // Update agent context
      agent.context = result.context;

      // Check for handoff conditions
      const handoffTo = await this.checkHandoffs(agent, input, result.context);

      const duration = Date.now() - startTime;

      return {
        agentId: agent.id,
        agentName: agent.name,
        input,
        output: result.output,
        success: result.success,
        duration,
        handoffTo: handoffTo || result.handoff,
        timestamp: new Date(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Agent execution failed', {
        agentId: agent.id,
        error,
      });

      return {
        agentId: agent.id,
        agentName: agent.name,
        input,
        output: null,
        success: false,
        duration,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Check if any handoff conditions are met
   */
  private async checkHandoffs(
    agent: Agent,
    input: any,
    context: Map<string, any>
  ): Promise<string | undefined> {
    for (const handoff of agent.handoffs) {
      try {
        if (handoff.condition(context, input)) {
          this.logger.debug('Handoff condition met', {
            from: agent.id,
            to: handoff.targetAgent,
          });

          // Transfer context variables
          this.transferContext(context, handoff.transferContext);

          return handoff.targetAgent;
        }
      } catch (error) {
        this.logger.error('Handoff condition check failed', {
          from: agent.id,
          to: handoff.targetAgent,
          error,
        });
      }
    }

    return undefined;
  }

  /**
   * Transfer context variables for handoff
   */
  private transferContext(
    context: Map<string, any>,
    variables: string[]
  ): void {
    // In this implementation, context is shared,
    // but we could filter to only transfer specified variables
    this.logger.debug('Transferring context', { variables });
  }

  /**
   * Get default agent (first registered agent)
   */
  private getDefaultAgent(): string | undefined {
    const agents = Array.from(this.agents.values());
    return agents.length > 0 ? agents[0].id : undefined;
  }

  /**
   * Get orchestrator statistics
   */
  getStats(): {
    totalAgents: number;
    activeTasks: number;
    agents: Array<{ id: string; name: string; handoffs: number }>;
  } {
    return {
      totalAgents: this.agents.size,
      activeTasks: this.activeTasks.size,
      agents: Array.from(this.agents.values()).map((a) => ({
        id: a.id,
        name: a.name,
        handoffs: a.handoffs.length,
      })),
    };
  }
}
