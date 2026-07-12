// Pure, deterministic proposal pricing. Mirrors Perfios_CM_Proposal_Builder.xlsx
// Calculator rows D61–D102 exactly (values rounded to whole rupees; Excel keeps
// fractions, so results may differ from the sheet by < ₹1 per line).
import type {
  ComponentLine,
  DealInputs,
  DeploymentMode,
  ModeResult,
  RateCard,
  TraceStep,
} from './types'

const r = (n: number): number => Math.round(n)
const inr = (n: number): string => n.toLocaleString('en-IN')

interface CmPrice {
  one_time: number
  year1: number
  recurring: number
}

function pickByCap<T>(items: T[], cap: (t: T) => number, value: number): T {
  for (const item of items) if (value <= cap(item)) return item
  return items[items.length - 1] // catch-all: beyond the last cap, use the last row
}

function priceCmOnPrem(card: RateCard, base: number, trace: TraceStep[]): CmPrice {
  const { slabs, deployment_pct, support_pct } = card.onprem_cm
  const slab = pickByCap(slabs, (s) => s.dp_cap, base)
  const licence = slab.annual_licence_inr
  const deploy = r(licence * deployment_pct)
  const support = r(licence * support_pct)
  trace.push(
    { label: 'CM slab', formula: `DP base ${inr(base)} ≤ ${slab.label} cap ${inr(slab.dp_cap)} → slab ${slab.label}`, result: licence },
    { label: 'CM licence (one-time)', formula: `${slab.label} slab annual licence`, result: licence },
    { label: 'CM deployment (one-time)', formula: `${deployment_pct * 100}% × licence ₹${inr(licence)}`, result: deploy },
    { label: 'CM support (annual, from Year 1)', formula: `${support_pct * 100}% × licence ₹${inr(licence)}`, result: support },
  )
  return { one_time: licence + deploy, year1: licence + deploy + support, recurring: support }
}

function priceCmSaas(card: RateCard, baseY1: number, baseY2: number, trace: TraceStep[]): CmPrice {
  const s = card.saas_cm
  const tier = pickByCap(s.tiers, (t) => t.user_cap, baseY1)
  const usdMo = s.infra_basis === 'onprem_ref' ? tier.infra_usd_mo_onprem_ref : tier.infra_usd_mo_saas_v3
  const infra = r(usdMo * 12 * s.fx_inr_per_usd * (1 + s.sgna_uplift_pct))
  const licence = s.annual_licence_inr
  const impl = r(licence * s.implementation_pct)
  const platform = licence + infra
  const overage = r(Math.max(0, baseY2 - baseY1) * tier.overage_inr_per_user)
  const recurring = Math.max(r(s.y2_floor_pct * platform), platform + overage)
  trace.push(
    { label: 'SaaS tier', formula: `committed base ${inr(baseY1)} ≤ ${tier.label} cap ${inr(tier.user_cap)} → tier ${tier.label} (${s.infra_basis})`, result: usdMo },
    { label: 'Hosting infra (annual)', formula: `$${usdMo}/mo × 12 × ₹${s.fx_inr_per_usd}/USD × (1 + ${s.sgna_uplift_pct * 100}% SG&A)`, result: infra },
    { label: 'Platform fee (annual)', formula: `licence ₹${inr(licence)} + infra ₹${inr(infra)}`, result: platform },
    { label: 'Implementation (one-time)', formula: `${s.implementation_pct * 100}% × licence ₹${inr(licence)}`, result: impl },
    { label: 'Overage (Year 2+)', formula: `max(0, ${inr(baseY2)} − ${inr(baseY1)}) × ₹${tier.overage_inr_per_user}/user`, result: overage },
    { label: 'Year 2+ (with floor)', formula: `max(${s.y2_floor_pct * 100}% × platform, platform + overage)`, result: recurring },
  )
  return { one_time: impl, year1: impl + platform, recurring }
}

interface EstateBases {
  dspm: number
  dam: number
  endpoint: number
}

function estateBases(card: RateCard, inputs: DealInputs, trace: TraceStep[]): EstateBases {
  const qty = (k: string) => Math.max(0, Math.trunc(inputs.estate_quantities[k] ?? 0))
  const sum = (bucket: string) =>
    card.estate.rates
      .filter((rt) => rt.bucket === bucket)
      .reduce((acc, rt) => acc + qty(rt.rate_key) * rt.unit_price_inr, 0)

  const shared = sum('shared')
  const dspmSpecific = sum('dspm')
  const damSpecific = sum('dam')
  const endpoint = sum('endpoint')

  const { dspm, dam } = inputs.modules
  // Shared estate base (DBs, connectors, accounts, DCs) is charged ONCE:
  // to DSPM when selected, else to DAM (Calculator D84/D85).
  const dspmBase = dspm ? shared + dspmSpecific : 0
  const damBase = dam ? (dspm ? damSpecific : shared + damSpecific) : 0
  const endpointBase = inputs.modules.endpoint ? endpoint : 0
  if (dspm || dam || inputs.modules.endpoint) {
    trace.push(
      { label: 'Estate shared base', formula: 'databases + cloud connectors + accounts + on-prem connectors + DCs, charged once', result: shared },
      { label: 'DSPM base', formula: dspm ? 'shared base + GDrive/OneDrive users + VMs + SharePoint sites' : 'DSPM not selected', result: dspmBase },
      { label: 'DAM base', formula: dam ? (dspm ? 'DAM datasets only (shared base already on DSPM)' : 'shared base + DAM datasets') : 'DAM not selected', result: damBase },
      { label: 'Endpoint base', formula: inputs.modules.endpoint ? 'endpoint devices × rate' : 'Endpoint not selected', result: endpointBase },
    )
  }
  return { dspm: dspmBase, dam: damBase, endpoint: endpointBase }
}

