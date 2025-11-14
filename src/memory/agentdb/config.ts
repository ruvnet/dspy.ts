/**
 * AgentDB Configuration
 *
 * Configuration types and defaults for AgentDB integration
 */

export interface AgentDBConfig {
  /**
   * Vector dimension for embeddings
   */
  vectorDimension: number;

  /**
   * Index type for vector search
   */
  indexType: 'hnsw' | 'flat' | 'ivf';

  /**
   * HNSW-specific parameters
   */
  hnswParams?: {
    m: number;
    efConstruction: number;
    efSearch: number;
  };

  /**
   * IVF-specific parameters
   */
  ivfParams?: {
    nlist: number;
    nprobe: number;
  };

  /**
   * Enable MCP (Model Context Protocol) integration
   */
  mcpEnabled: boolean;

  /**
   * Frontier memory features
   */
  frontierMemory: {
    /**
     * Enable causal reasoning
     */
    causalReasoning: boolean;

    /**
     * Enable reflexion memory with self-critique
     */
    reflexionMemory: boolean;

    /**
     * Enable skill library with semantic search
     */
    skillLibrary: boolean;

    /**
     * Enable automated learning system
     */
    automatedLearning: boolean;
  };

  /**
   * Storage configuration
   */
  storage: {
    /**
     * Storage path for persistent data
     */
    path: string;

    /**
     * Enable in-memory mode (no persistence)
     */
    inMemory: boolean;

    /**
     * Auto-save interval in milliseconds
     */
    autoSaveInterval?: number;
  };

  /**
   * Performance tuning
   */
  performance: {
    /**
     * Maximum number of concurrent operations
     */
    maxConcurrency: number;

    /**
     * Cache size for search results
     */
    cacheSize: number;

    /**
     * Enable batch operations
     */
    batchEnabled: boolean;
  };
}

/**
 * Default AgentDB configuration
 */
export const DEFAULT_AGENTDB_CONFIG: AgentDBConfig = {
  vectorDimension: 768,
  indexType: 'hnsw',
  hnswParams: {
    m: 16,
    efConstruction: 200,
    efSearch: 50,
  },
  mcpEnabled: true,
  frontierMemory: {
    causalReasoning: true,
    reflexionMemory: true,
    skillLibrary: true,
    automatedLearning: true,
  },
  storage: {
    path: './data/agentdb',
    inMemory: false,
    autoSaveInterval: 60000, // 1 minute
  },
  performance: {
    maxConcurrency: 10,
    cacheSize: 1000,
    batchEnabled: true,
  },
};

/**
 * Merge user config with defaults
 */
export function mergeConfig(
  userConfig: Partial<AgentDBConfig>
): AgentDBConfig {
  const config: AgentDBConfig = {
    ...DEFAULT_AGENTDB_CONFIG,
    ...userConfig,
    frontierMemory: {
      ...DEFAULT_AGENTDB_CONFIG.frontierMemory,
      ...userConfig.frontierMemory,
    },
    storage: {
      ...DEFAULT_AGENTDB_CONFIG.storage,
      ...userConfig.storage,
    },
    performance: {
      ...DEFAULT_AGENTDB_CONFIG.performance,
      ...userConfig.performance,
    },
  };

  if (userConfig.hnswParams) {
    config.hnswParams = {
      ...DEFAULT_AGENTDB_CONFIG.hnswParams!,
      ...userConfig.hnswParams,
    };
  }

  if (userConfig.ivfParams) {
    config.ivfParams = {
      ...userConfig.ivfParams,
    };
  }

  return config;
}
