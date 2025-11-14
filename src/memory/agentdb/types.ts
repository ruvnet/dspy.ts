/**
 * AgentDB Types
 *
 * Type definitions for AgentDB operations
 */

/**
 * Vector data stored in AgentDB
 */
export interface VectorData {
  /**
   * Unique identifier
   */
  id: string;

  /**
   * Vector embedding
   */
  vector: number[];

  /**
   * Metadata associated with the vector
   */
  metadata: Record<string, any>;

  /**
   * Timestamp of creation
   */
  createdAt: Date;

  /**
   * Timestamp of last update
   */
  updatedAt: Date;
}

/**
 * Search result from vector search
 */
export interface SearchResult {
  /**
   * Document ID
   */
  id: string;

  /**
   * Similarity score (0-1, higher is more similar)
   */
  score: number;

  /**
   * Vector data
   */
  data: VectorData;

  /**
   * Distance metric used
   */
  distance: number;
}

/**
 * Search options
 */
export interface SearchOptions {
  /**
   * Number of results to return
   */
  k?: number;

  /**
   * Minimum similarity score threshold
   */
  minScore?: number;

  /**
   * Filter metadata
   */
  filter?: Record<string, any>;

  /**
   * Include vectors in results
   */
  includeVectors?: boolean;

  /**
   * Distance metric
   */
  metric?: 'cosine' | 'euclidean' | 'dot';
}

/**
 * Batch operation result
 */
export interface BatchResult<T> {
  /**
   * Successful operations
   */
  success: T[];

  /**
   * Failed operations
   */
  failed: Array<{
    index: number;
    error: Error;
  }>;
}

/**
 * MCP Tool definition
 */
export interface MCPTool {
  /**
   * Tool name
   */
  name: string;

  /**
   * Tool description
   */
  description: string;

  /**
   * Tool parameters schema
   */
  parameters: Record<string, any>;

  /**
   * Execute the tool
   */
  execute: (params: any) => Promise<any>;
}

/**
 * AgentDB statistics
 */
export interface AgentDBStats {
  /**
   * Total number of vectors
   */
  totalVectors: number;

  /**
   * Index size in bytes
   */
  indexSize: number;

  /**
   * Memory usage in bytes
   */
  memoryUsage: number;

  /**
   * Total searches performed
   */
  totalSearches: number;

  /**
   * Average search latency in milliseconds
   */
  avgSearchLatency: number;

  /**
   * Cache hit rate (0-1)
   */
  cacheHitRate: number;
}
