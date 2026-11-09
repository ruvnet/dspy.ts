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
     * Storage path for persistent data. Only a path passed explicitly by the
     * caller is persisted (agentdb RVF file; a path ending in `.rvf` is the
     * file, anything else a directory holding `vectors.rvf`). The default is
     * never written to.
     */
    path: string;

    /**
     * Enable in-memory mode (no persistence, even if `path` is set)
     */
    inMemory: boolean;

    /**
     * Vector backend: `'auto'` (default) uses agentdb >= 3.7 when it loads and
     * the in-memory JS store otherwise; `'agentdb'` requires agentdb;
     * `'memory'` always uses the JS store.
     */
    backend?: 'auto' | 'agentdb' | 'memory';

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

    /**
     * Vector quantization. `'rabitq'` stores a 1-bit-per-dimension sign code
     * alongside each vector (~32× smaller than float32), searches with Hamming
     * distance as a coarse filter, then re-ranks the top `rerankFactor × k`
     * candidates with full cosine. `'none'` (default) keeps full-precision search.
     */
    quantization?: 'none' | 'rabitq';

    /**
     * Over-sampling factor for the RaBitQ coarse pass (default 3): the Hamming
     * pre-filter keeps `rerankFactor × k` candidates before cosine re-rank.
     */
    rerankFactor?: number;
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
    quantization: 'none',
    rerankFactor: 3,
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
