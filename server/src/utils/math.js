/** Small numeric helpers that replace the numpy calls used by the original Python tool. */

export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function median(values) {
  if (!values.length) return 0;
  const sorted = Float64Array.from(values).sort();
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mean(values) {
  if (!values.length) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function argmax(values, from = 0, to = values.length) {
  let best = from;
  for (let i = from; i < to; i += 1) if (values[i] > values[best]) best = i;
  return best;
}

/** numpy.linspace(start, stop, count) */
export function linspace(start, stop, count) {
  if (count <= 1) return [start];
  const step = (stop - start) / (count - 1);
  return Array.from({ length: count }, (_, i) => start + step * i);
}

/** Python's round(): banker's rounding is not needed here; mirrors round-half-away for positive values. */
export const round = (value, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/** Python floor division for non-negative integers. */
export const floorDiv = (a, b) => Math.floor(a / b);
