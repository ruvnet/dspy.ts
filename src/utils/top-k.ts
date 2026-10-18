/** Stable bounded selection. Comparator follows Array.sort conventions.
 * Keeps O(k) candidates and sorts only the final winners.
 */
export function topK<T>(items: Iterable<T>, k: number, compare: (a: T, b: T) => number): T[] {
  // Preserve Array.slice semantics for legacy unusual limits.
  if (!Number.isSafeInteger(k) || k < 0) return Array.from(items).sort(compare).slice(0, k);
  if (k === 0) return [];
  type Entry = { value: T; order: number };
  const heap: Entry[] = [];
  const cmp = (a: Entry, b: Entry): number => compare(a.value, b.value) || a.order - b.order;
  let order = 0;
  for (const value of items) {
    const entry = { value, order: order++ };
    if (heap.length < k) {
      heap.push(entry);
      let i = heap.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (cmp(heap[i], heap[parent]) <= 0) break;
        [heap[i], heap[parent]] = [heap[parent], heap[i]];
        i = parent;
      }
    } else if (cmp(entry, heap[0]) < 0) {
      heap[0] = entry;
      let i = 0;
      while (2 * i + 1 < heap.length) {
        let child = 2 * i + 1;
        if (child + 1 < heap.length && cmp(heap[child + 1], heap[child]) > 0) child++;
        if (cmp(heap[i], heap[child]) >= 0) break;
        [heap[i], heap[child]] = [heap[child], heap[i]];
        i = child;
      }
    }
  }
  return heap.sort(cmp).map((entry) => entry.value);
}
