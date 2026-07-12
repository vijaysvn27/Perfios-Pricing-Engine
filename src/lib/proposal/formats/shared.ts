// Shared copy and helpers used by every format builder (moduleWise, saasStyle,
// perfios). Keeping the CM module copy and the discount-row logic in one
// place means the three formats can never drift on wording or on how a
// discount is (or isn't) shown to the client (D4 in the design doc).
import type { ComponentLine, ModeResult, TraceStep } from '../../engine2/types'
import { formatINR } from '../../format'

/** The 7 Consent Manager modules — verbatim copy, used everywhere "What You
 * Get" appears (module-wise implicitly via the CM line label, saas-style,
 * and perfios section 1). */
export const CM_MODULES_COPY: string[] = [
  '1. Consent Notice & Templates — DPDP notice, 22 languages, omnichannel, audio readout, self & nomination',
  '2. Data Principal Rights Portal (DPAR) — access, update, revoke, nomination with KYC, grievance',
  '3. Cookie Consent Manager — granular categories, banner & library deployment',
  '4. Consent Governance (Consent Bridge) — DPO dashboards, audit logs, versioning, maker-checker, rule engine, RBAC, auto-renewal, bulk, OCR',
  '5. Consent Breach Module — breach detection, consent-to-data tie-back, DSAR tie-back',
  '6. Vendor / Third-Party Module — automated API calls to processors, vendor reporting',
  '7. Data Privacy Risk Assessment (DPIA) — DPIA with risk scoring and versioning',
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
 * Overage note for the SaaS/hybrid subscription framing. Prefers the exact
 * per-user rate recorded in the trace ("Overage (Year 2+)" step, e.g.
 * "max(0, 30,00,000 − 25,00,000) × ₹3/user"); falls back to a description
 * built from the deal inputs alone when no such trace step exists (e.g. the
 * priced mode is on-prem, which has no overage concept).
 */
export function overageNote(trace: TraceStep[], dpBaseY1: number, dpBaseY2: number): string {
  const formula = traceFormula(trace, 'Overage (Year 2+)')
  const match = formula?.match(/₹(\d+(?:\.\d+)?)\/user/)
  if (match) {
    return `Overage beyond your committed base is billed at ₹${match[1]}/user, from Year 2 onward.`
  }
  const growth = Math.max(0, dpBaseY2 - dpBaseY1)
  if (growth > 0) {
    return `Your Year 2 base of ${dpBaseY2.toLocaleString('en-IN')} exceeds the committed ${dpBaseY1.toLocaleString('en-IN')} by ${growth.toLocaleString('en-IN')}; overage terms apply from Year 2.`
  }
  return `Committed base: ${dpBaseY1.toLocaleString('en-IN')}. No overage while usage stays within the committed base.`
}

export function findLine(result: ModeResult, key: ComponentLine['component_key']): ComponentLine {
  const line = result.lines.find((l) => l.component_key === key)
  if (!line) throw new Error(`engine result missing component line: ${key}`)
  return line
}

/**
 * Discount rows for a totals line (D4): list/discount/net when the discount
 * is shown; net-only when it's hidden; a single undiscounted row when there
 * is no discount. `tco` is optional — omit it for tables that only show
 * per-year figures (e.g. the SaaS-style "Annual Cost" table).
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
