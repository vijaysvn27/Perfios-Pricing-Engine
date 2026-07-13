// Shared copy and helpers used by every format builder (moduleWise, perfios).
// Keeping the CM module copy and the discount-row logic in one place means
// the two formats can never drift on wording or on how a discount is (or
// isn't) shown to the client (D4 in the design doc).
import type { ComponentLine, ModeResult, TraceStep } from '../../engine2/types'
import { formatINR } from '../../format'
import type { ClientSafeProposal } from '../clientSafe'
import { hasOverrides, listVsNegotiated } from '../pricingOverrides'

/** The 7 Consent Manager modules — verbatim copy, used everywhere "What You
 * Get" appears (module-wise implicitly via the CM line label, and perfios
 * section 1). */
export const CM_MODULES_COPY: string[] = [
  '1. Consent Notice & Templates — DPDP notice, 22 languages, omnichannel, audio readout, self & nomination',
  '2. Data Principal Rights Portal (DPAR) — access, update, revoke, nomination with KYC, grievance',
  '3. Cookie Consent Manager — granular categories, banner & library deployment',
  '4. Consent Governance (Consent Bridge) — DPO dashboards, audit logs, versioning, maker-checker, rule engine, RBAC, auto-renewal, bulk, OCR',
  '5. Consent Breach Module — breach detection, consent-to-data tie-back, DSAR tie-back',
  '6. Vendor / Third-Party Module — automated API calls to processors, vendor reporting',
  '7. Data Privacy Risk Assessment (DPIA) — DPIA with risk scoring and versioning — delivered in full when ' +
    'DSPM/DAM are in scope (automated discovery feeds the assessment)',
]

export const CM_MODULES_CLOSING_LINE = 'Unlimited consents and actions per data principal.'

/** Bullets for a "What You Get" section: the 7 modules + closing line. */
export function whatYouGetBullets(): string[] {
  return [...CM_MODULES_COPY, CM_MODULES_CLOSING_LINE]
}

/** Format a 0..1 fraction as a percent string without spurious decimals. */
export function fmtPct(d: number): string {
  const pct = Math.round(d * 10000) / 100 // 2dp max, trimmed
  return `${Number(pct.toFixed(2))}%`
}

/**
 * Blank-not-zero rule (owner 2026-07-13: "Fields not included in the pricing
 * should be left empty"): a table cell with no charge renders as an empty
 * string, never "0" or "—". Applied at the point every RenderTable row is
 * built (this file's discountTotalRows, and every format/sizing table), so
 * excelExport and RenderModelView — which already render non-number cells
 * as plain text — never have to special-case a numeric zero.
 */
export function blankIfZero(n: number): string | number {
  return n === 0 ? '' : n
}

/** Look up a trace step's numeric result by its exact label. */
export function traceValue(trace: TraceStep[], label: string): number | undefined {
  return trace.find((s) => s.label === label)?.result
}

/** Look up a trace step's formula string by its exact label. */
export function traceFormula(trace: TraceStep[], label: string): string | undefined {
  return trace.find((s) => s.label === label)?.formula
}

/**
 * Per-user (per-DP) overage rate, formatted for client copy: "₹2". The
 * engine derives this as a whole-rupee figure (ceil(platform ÷ tier
 * capacity) — see ModeResult.saas_per_user_rate / engine2.ts's
 * priceCmSaas), so this is a plain INR render, not a 2-decimal one.
 */
export function formatPerUserRate(rate: number): string {
  return formatINR(rate)
}

/**
 * The Year-2+ renewal percentage baked into engine2's `Year 2+ renewal (N%
 * of platform)` trace step label (RATE_CARD_SEED.saas_cm.y2_floor_pct, 30%
 * as seeded) — read off the trace rather than hardcoded so a rate-card
 * change is reflected in every rendered sentence automatically. Falls back
 * to '30' (the seeded default) only when the step is missing entirely
 * (on-prem results, which never carry it).
 */
function renewalPct(trace: TraceStep[]): string {
  const step = trace.find((s) => /^Year 2\+ renewal/.test(s.label))
  const m = step?.label.match(/\(([\d.]+)% of platform\)/)
  return m ? m[1] : '30'
}

