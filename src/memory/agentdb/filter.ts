/**
 * Metadata filters for AgentDB vector search.
 *
 * Filters are normalised to the agentdb 3.x / `@ruvector/rvf` expression shape,
 * the same name-based `{ op, field, value }` leaves `agentdb`'s `FilterBuilder`
 * emits. That expression is passed as-is to the agentdb RVF backend, and the
 * in-memory fallback evaluates it with {@link matchesFilter}, so both backends
 * apply the same semantics.
 *
 * Accepted inputs:
 *  - predicate DSL: `{ kind: 'doc', score: { $gt: 0.5 }, tag: { $in: ['a', 'b'] } }`
 *    (keys are ANDed; operators `$eq $ne $lt $le $gt $ge $in $range`, where
 *    `$range: [low, high]` is inclusive at both ends)
 *  - a raw expression: `{ op: 'eq', field: 'kind', value: 'doc' }`, or
 *    `and` / `or` / `not` trees of them
 *
 * Unsupported predicate values (nested objects without a known operator,
 * arrays, `null`) throw instead of being silently ignored, so a filter can
 * never widen into an unfiltered search.
 */

export type FilterValue = string | number | boolean;

export type FilterExpr =
  | { op: 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'; field: string; value: FilterValue }
  | { op: 'in'; field: string; values: FilterValue[] }
  /** Half-open, as in rvf: `low <= value < high`. The DSL `$range` is inclusive. */
  | { op: 'range'; field: string; low: FilterValue; high: FilterValue }
  | { op: 'and' | 'or'; exprs: FilterExpr[] }
  | { op: 'not'; expr: FilterExpr };

export type PredicateValue =
  | FilterValue
  | { $eq: FilterValue }
  | { $ne: FilterValue }
  | { $lt: FilterValue }
  | { $le: FilterValue }
  | { $gt: FilterValue }
  | { $ge: FilterValue }
  | { $in: FilterValue[] }
  | { $range: [FilterValue, FilterValue] };

/** Field name → predicate. All keys must match (AND). */
export type FilterPredicate = Record<string, PredicateValue>;

export type SearchFilter = FilterPredicate | FilterExpr;

const LEAF_OPS = new Set(['eq', 'ne', 'lt', 'le', 'gt', 'ge']);
const DSL_OPS = ['$eq', '$ne', '$lt', '$le', '$gt', '$ge'] as const;
const MAX_EXPRS = 64;
const FORBIDDEN_FIELDS = new Set(['__proto__', 'constructor', 'prototype']);

function isScalar(v: unknown): v is FilterValue {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

function checkField(field: unknown): string {
  if (typeof field !== 'string' || field.length === 0 || field.length > 256) {
    throw new Error(`Invalid filter field name: ${JSON.stringify(field)}`);
  }
  if (FORBIDDEN_FIELDS.has(field)) throw new Error(`Forbidden filter field name: ${field}`);
  return field;
}

function checkScalar(v: unknown, field: string): FilterValue {
  if (!isScalar(v)) {
    throw new Error(
      `Unsupported filter value for "${field}": ${JSON.stringify(v)} (expected string, number or boolean)`
    );
  }
  return v;
}

function isExpr(f: unknown): f is FilterExpr {
  return !!f && typeof f === 'object' && typeof (f as any).op === 'string';
}

/** Validate a raw expression tree (shape, field names, size). */
function validateExpr(e: FilterExpr, budget: { n: number }): FilterExpr {
  if (++budget.n > MAX_EXPRS) throw new Error(`Filter exceeds ${MAX_EXPRS} expressions`);
  const op = (e as any).op;
  if (LEAF_OPS.has(op)) {
    const f = checkField((e as any).field);
    return { op, field: f, value: checkScalar((e as any).value, f) } as FilterExpr;
  }
  if (op === 'in') {
    const f = checkField((e as any).field);
    const values = (e as any).values;
    if (!Array.isArray(values)) throw new Error(`Filter "in" on "${f}" needs a values array`);
    return { op, field: f, values: values.map((v: unknown) => checkScalar(v, f)) };
  }
  if (op === 'range') {
    const f = checkField((e as any).field);
    return { op, field: f, low: checkScalar((e as any).low, f), high: checkScalar((e as any).high, f) };
  }
  if (op === 'and' || op === 'or') {
    const exprs = (e as any).exprs;
    if (!Array.isArray(exprs) || exprs.length === 0) throw new Error(`Filter "${op}" needs exprs`);
    return { op, exprs: exprs.map((x: FilterExpr) => validateExpr(x, budget)) };
  }
  if (op === 'not') return { op, expr: validateExpr((e as any).expr, budget) };
  throw new Error(`Unknown filter op: ${JSON.stringify(op)}`);
}

/**
 * Normalise a predicate DSL object or raw expression into a {@link FilterExpr}.
 * Returns `null` for an empty filter (no constraint).
 */
export function toFilterExpr(filter: SearchFilter | null | undefined): FilterExpr | null {
  if (filter === null || filter === undefined) return null;
  if (typeof filter !== 'object' || Array.isArray(filter)) {
    throw new Error('Search filter must be an object');
  }
  if (isExpr(filter)) return validateExpr(filter, { n: 0 });

  const leaves: FilterExpr[] = [];
  for (const key of Object.keys(filter)) {
    const field = checkField(key);
    const val = (filter as Record<string, unknown>)[key];
    if (isScalar(val)) {
      leaves.push({ op: 'eq', field, value: val });
      continue;
    }
    if (!val || typeof val !== 'object' || Array.isArray(val)) {
      throw new Error(`Unsupported filter predicate for "${field}": ${JSON.stringify(val)}`);
    }
    const ops = Object.keys(val);
    if (ops.length !== 1) {
      throw new Error(`Filter predicate for "${field}" must have exactly one operator, got ${JSON.stringify(ops)}`);
    }
    const [dslOp] = ops;
    const arg = (val as Record<string, unknown>)[dslOp];
    if ((DSL_OPS as readonly string[]).includes(dslOp)) {
      leaves.push({ op: dslOp.slice(1) as 'eq', field, value: checkScalar(arg, field) });
    } else if (dslOp === '$in') {
      if (!Array.isArray(arg)) throw new Error(`$in on "${field}" needs an array`);
      leaves.push({ op: 'in', field, values: arg.map((v) => checkScalar(v, field)) });
    } else if (dslOp === '$range') {
      if (!Array.isArray(arg) || arg.length !== 2) throw new Error(`$range on "${field}" needs [low, high]`);
      // Inclusive range, emitted as and(ge, le) — rvf's native range excludes `high`.
      leaves.push({
        op: 'and',
        exprs: [
          { op: 'ge', field, value: checkScalar(arg[0], field) },
          { op: 'le', field, value: checkScalar(arg[1], field) },
        ],
      });
    } else {
      throw new Error(`Unknown filter operator ${dslOp} for "${field}"`);
    }
    if (leaves.length > MAX_EXPRS) throw new Error(`Filter exceeds ${MAX_EXPRS} expressions`);
  }
  if (leaves.length === 0) return null;
  return leaves.length === 1 ? leaves[0] : { op: 'and', exprs: leaves };
}

function compare(a: unknown, b: FilterValue): number | null {
  if (typeof a !== typeof b) return null;
  if (typeof a === 'number' || typeof a === 'string') return a < (b as any) ? -1 : a > (b as any) ? 1 : 0;
  if (typeof a === 'boolean') return a === b ? 0 : null;
  return null;
}

/**
 * Evaluate a filter expression against one item's metadata, with the same
 * semantics as the rvf backend: a missing field fails every comparison except
 * `ne` (and anything negated with `not`); values of different types never match.
 */
export function matchesFilter(expr: FilterExpr | null, metadata: Record<string, any> | undefined): boolean {
  if (!expr) return true;
  const md = metadata ?? {};
  switch (expr.op) {
    case 'and':
      return expr.exprs.every((e) => matchesFilter(e, md));
    case 'or':
      return expr.exprs.some((e) => matchesFilter(e, md));
    case 'not':
      return !matchesFilter(expr.expr, md);
    case 'in': {
      const has = Object.prototype.hasOwnProperty.call(md, expr.field);
      return has && expr.values.some((v) => compare(md[expr.field], v) === 0);
    }
    case 'range': {
      if (!Object.prototype.hasOwnProperty.call(md, expr.field)) return false;
      const lo = compare(md[expr.field], expr.low);
      const hi = compare(md[expr.field], expr.high);
      return lo !== null && hi !== null && lo >= 0 && hi < 0;
    }
    default: {
      const has = Object.prototype.hasOwnProperty.call(md, expr.field);
      if (!has) return expr.op === 'ne';
      const c = compare(md[expr.field], expr.value);
      if (expr.op === 'ne') return c !== 0;
      if (c === null) return false;
      switch (expr.op) {
        case 'eq':
          return c === 0;
        case 'lt':
          return c < 0;
        case 'le':
          return c <= 0;
        case 'gt':
          return c > 0;
        case 'ge':
          return c >= 0;
      }
      return false;
    }
  }
}
