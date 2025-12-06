/**
 * Lorentz (Hyperboloid) Operations
 *
 * Core operations in the Lorentz model of hyperbolic space.
 * The Lorentz model represents hyperbolic space as the upper sheet of a hyperboloid
 * in Minkowski space with metric signature (-,+,+,...,+).
 *
 * Key advantages over Poincaré ball:
 * 1. No boundary instability (hyperboloid has no boundary)
 * 2. Closed-form centroid computation
 * 3. More numerically stable distance computation
 * 4. Natural for multi-scale hierarchies
 */

import { LorentzVector } from './types';

const EPSILON = 1e-7;

/**
 * Create a Lorentz vector from Euclidean coordinates
 * Projects onto the hyperboloid: -x₀² + x₁² + ... + xₙ² = -1/c
 *
 * @param euclidean - Euclidean vector
 * @param curvature - Negative curvature (default -1.0)
 * @returns Lorentz vector on the hyperboloid
 */
export function euclideanToLorentz(
  euclidean: number[] | Float32Array,
  curvature: number = -1.0
): LorentzVector {
  const c = Math.abs(curvature);
  const sqrtC = Math.sqrt(c);

  // Space-like components
  const space = euclidean instanceof Float32Array
    ? euclidean
    : new Float32Array(euclidean);

  // Compute squared norm of space components
  let spaceNormSq = 0;
  for (let i = 0; i < space.length; i++) {
    spaceNormSq += space[i] * space[i];
  }

  // Time-like component: x₀ = sqrt(1/c + ||x||²)
  // This ensures the point lies on the hyperboloid
  const time = Math.sqrt(1 / c + spaceNormSq);

  return { time, space };
}

/**
 * Convert Lorentz vector back to Euclidean space
 *
 * @param lorentz - Lorentz vector on hyperboloid
 * @param curvature - Negative curvature
 * @returns Euclidean vector
 */
export function lorentzToEuclidean(
  lorentz: LorentzVector,
  curvature: number = -1.0
): Float32Array {
  // Simply return the space-like components
  // (projection onto the tangent space at the origin)
  return new Float32Array(lorentz.space);
}

/**
 * Minkowski inner product: ⟨x, y⟩_L = -x₀y₀ + x₁y₁ + ... + xₙyₙ
 *
 * @param a - First Lorentz vector
 * @param b - Second Lorentz vector
 * @returns Minkowski inner product
 */
export function minkowskiInner(a: LorentzVector, b: LorentzVector): number {
  // Time-like contribution (negative)
  let result = -a.time * b.time;

  // Space-like contribution (positive)
  const len = Math.min(a.space.length, b.space.length);
  for (let i = 0; i < len; i++) {
    result += a.space[i] * b.space[i];
  }

  return result;
}

/**
 * Lorentz distance (geodesic distance on hyperboloid)
 *
 * d_L(x, y) = (1/√c) * acosh(-c * ⟨x, y⟩_L)
 *
 * This is more stable than Poincaré distance because:
 * 1. Single acosh instead of multiple sqrt/division
 * 2. No boundary projection needed
 * 3. Direct inner product computation
 *
 * @param a - First Lorentz vector
 * @param b - Second Lorentz vector
 * @param curvature - Negative curvature
 * @returns Geodesic distance
 */
export function lorentzDistance(
  a: LorentzVector,
  b: LorentzVector,
  curvature: number = -1.0
): number {
  const c = Math.abs(curvature);
  const sqrtC = Math.sqrt(c);

  // Minkowski inner product
  const inner = minkowskiInner(a, b);

  // Clamp for numerical stability (should be ≤ -1/c for points on hyperboloid)
  const arg = Math.max(-c * inner, 1.0 + EPSILON);

  return Math.acosh(arg) / sqrtC;
}

/**
 * Lorentz centroid (Einstein midpoint) - CLOSED FORM
 *
 * This is the key advantage over Poincaré:
 * - Poincaré Fréchet mean: O(n × d × iterations), typically 50 iterations
 * - Lorentz centroid: O(n × d), single pass, closed form
 *
 * Formula: centroid = Σ(wᵢxᵢ) / √(-⟨Σwᵢxᵢ, Σwᵢxᵢ⟩_L)
 *
 * @param vectors - Array of Lorentz vectors
 * @param weights - Optional weights (uniform if not provided)
 * @param curvature - Negative curvature
 * @returns Weighted centroid on the hyperboloid
 */