/**
 * "Included DPs + overage" framing (Honda pattern): the Year-1 platform fee
 * includes the tier's bundled data-principal count and covers every consent
 * action for those data principals; data principals beyond that bundle are
 * charged at the derived per-DP rate, billed on actuals; from Year 2 the
 * platform renews at the engine's y2_floor_pct of the Year-1 fee (owner
 * direction 2026-07-13: SaaS/Hybrid Year 2+ is renewal + overage on
 * actuals, no longer the full platform fee recurring). Reads
 * `ModeResult.saas_included_dp` / `saas_per_user_rate` — NOT
 * `inputs.dp_base_y1` (the committed base, a different number from the
 * bundle) — so this always names the actual bundle the platform fee
 * carries. Only meaningful for SaaS/Hybrid (on-prem has neither field) —
 * returns undefined so callers can omit the note entirely rather than
 * render a broken sentence. The leading "Included:" prefix is intentional:
 * excelExport.ts detects it to apply the green callout fill (mirrors
 * Honda's INCLUDED CONSENTS callout).
 */
export function includedDpNote(p: ClientSafeProposal): string | undefined {
  const result = p.results[0]
  const rate = result?.saas_per_user_rate
  const included = result?.saas_included_dp
  if (rate === undefined || included === undefined) return undefined
  return (
    `Included: ${included.toLocaleString('en-IN')} data principals — covering all consent actions (grant, ` +
    `revocation, modification, deletion, cookie consent) — in the Year-1 platform fee. Beyond the bundle: ` +
    `${formatPerUserRate(rate)} per data principal per year, billed on actuals. From Year 2, the platform renews ` +
    `at ${renewalPct(result.trace)}% of the Year-1 platform fee.`
  )
}

/**
 * Year-2+ rule sentence for the SaaS/hybrid model (owner direction
 * 2026-07-13, CM Calculator call with Rohit): Year 2 onward bills the
 * renewal — y2_floor_pct of the Year-1 platform fee — plus any data
 * principals beyond the included bundle at the same per-DP rate, billed on
 * actuals. Supersedes the earlier "platform fee recurs in full" framing.
 */
export function year2RuleNote(trace: TraceStep[]): string {
  return (
    `From Year 2 onward, your annual fee is the renewal (${renewalPct(trace)}% of the Year-1 platform fee) plus ` +
    'any data principals beyond the included bundle, billed on actuals at the same per-DP rate.'
  )
}

/** Client caveat required alongside every SaaS/hybrid per-user quote (Vi
 * documentation call, 2026-07-07): consent modifications by existing data
 * principals never inflate the billed user count. */
export const CONSENT_MODIFICATION_CAVEAT =
  'Existing data principals who modify, renew, or revoke consent in later years are not counted as new users — they stay covered under your committed base. Only net-new data principals count toward your user count.'

export function findLine(result: ModeResult, key: ComponentLine['component_key']): ComponentLine {
  const line = result.lines.find((l) => l.component_key === key)
  if (!line) throw new Error(`engine result missing component line: ${key}`)
  return line
}

/**
 * Discount/negotiation rows for a totals line (D4, extended for per-cell
 * worksheet overrides): list/adjustment/net when a difference is shown; a
 * single net-only row when it's hidden; a single undiscounted row when
 * `years === netYears` throughout. `tco` is optional — omit it for tables
 * that only show per-year figures.
 *
 * `overrides: true` (set by callers via formats/shared.ts's totalRowInputs,
 * whenever the deal has AM Pricing Worksheet edits — pricingOverrides.ts)
 * reuses this exact same three-row shape but labels the middle row
 * "Adjustment" (a plain delta, since a mix of per-cell increases/decreases
 * has no single percentage to name) and the third "— Negotiated" instead of
 * "— Net". `overrides` and a non-zero `discount_pct` are mutually exclusive
 * in practice (wizardLogic.buildRecord only applies pricing_overrides when
 * present, at which point they supersede discount_pct for that record's
 * totals) — `overrides` always wins when both are somehow set.
 */
