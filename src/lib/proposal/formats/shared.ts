// Shared copy and helpers used by every format builder (moduleWise, perfios).
// Keeping the CM module copy and the discount-row logic in one place means
// the two formats can never drift on wording or on how a discount is (or
// isn't) shown to the client (D4 in the design doc).
import type { ComponentLine, ModeResult, TraceStep } from '../../engine2/types'
import { formatINR } from '../../format'
import type { ClientSafeProposal } from '../clientSafe'

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
 * "Included DPs + overage" framing (Honda pattern): the Year-1 platform fee
 * includes the tier's bundled data-principal count; data principals beyond
 * that bundle are charged at the derived per-DP rate, billed on actuals.
 * Reads `ModeResult.saas_included_dp` / `saas_per_user_rate` — NOT
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
    `Included: ${included.toLocaleString('en-IN')} data principals in the Year-1 platform fee. ` +
    `Data principals beyond the bundle are charged at ${formatPerUserRate(rate)} per data principal per year, ` +
    `billed on actuals.`
  )
}

/**
 * Year-2+ rule sentence for the SaaS/hybrid model: the Year-1 platform fee
 * recurs every year as the committed base, and data principals beyond the
 * bundle are billed Year over year at the same per-DP rate (engine2.ts's
 * priceCmSaas: `recurring = max(floor, platform + y2Overage)` — the floor
 * guard is retained defensively but cannot bind once the platform fee
 * recurs, since platform alone always exceeds the floor percentage of
 * itself).
 */
export function year2RuleNote(_trace: TraceStep[]): string {
  return (
    'From Year 2 onward, your annual fee is the Year-1 platform fee (it recurs as your committed base) plus any ' +
    'data principals beyond the included bundle, billed at the same per-DP rate.'
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
 * Discount rows for a totals line (D4): list/discount/net when the discount
 * is shown; net-only when it's hidden; a single undiscounted row when there
 * is no discount. `tco` is optional — omit it for tables that only show
 * per-year figures.
 */
export function discountTotalRows(opts: {
  label: string
  years: number[]
  netYears: number[]
  tco?: number
  netTco?: number
  discount_pct: number
  discount_shown: boolean
}): (string | number)[][] {
  const { label, years, netYears, tco, netTco, discount_pct: d, discount_shown } = opts
  const row = (lbl: string, ys: number[], t?: number): (string | number)[] =>
    t !== undefined ? [lbl, ...ys, t] : [lbl, ...ys]

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

/** Net (discounted) per-year totals, rounded the same way the engine rounds
 * net_total_tco_inr / net_total_year1_inr (round(x * (1-d))). */
export function netYearsOf(years: number[], discount_pct: number): number[] {
  const d = Math.min(Math.max(discount_pct, 0), 1)
  return years.map((y) => Math.round(y * (1 - d)))
}

export { formatINR }
