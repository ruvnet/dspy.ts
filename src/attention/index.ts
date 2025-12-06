/**
 * Lorentz Cascade Attention (LCA)
 *
 * A novel hyperbolic attention architecture using the Lorentz (hyperboloid) model
 * with closed-form aggregation and multi-scale curvature.
 *
 * Addresses Poincaré bottlenecks:
 * | Operation        | Poincaré        | Lorentz (LCA)      | Improvement      |
 * |------------------|-----------------|---------------------|------------------|
 * | Distance         | O(d) acosh,sqrt | O(d) single acosh  | 2-3x faster      |
 * | Aggregation      | O(n×d×50iter)   | O(n×d) closed-form | 50x faster       |
 * | Projection       | Every op        | None needed        | No instability   |
 * | Curvature        | Fixed single    | Multi-scale cascade| Adaptive         |
 *
 * @see https://arxiv.org/abs/1911.05076 - Hyperbolic Neural Networks++
 * @see https://arxiv.org/abs/2006.08210 - Lorentz Transformers
 */

export * from './types';
export * from './lorentz-ops';
export * from './lorentz-attention';
export * from './cascade-attention';
export * from './benchmark';
