/**
 * Swarm Agent Types
 *
 * Type definitions for the Swarm multi-agent orchestration system
 */

/**
 * Agent definition
 */
export interface Agent {
  /**
   * Unique identifier
   */
  id: string;

  /**
   * Agent name
   */
  name: string;

  /**
   * Agent description
   */
  description: string;

  /**
   * Routine (instructions) for the agent
   */
  routine: Routine;

  /**
   * Available handoffs to other agents
   */
  handoffs: Handoff[];

  /**
   * Agent context (state)
   */
  context: Map<string, any>;

  /**
   * Metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Routine - predefined instructions for an agent
 */
export interface Routine {
  /**
   * Instructions for the agent
   */
  instructions: string;

  /**
   * Tools available to the agent
   */
  tools: Tool[];

  /**
   * Execute the routine
   */
  execute: (input: any, context: Map<string, any>) => Promise<RoutineResult>;
}

/**
 * Result from routine execution
 */
export interface RoutineResult {
  /**
   * Output produced
   */
  output: any;

  /**
   * Whether execution was successful
   */
  success: boolean;

  /**
   * Updated context
   */
  context: Map<string, any>;

  /**
   * Suggested handoff (if any)
   */
  handoff?: string;

  /**
   * Execution metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Handoff - delegation to another agent
 */
export interface Handoff {
  /**
   * Target agent ID
   */
  targetAgent: string;

  /**
   * Condition for handoff (function or boolean)
   */
  condition: (context: Map<string, any>, input: any) => boolean;

  /**
   * Context variables to transfer
   */
  transferContext: string[];

  /**
   * Description of the handoff
   */
  description?: string;
}

/**
 * Tool that agents can use
 */
export interface Tool {
  /**
   * Tool name
   */
  name: string;

  /**
   * Tool description
   */
  description: string;

  /**
   * Parameters schema
   */
  parameters: Record<string, ToolParameter>;

  /**
   * Execute the tool
   */
  execute: (params: any) => Promise<any>;
}

/**
 * Tool parameter definition
 */
export interface ToolParameter {
  /**
   * Parameter type
   */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';

  /**
   * Parameter description
   */
  description: string;

  /**
   * Whether parameter is required
   */
  required: boolean;

  /**
   * Default value
   */
  default?: any;
}

/**
 * Task to be executed by the swarm
 */
export interface Task {
  /**
   * Task ID
   */
  id: string;

  /**
   * Input for the task
   */
  input: any;

  /**
   * Starting agent ID
   */
  startAgent?: string;

  /**
   * Maximum number of handoffs
   */
  maxHandoffs?: number;

  /**
   * Timeout in milliseconds
   */
  timeout?: number;

  /**
   * Task context
   */
  context?: Map<string, any>;
}

/**
 * Result from task execution
 */
export interface TaskResult {
  /**
   * Task ID
   */
  taskId: string;

  /**
   * Final output
   */
  output: any;

  /**
   * Whether task succeeded
   */
  success: boolean;

  /**
   * Agent execution trace
   */
  trace: AgentExecution[];

  /**
   * Total execution time in ms
   */
  duration: number;

  /**
   * Error if failed
   */
  error?: Error;
}

/**
 * Single agent execution in the trace
 */
export interface AgentExecution {
  /**
   * Agent ID
   */
  agentId: string;

  /**
   * Agent name
   */
  agentName: string;

  /**
   * Input received
   */
  input: any;

  /**
   * Output produced
   */
  output: any;

  /**
   * Success status
   */
  success: boolean;

  /**
   * Execution time in ms
   */
  duration: number;

  /**
   * Handoff to next agent (if any)
   */
  handoffTo?: string;

  /**
   * Timestamp
   */
  timestamp: Date;
}

/**
 * Swarm configuration
 */
export interface SwarmConfig {
  /**
   * Default maximum handoffs
   */
  defaultMaxHandoffs: number;

  /**
   * Default task timeout
   */
  defaultTimeout: number;

  /**
   * Enable logging
   */
  enableLogging: boolean;

  /**
   * Maximum concurrent tasks
   */
  maxConcurrentTasks: number;
}
