// Per-cell negotiated pricing — the AM Pricing Worksheet (Step3Commercials).
// Generalizes the legacy single discount_pct (one uniform % off every line)
// into per-line, per-column negotiation: the AM can type a specific price
// into any one-time or year cell of the priced result, and this module folds
// those cells back into a coherent ModeResult. Pure; reads the (read-only)
// engine2 ModeResult/ComponentLine shapes but performs no engine math itself
// — engine2/* stays untouched.
import type { ComponentKey, ComponentLine, ModeResult, TraceStep } from '../engine2/types'

/**
 * Per-cell negotiated prices, keyed "componentKey:one_time" or
 * "componentKey:y{index}" (0-based year, e.g. "cm:y0" = CM Year 1). Absent
 * key = list price for that cell.
 */
export type PricingOverrides = Record<string, number>

export function overrideKey(component: ComponentKey, cell: 'one_time' | number): string {
  return cell === 'one_time' ? `${component}:one_time` : `${component}:y${cell}`
}

const inr = (n: number): string => n.toLocaleString('en-IN')

/** Ignore negative/non-finite overrides (a stray -1 or NaN from a cleared
 * input never silently zeroes out a price). */
function validOverride(v: number | undefined): v is number {
  return v !== undefined && Number.isFinite(v) && v >= 0
}

function cellLabel(cell: 'one_time' | number): string {
  return cell === 'one_time' ? 'one-time' : `Year ${cell + 1}`
}

/**
 * Applies per-cell overrides to one priced ModeResult, returning a NEW
 * ModeResult (the input is never mutated):
 *  - each INCLUDED line's one_time_inr / years_inr[i] is replaced by its
 *    override when present and valid; excluded (zero-value) lines pass
 *    through untouched — they never appear in the worksheet grid;
 *  - per-line recurring_inr becomes years_inr[1] when a Year 2 cell exists
 *    (i.e. tco_years >= 2), else the original recurring_inr is kept (there is
 *    no Year 2 to override for a 1-year TCO);
 *  - per-line tco_inr = sum(years_inr) — one_time_inr is always a SUBSET of
 *    Year 1 in engine2's own line-building (buildLine), never an additive
 *    term, so the TCO math never double-counts it even though the worksheet
 *    grid lets the AM edit the two cells independently;
 *  - mode totals (total_one_time_inr / total_year1_inr / total_recurring_inr /
 *    total_years_inr / total_tco_inr) are re-summed from the adjusted lines;
 *  - net_total_tco_inr / net_total_year1_inr are set to those SAME adjusted
 *    totals — the worksheet IS the negotiation, so a legacy discount_pct
 *    baked into the input `result` by engine2's price() is superseded, not
 *    layered on top again (see wizardLogic.buildRecord, which only calls this
 *    function when hasOverrides(...) is true, so a record with no worksheet
 *    edits keeps its legacy discount_pct-derived net totals untouched);
 *  - the trace gains one "Negotiated price" step per overridden cell, so the
 *    list→negotiated change is as transparent as every other calculation.
 */
export function applyPricingOverrides(result: ModeResult, overrides: PricingOverrides | undefined): ModeResult {
  const ov = overrides ?? {}
  const trace: TraceStep[] = [...result.trace]

  const lines: ComponentLine[] = result.lines.map((line): ComponentLine => {
    if (!line.included) return line

    const oneTimeOverride = ov[overrideKey(line.component_key, 'one_time')]
    const one_time_inr = validOverride(oneTimeOverride) ? oneTimeOverride : line.one_time_inr
    if (validOverride(oneTimeOverride)) {
      trace.push({
        label: 'Negotiated price',
        formula: `${line.label}, ${cellLabel('one_time')}: list ₹${inr(line.one_time_inr)} → ₹${inr(one_time_inr)}`,
        result: one_time_inr,
      })
    }

    const years_inr = line.years_inr.map((listValue, i) => {
      const o = ov[overrideKey(line.component_key, i)]
      if (!validOverride(o)) return listValue
      trace.push({
        label: 'Negotiated price',
        formula: `${line.label}, ${cellLabel(i)}: list ₹${inr(listValue)} → ₹${inr(o)}`,
        result: o,
      })
      return o
    })

    const year1_inr = years_inr[0] ?? line.year1_inr
    const recurring_inr = years_inr[1] ?? line.recurring_inr
    const tco_inr = years_inr.reduce((a, b) => a + b, 0)

    return { ...line, one_time_inr, year1_inr, recurring_inr, years_inr, tco_inr }
  })

  const sum = (f: (l: ComponentLine) => number): number => lines.reduce((a, l) => a + f(l), 0)
  const yearCount = result.total_years_inr.length
  const total_years_inr = Array.from({ length: yearCount }, (_, i) => sum((l) => l.years_inr[i]))
  const total_tco_inr = sum((l) => l.tco_inr)
  const total_one_time_inr = sum((l) => l.one_time_inr)
  const total_recurring_inr = sum((l) => l.recurring_inr)
  const total_year1_inr = total_years_inr[0] ?? 0

  return {
    ...result,
    lines,
    total_one_time_inr,
    total_year1_inr,
    total_recurring_inr,
    total_years_inr,
    total_tco_inr,
    net_total_tco_inr: total_tco_inr,
    net_total_year1_inr: total_year1_inr,
    trace,
  }
}

/** True when at least one cell has been negotiated. */
export function hasOverrides(overrides: PricingOverrides | undefined): boolean {
  return !!overrides && Object.keys(overrides).length > 0
}

/**
 * The worksheet's "Apply % across" toolbar action: builds an override for
 * EVERY non-zero cell (one-time + each year) of every included line, at
 * list × (1 − pct), rounded to the rupee. `pct` is a 0..1 fraction (same
 * convention as DealInputs.discount_pct) — a fresh map, meant to REPLACE
 * `pricing_overrides` wholesale (a deliberate bulk reset, not a merge).
 */
export function applyPctAcross(result: ModeResult, pct: number): PricingOverrides {
  const p = Number.isFinite(pct) ? Math.min(Math.max(pct, 0), 1) : 0
  const overrides: PricingOverrides = {}
  for (const line of result.lines) {
    if (!line.included) continue
    if (line.one_time_inr !== 0) {
      overrides[overrideKey(line.component_key, 'one_time')] = Math.round(line.one_time_inr * (1 - p))
    }
    line.years_inr.forEach((y, i) => {
      if (y !== 0) overrides[overrideKey(line.component_key, i)] = Math.round(y * (1 - p))
    })
  }
  return overrides
}

/**
 * List-vs-negotiated summary at the mode-total level. `result` is the
 * pre-override ModeResult (engine2's price() output — the "list" side);
 * `adjusted` is applyPricingOverrides(result, overrides) (the "negotiated"
 * side). Used by PricePanel's muted "list ₹X" line and by formats'
 * List/Adjustment/Negotiated TOTAL-row rendering (see formats/shared.ts's
 * totalRowInputs).
 */
export function listVsNegotiated(
  result: ModeResult,
  adjusted: ModeResult,
): { list_tco: number; negotiated_tco: number; list_y1: number; negotiated_y1: number } {
  return {
    list_tco: result.total_tco_inr,
    negotiated_tco: adjusted.total_tco_inr,
    list_y1: result.total_year1_inr,
    negotiated_y1: adjusted.total_year1_inr,
  }
}
