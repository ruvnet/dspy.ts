/**
 * AgentDB Module
 *
 * Vector database integration with frontier memory features
 */

export * from './client';
export * from './config';
export * from './types';
export { toFilterExpr, matchesFilter } from './filter';
export type { FilterExpr, FilterPredicate, PredicateValue, SearchFilter, FilterValue } from './filter';
export type { VectorBackend } from './backends';