export function lorentzCentroid(
  vectors: LorentzVector[],
  weights?: number[] | Float32Array,
  curvature: number = -1.0
): LorentzVector {
  if (vectors.length === 0) {
    throw new Error('Cannot compute centroid of empty set');
  }

  if (vectors.length === 1) {
    return vectors[0];
  }

  const dim = vectors[0].space.length;

  // Normalize weights
  let totalWeight = 0;
  if (weights) {
    for (let i = 0; i < weights.length; i++) {
      totalWeight += weights[i];
    }
  } else {
    totalWeight = vectors.length;
  }

  // Compute weighted sum
  let sumTime = 0;
  const sumSpace = new Float32Array(dim);

  for (let i = 0; i < vectors.length; i++) {
    const w = weights ? weights[i] / totalWeight : 1 / vectors.length;
    sumTime += w * vectors[i].time;
    for (let j = 0; j < dim; j++) {
      sumSpace[j] += w * vectors[i].space[j];
    }
  }

  // Compute Minkowski norm of sum: -t² + ||s||²
  let sumNormSq = -sumTime * sumTime;
  for (let i = 0; i < dim; i++) {
    sumNormSq += sumSpace[i] * sumSpace[i];
  }

  // Project onto hyperboloid: divide by sqrt(-norm²)
  // For points on hyperboloid, norm² should be negative
  const normFactor = Math.sqrt(Math.max(-sumNormSq, EPSILON));

  return {
    time: sumTime / normFactor,
    space: sumSpace.map((s) => s / normFactor) as unknown as Float32Array,
  };
}

/**
 * Lorentz exponential map (tangent space → hyperboloid)
 *
 * exp_x(v) = cosh(||v||_L)x + sinh(||v||_L) * v/||v||_L
 *
 * @param base - Base point on hyperboloid
 * @param tangent - Tangent vector at base
 * @param curvature - Negative curvature
 * @returns Point on hyperboloid
 */
export function lorentzExpMap(
  base: LorentzVector,
  tangent: LorentzVector,
  curvature: number = -1.0
): LorentzVector {
  const c = Math.abs(curvature);
  const sqrtC = Math.sqrt(c);

  // Compute Lorentz norm of tangent (in Minkowski metric)
  let normSq = -tangent.time * tangent.time;
  for (let i = 0; i < tangent.space.length; i++) {
    normSq += tangent.space[i] * tangent.space[i];
  }

  // Handle zero tangent
  if (Math.abs(normSq) < EPSILON) {
    return base;
  }

  const norm = Math.sqrt(Math.abs(normSq)) * sqrtC;
  const coshNorm = Math.cosh(norm);
  const sinhNorm = Math.sinh(norm);
  const sinhOverNorm = norm > EPSILON ? sinhNorm / norm : 1.0;

  return {
    time: coshNorm * base.time + sinhOverNorm * sqrtC * tangent.time,
    space: new Float32Array(
      base.space.map(
        (b, i) => coshNorm * b + sinhOverNorm * sqrtC * tangent.space[i]
      )
    ),
  };
}

/**
 * Lorentz logarithmic map (hyperboloid → tangent space)
 *
 * log_x(y) = d(x,y) * (y - ⟨x,y⟩_L * x) / ||y - ⟨x,y⟩_L * x||_L
 *
 * @param base - Base point on hyperboloid
 * @param point - Target point on hyperboloid
 * @param curvature - Negative curvature
 * @returns Tangent vector at base
 */
export function lorentzLogMap(
  base: LorentzVector,
  point: LorentzVector,
  curvature: number = -1.0
): LorentzVector {
  const c = Math.abs(curvature);

  // Minkowski inner product
  const inner = minkowskiInner(base, point);

  // Distance
  const dist = lorentzDistance(base, point, curvature);

  // Compute y - ⟨x,y⟩_L * x
  const diff: LorentzVector = {
    time: point.time + inner * base.time,
    space: new Float32Array(
      point.space.map((p, i) => p + inner * base.space[i])
    ),
  };

  // Compute norm of diff
  let diffNormSq = -diff.time * diff.time;
  for (let i = 0; i < diff.space.length; i++) {
    diffNormSq += diff.space[i] * diff.space[i];
  }
  const diffNorm = Math.sqrt(Math.abs(diffNormSq));

  // Handle zero norm
  if (diffNorm < EPSILON) {
    return {
      time: 0,
      space: new Float32Array(base.space.length),
    };
  }

  const scale = dist / diffNorm;
  return {
    time: scale * diff.time,
    space: new Float32Array(diff.space.map((d) => scale * d)),
  };
}

