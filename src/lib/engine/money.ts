// Money helpers. All money is integer rupees (decision D2). Percentages and the
// ROPA multiplier are applied via integer basis-point math so the result is
// deterministic with no floating-point money — same inputs always give the same
// integer rupees.

/** Convert a ratio (0.18, 0.12, 0.7, 0.30) to integer basis points (1800, 1200, 7000, 3000). */
export function toBasisPoints(ratio: number): number {
  return Math.round(ratio * 10000)
}

/**
 * Apply a ratio to an integer-rupee amount with HALF-UP rounding to the nearest
 * rupee. Pure integer arithmetic: floor((amount * bps + 5000) / 10000).
 *
 * `amount` must already be an integer number of rupees. The `rounding` mode is
 * accepted for forward-compatibility; only 'half_up' is implemented and anything
 * else falls back to half-up (the published default).
 */
export function applyRatio(amount: number, ratio: number, rounding = 'half_up'): number {
  void rounding // only half_up implemented in Stage 1
  const bps = toBasisPoints(ratio)
  return Math.floor((amount * bps + 5000) / 10000)
}