export function discountTotalRows(opts: {
  label: string
  years: number[]
  netYears: number[]
  tco?: number
  netTco?: number
  discount_pct: number
  discount_shown: boolean
  overrides?: boolean
}): (string | number)[][] {
  const { label, years, netYears, tco, netTco, discount_pct: d, discount_shown, overrides } = opts
  const row = (lbl: string, ys: number[], t?: number): (string | number)[] =>
    t !== undefined ? [lbl, ...ys.map(blankIfZero), blankIfZero(t)] : [lbl, ...ys.map(blankIfZero)]

  if (overrides) {
    if (!discount_shown) return [row(label, netYears, netTco)]
    const deltaYears = years.map((y, i) => -(y - netYears[i]))
    const deltaTco = tco !== undefined && netTco !== undefined ? -(tco - netTco) : undefined
    return [
      row(`${label} — List`, years, tco),
      row('Adjustment', deltaYears, deltaTco),
      row(`${label} — Negotiated`, netYears, netTco),
    ]
  }

  if (d > 0 && discount_shown) {
    const discYears = years.map((y, i) => -(y - netYears[i]))
    const discTco = tco !== undefined && netTco !== undefined ? -(tco - netTco) : undefined
    return [
      row(`${label} — List`, years, tco),
      row(`Discount (${fmtPct(d)})`, discYears, discTco),
      row(`${label} — Net`, netYears, netTco),
    ]
  }
  if (d > 0 && !discount_shown) {
    return [row(label, netYears, netTco)]
  }
  return [row(label, years, tco)]
}

/**
 * Assembles the (years, netYears, tco, netTco, overrides) tuple a mode's
 * TOTAL row needs, choosing between the two mutually-exclusive sources of
 * "what's negotiated":
 *  - worksheet overrides present (hasOverrides + a matching list_results
 *    entry): `result` (in ClientSafeProposal.results) is already the
 *    NEGOTIATED ModeResult (wizardLogic.buildRecord applies
 *    applyPricingOverrides before it lands there); `listResult` (from
 *    ClientSafeProposal.list_results) is the pre-override list. Delegates the
 *    Year-1/TCO pair to listVsNegotiated so PricePanel and formats read the
 *    same numbers off the same helper.
 *  - otherwise (legacy path, unchanged): `result` IS the list, and the net
 *    side is derived from discount_pct via netYearsOf / net_total_*.
 */
export interface TotalRowInputs {
  years: number[]
  netYears: number[]
  tco: number
  netTco: number
  /** Total Year 1 — always years[0]/netYears[0], surfaced separately for
   * callers (buildCompare) that need the scalar without slicing the array. */
  year1: number
  netYear1: number
  /** Total annual (Year 2+) — NOT necessarily years[1] (a 1-year TCO has no
   * Year 2 in the years array at all, but total_recurring_inr always exists
   * structurally), so this is sourced from total_recurring_inr directly. */
  recurring: number
  netRecurring: number
  overrides: boolean
}

export function totalRowInputs(p: ClientSafeProposal, result: ModeResult, listResult: ModeResult | undefined): TotalRowInputs {
  if (hasOverrides(p.inputs.pricing_overrides) && listResult) {
    const lvn = listVsNegotiated(listResult, result)
    return {
      years: listResult.total_years_inr,
      netYears: result.total_years_inr,
      tco: lvn.list_tco,
      netTco: lvn.negotiated_tco,
      year1: lvn.list_y1,
      netYear1: lvn.negotiated_y1,
      recurring: listResult.total_recurring_inr,
      netRecurring: result.total_recurring_inr,
      overrides: true,
    }
  }
  const d = p.inputs.discount_pct
  return {
    years: result.total_years_inr,
    netYears: netYearsOf(result.total_years_inr, d),
    tco: result.total_tco_inr,
    netTco: result.net_total_tco_inr,
    year1: result.total_year1_inr,
    netYear1: result.net_total_year1_inr,
    recurring: result.total_recurring_inr,
    netRecurring: netYearsOf([result.total_recurring_inr], d)[0],
    overrides: false,
  }
}

/** Net (discounted) per-year totals, rounded the same way the engine rounds
 * net_total_tco_inr / net_total_year1_inr (round(x * (1-d))). */
export function netYearsOf(years: number[], discount_pct: number): number[] {
  const d = Math.min(Math.max(discount_pct, 0), 1)
  return years.map((y) => Math.round(y * (1 - d)))
}

export { formatINR }