/**
 * Parallel transport in Lorentz space
 *
 * Transports a tangent vector from one point to another along a geodesic.
 * Critical for attention: allows comparing vectors at different points.
 *
 * @param vector - Tangent vector to transport
 * @param from - Source point
 * @param to - Target point
 * @param curvature - Negative curvature
 * @returns Transported tangent vector at target
 */
export function lorentzParallelTransport(
  vector: LorentzVector,
  from: LorentzVector,
  to: LorentzVector,
  curvature: number = -1.0
): LorentzVector {
  const inner = minkowskiInner(from, to);
  const logVec = lorentzLogMap(from, to, curvature);

  // Compute inner products
  const vLogInner = minkowskiInner(vector, logVec);
  const fromToInner = minkowskiInner(from, to);

  // Handle identity transport
  if (Math.abs(fromToInner + 1) < EPSILON) {
    return vector;
  }

  // Transport formula
  const coeff = vLogInner / (1 + fromToInner);

  return {
    time: vector.time + coeff * (from.time + to.time),
    space: new Float32Array(
      vector.space.map((v, i) => v + coeff * (from.space[i] + to.space[i]))
    ),
  };
}

/**
 * Project point onto hyperboloid (ensure numerical validity)
 *
 * Unlike Poincaré ball projection (which causes boundary instability),
 * hyperboloid projection is stable and rarely needed.
 *
 * @param point - Point that might have drifted off hyperboloid
 * @param curvature - Negative curvature
 * @returns Point projected onto hyperboloid
 */
export function projectToHyperboloid(
  point: LorentzVector,
  curvature: number = -1.0
): LorentzVector {
  const c = Math.abs(curvature);

  // Compute space norm
  let spaceNormSq = 0;
  for (let i = 0; i < point.space.length; i++) {
    spaceNormSq += point.space[i] * point.space[i];
  }

  // Correct time component: x₀ = sqrt(1/c + ||x||²)
  const correctTime = Math.sqrt(1 / c + spaceNormSq);

  return {
    time: correctTime,
    space: point.space,
  };
}

/**
 * Convert Poincaré ball point to Lorentz
 *
 * x_L = (1 + ||x_P||²) / (1 - ||x_P||²), 2x_P / (1 - ||x_P||²)
 *
 * @param poincare - Point in Poincaré ball
 * @param curvature - Negative curvature
 * @returns Lorentz vector
 */
export function poincareToLorentz(
  poincare: number[] | Float32Array,
  curvature: number = -1.0
): LorentzVector {
  const c = Math.abs(curvature);

  let normSq = 0;
  for (let i = 0; i < poincare.length; i++) {
    normSq += poincare[i] * poincare[i];
  }

  // Clamp to ensure we're inside the ball
  if (normSq >= 1 / c) {
    normSq = 1 / c - EPSILON;
  }

  const denom = 1 - c * normSq;
  const time = (1 + c * normSq) / denom;
  const space = new Float32Array(poincare.length);
  for (let i = 0; i < poincare.length; i++) {
    space[i] = (2 * Math.sqrt(c) * poincare[i]) / denom;
  }

  return { time, space };
}

/**
 * Convert Lorentz point to Poincaré ball
 *
 * x_P = x_L[1:] / (1 + x_L[0])
 *
 * @param lorentz - Lorentz vector
 * @param curvature - Negative curvature
 * @returns Point in Poincaré ball
 */
export function lorentzToPoincare(
  lorentz: LorentzVector,
  curvature: number = -1.0
): Float32Array {
  const c = Math.abs(curvature);
  const sqrtC = Math.sqrt(c);

  const denom = 1 + lorentz.time;
  const result = new Float32Array(lorentz.space.length);

  for (let i = 0; i < lorentz.space.length; i++) {
    result[i] = lorentz.space[i] / (sqrtC * denom);
  }

  return result;
}

/**
 * Batch convert Euclidean vectors to Lorentz
 */
export function batchEuclideanToLorentz(
  vectors: (number[] | Float32Array)[],
  curvature: number = -1.0
): LorentzVector[] {
  return vectors.map((v) => euclideanToLorentz(v, curvature));
}

/**
 * Batch compute Lorentz distances (optimized)
 */
export function batchLorentzDistance(
  query: LorentzVector,
  targets: LorentzVector[],
  curvature: number = -1.0
): Float32Array {
  const distances = new Float32Array(targets.length);
  const c = Math.abs(curvature);
  const sqrtC = Math.sqrt(c);

  for (let i = 0; i < targets.length; i++) {
    const inner = minkowskiInner(query, targets[i]);
    const arg = Math.max(-c * inner, 1.0 + EPSILON);
    distances[i] = Math.acosh(arg) / sqrtC;
  }

  return distances;
}