function estateLine(card: RateCard, base: number, label: string, key: ComponentLine['component_key'], years: number, trace: TraceStep[]): ComponentLine {
  const { deployment_pct, amc_pct } = card.estate
  const oneTime = r(base * deployment_pct)
  const year1 = r(base * (1 + deployment_pct + amc_pct))
  const recurring = r(base * (1 + amc_pct))
  if (base > 0) {
    trace.push(
      { label: `${label} Year 1`, formula: `base ₹${inr(base)} × (1 + ${deployment_pct * 100}% deployment + ${amc_pct * 100}% AMC)`, result: year1 },
      { label: `${label} Year 2+`, formula: `base ₹${inr(base)} × (1 + ${amc_pct * 100}% AMC)`, result: recurring },
    )
  }
  return buildLine(key, label, base > 0, oneTime, year1, recurring, years)
}

function buildLine(
  component_key: ComponentLine['component_key'],
  label: string,
  included: boolean,
  one_time_inr: number,
  year1_inr: number,
  recurring_inr: number,
  tcoYears: number,
): ComponentLine {
  const years_inr = Array.from({ length: tcoYears }, (_, i) => (i === 0 ? year1_inr : recurring_inr))
  return {
    component_key,
    label,
    included,
    one_time_inr,
    year1_inr,
    recurring_inr,
    years_inr,
    tco_inr: year1_inr + (tcoYears - 1) * recurring_inr,
  }
}

/** Price one deployment mode. Pure: same card + same inputs → same result. */
export function price(card: RateCard, inputs: DealInputs): ModeResult {
  const trace: TraceStep[] = []
  const mode = inputs.deployment_mode
  const years = inputs.tco_years

  const cm =
    mode === 'onprem'
      ? priceCmOnPrem(card, inputs.dp_base_y1, trace)
      : priceCmSaas(card, inputs.dp_base_y1, inputs.dp_base_y2, trace)
  const cmLine = buildLine('cm', 'Consent Manager (7 modules)', true, cm.one_time, cm.year1, cm.recurring, years)

  // SaaS is CM-only: estate modules are unavailable regardless of toggles.
  const estateEligible = mode !== 'saas'
  const zero: ComponentLine[] = [
    buildLine('dspm', 'DSPM', false, 0, 0, 0, years),
    buildLine('dam', 'DAM', false, 0, 0, 0, years),
    buildLine('endpoint', 'Endpoint Discovery / DLP', false, 0, 0, 0, years),
  ]
  const estateLines = estateEligible
    ? (() => {
        const bases = estateBases(card, inputs, trace)
        return [
          estateLine(card, bases.dspm, 'DSPM', 'dspm', years, trace),
          estateLine(card, bases.dam, 'DAM', 'dam', years, trace),
          estateLine(card, bases.endpoint, 'Endpoint Discovery / DLP', 'endpoint', years, trace),
        ]
      })()
    : zero

  const lines = [cmLine, ...estateLines]
  const total = (f: (l: ComponentLine) => number) => lines.reduce((a, l) => a + f(l), 0)
  const total_years_inr = Array.from({ length: years }, (_, i) => total((l) => l.years_inr[i]))
  const total_tco_inr = total((l) => l.tco_inr)
  const total_year1_inr = total((l) => l.year1_inr)

  const d = Math.min(Math.max(inputs.discount_pct, 0), 1)
  const net_total_tco_inr = r(total_tco_inr * (1 - d))
  const net_total_year1_inr = r(total_year1_inr * (1 - d))
  if (d > 0) {
    trace.push({ label: 'Discount', formula: `${d * 100}% off list TCO ₹${inr(total_tco_inr)}`, result: net_total_tco_inr })
  }

  return {
    mode,
    lines,
    total_one_time_inr: total((l) => l.one_time_inr),
    total_year1_inr,
    total_recurring_inr: total((l) => l.recurring_inr),
    total_years_inr,
    total_tco_inr,
    net_total_tco_inr,
    net_total_year1_inr,
    trace,
  }
}

/** Compare view: the same deal priced across all three deployment modes. */
export function priceAllModes(card: RateCard, inputs: DealInputs): Record<DeploymentMode, ModeResult> {
  const modes: DeploymentMode[] = ['onprem', 'hybrid', 'saas']
  return Object.fromEntries(
    modes.map((m) => [m, price(card, { ...inputs, deployment_mode: m })]),
  ) as Record<DeploymentMode, ModeResult>
}
