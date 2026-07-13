// Pure, DOM-free logic behind the AM proposal wizard: estate-question
// visibility, BOM inclusion, filename building, discount unit conversion,
// default copy, and the record/totals builders. Everything here is unit-
// tested in src/am/wizard.test.ts; the components stay thin.

import { price, priceAllModes } from '../lib/engine2/engine2'
import type { DealInputs, DeploymentMode, EstateRate, ModeResult, RateCard } from '../lib/engine2/types'
import type { ProposalRecord, SizingLine } from '../lib/proposal/clientSafe'
import type { ProposalDraft, ProposalInputs, ProposalTotals } from '../lib/proposal/proposalsRepo'
import type { ProposalRenderModel, RenderSection } from '../lib/proposal/formats'

export type ModuleFlags = DealInputs['modules']

export const MODE_LABELS: Record<DeploymentMode, string> = {
  onprem: 'On-Prem',
  hybrid: 'Hybrid',
  saas: 'SaaS',
}

/** Note shown on module toggles when the deployment mode is SaaS. */
export const SAAS_MODULE_NOTE = 'Not available on SaaS (CM-only)'

/**
 * Which estate quantity questions to show (§6 buckets): none on SaaS
 * (CM-only); the shared bucket whenever DSPM or DAM is on (it is charged
 * once, to DSPM if selected else DAM); module-specific buckets only when
 * that module is on.
 */
export function visibleEstateRates(rates: EstateRate[], mode: DeploymentMode, modules: ModuleFlags): EstateRate[] {
  if (mode === 'saas') return []
  return rates.filter((rate) => {
    switch (rate.bucket) {
      case 'shared':
        return modules.dspm || modules.dam
      case 'dspm':
        return modules.dspm
      case 'dam':
        return modules.dam
      case 'endpoint':
        return modules.endpoint
    }
  })
}

/**
 * Estate rate keys whose Scope-step QUESTION is retired (owner direction
 * 2026-07-13, fewer wizard questions): 'onprem_connector' is redundant with
 * the data-centre count, and 'dam_dataset' isn't needed as a separate ask.
 * 'sharepoint_site' is asked again (owner correction, 2026-07-13: SharePoint
 * is its own priced line, per account — not folded into gdrive_user). The
 * rate-card rates for these keys are untouched — a deal can still carry a
 * non-zero quantity (from an imported questionnaire or an older draft) and
 * it prices exactly the same; only the INPUT is hidden from new data entry.
 * See askedEstateRates / hiddenEstateRatesWithValue.
 */
export const HIDDEN_ESTATE_KEYS: readonly string[] = ['onprem_connector', 'dam_dataset']

/** The estate questions Step2Scope actually asks: visibleEstateRates minus
 * the retired HIDDEN_ESTATE_KEYS questions. */
export function askedEstateRates(rates: EstateRate[], mode: DeploymentMode, modules: ModuleFlags): EstateRate[] {
  return visibleEstateRates(rates, mode, modules).filter((rate) => !HIDDEN_ESTATE_KEYS.includes(rate.rate_key))
}

/**
 * Hidden-key rows that must still surface, read-only, because they carry a
 * non-zero quantity already (an imported questionnaire or an older draft
 * created before the key's question was retired) — so removing the question
 * never silently drops money from the price. Scoped to
 * visibleEstateRates first: a hidden key that isn't in scope of the
 * currently-selected modules is never priced (engine2's estateBases only
 * sums a bucket when its module is on) and so never needs surfacing either.
 */
export function hiddenEstateRatesWithValue(
  rates: EstateRate[],
  mode: DeploymentMode,
  modules: ModuleFlags,
  quantities: Record<string, number>,
): EstateRate[] {
  return visibleEstateRates(rates, mode, modules).filter(
    (rate) => HIDDEN_ESTATE_KEYS.includes(rate.rate_key) && (quantities[rate.rate_key] ?? 0) > 0,
  )
}

/**
 * The effective unit rate for an estate rate on this deal: the deal-specific
 * override when one is present and non-negative (`estate_rate_overrides`,
 * set by the AM in Step2Scope for rates flagged provisional), otherwise the
 * published rate-card price. Mirrors the override precedence engine2 itself
 * applies when pricing (see engine2.ts's "Rate override" trace step) — kept
 * here, not imported from engine2, since engine2 files are off-limits and
 * this is a display-only re-derivation, not a pricing computation.
 */
function effectiveEstateRate(rate: EstateRate, overrides?: Record<string, number>): number {
  const o = overrides?.[rate.rate_key]
  return o !== undefined && o >= 0 ? o : rate.unit_price_inr
}

/**
 * Transparent "Sizing Estimate" rows (Honda "DSPM DAM Sizing" pattern): one
 * row per NON-ZERO estate quantity of a SELECTED module, override-aware.
 * Reuses `visibleEstateRates` for the selected-module/bucket filter so this
 * can never drift from the estate questions the AM was actually shown — SaaS
 * (CM-only) always yields an empty list, matching `visibleEstateRates`.
 */
export function buildSizingLines(card: RateCard, inputs: DealInputs): SizingLine[] {
  const visible = visibleEstateRates(card.estate.rates, inputs.deployment_mode, inputs.modules)
  const lines: SizingLine[] = []
  for (const rate of visible) {
    const qty = Math.max(0, Math.trunc(inputs.estate_quantities[rate.rate_key] ?? 0))
    if (qty <= 0) continue
    const unit_rate_inr = effectiveEstateRate(rate, inputs.estate_rate_overrides)
    lines.push({ label: rate.label, unit: rate.unit, qty, unit_rate_inr, annual_inr: Math.round(qty * unit_rate_inr) })
  }
  return lines
}

/** BOM annexure rule: On-Prem always; Hybrid only when any estate module is on; SaaS never. */
export function includeBom(mode: DeploymentMode, modules: ModuleFlags): boolean {
  if (mode === 'onprem') return true
  if (mode === 'hybrid') return modules.dspm || modules.dam || modules.endpoint
  return false
}

/** `<customer>_Perfios_DPDP_Proposal.xlsx`, safe for a filesystem. */
export function proposalFilename(customerName: string): string {
  const cleaned = customerName
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
  return `${cleaned || 'Client'}_Perfios_DPDP_Proposal.xlsx`
}

/** UI shows whole percent (0–100); the engine stores a 0..1 fraction. */
export function pctToFraction(pct: number): number {
  if (!Number.isFinite(pct)) return 0
  return Math.min(Math.max(pct, 0), 100) / 100
}

export function fractionToPct(fraction: number): number {
  return Math.round(fraction * 10000) / 100
}

/** The three standard payment-terms bullets from the spec (Client Proposal sheet). */
export function defaultPaymentTerms(validityDays: number): string {
  return [
    'Year 1: 50 percent on order, balance on production go-live. Year 2 onward: annually in advance.',
    'One-time charges billed once. Recurring charges renew each year.',
    `Prices exclusive of applicable taxes. Validity ${validityDays} days.`,
  ].join('\n')
}

export function defaultInputs(validityDays: number = 60): ProposalInputs {
  return {
    deployment_mode: 'onprem',
    dp_base_y1: 0,
    dp_base_y2: 0,
    modules: { dspm: false, dam: false, endpoint: false },
    estate_quantities: {},
    tco_years: 3,
    discount_pct: 0,
    compare_all_modes: false,
    payment_terms: defaultPaymentTerms(validityDays),
    special_terms: '',
  }
}

export function emptyTotals(): ProposalTotals {
  return {
    tco_years: 0,
    total_year1_inr: 0,
    total_recurring_inr: 0,
    total_tco_inr: 0,
    net_total_year1_inr: 0,
    net_total_tco_inr: 0,
  }
}

export function totalsFromResult(result: ModeResult): ProposalTotals {
  return {
    tco_years: result.total_years_inr.length,
    total_year1_inr: result.total_year1_inr,
    total_recurring_inr: result.total_recurring_inr,
    total_tco_inr: result.total_tco_inr,
    net_total_year1_inr: result.net_total_year1_inr,
    net_total_tco_inr: result.net_total_tco_inr,
  }
}

/** Price the draft (all three modes in compare mode) into a full internal record. */
export function buildRecord(draft: ProposalDraft, card: RateCard): ProposalRecord {
  const results = draft.inputs.compare_all_modes
    ? (() => {
        const all = priceAllModes(card, draft.inputs)
        return [all.onprem, all.hybrid, all.saas]
      })()
    : [price(card, draft.inputs)]
  return {
    id: draft.id,
    customer_name: draft.customer_name,
    channel: draft.channel,
    internal_notes: draft.internal_notes,
    validity_days: draft.validity_days,
    inputs: draft.inputs,
    results,
    discount_shown: draft.discount_shown,
    sizing_lines: buildSizingLines(card, draft.inputs),
    usage_rates: card.usage_rates.map((u) => ({ label: u.label, unit: u.unit, unit_price_inr: u.unit_price_inr })),
  }
}

/**
 * Layer the AM's edited commercial copy onto a built render model: replace
 * the bullets of any "Payment Terms" section with the (newline-separated)
 * textarea content, and append a "Special Terms" section when present.
 * Pure — the export path re-runs scanForBlocklist on the final model after
 * this, so AM-typed copy is still blocklist-checked (D5 belt-and-braces).
 */
export function applyCommercialCopy(
  model: ProposalRenderModel,
  paymentTerms: string,
  specialTerms: string,
): ProposalRenderModel {
  const paymentLines = paymentTerms
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  const sections: RenderSection[] = model.sections.map((s) =>
    paymentLines.length > 0 && /payment terms/i.test(s.heading) ? { ...s, bullets: paymentLines } : s,
  )
  const special = specialTerms
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  if (special.length > 0) sections.push({ heading: 'Special Terms', bullets: special })
  return { ...model, sections }
}

/**
 * Layer the AM's edited narrative copy onto a built render model (item 4 —
 * template narrative): replace the "Executive Summary" / "Solution Overview"
 * section paragraphs when a non-blank override is supplied, otherwise leave
 * the template-generated copy in place. Mirrors applyCommercialCopy's
 * "blank textarea = keep the default" convention.
 */
export function applyNarrativeCopy(
  model: ProposalRenderModel,
  overrides: { executive_summary?: string; solution_overview?: string },
): ProposalRenderModel {
  const execOverride = overrides.executive_summary?.trim()
  const solutionOverride = overrides.solution_overview?.trim()
  const sections: RenderSection[] = model.sections.map((s) => {
    if (execOverride && /^executive summary$/i.test(s.heading)) {
      return { ...s, paragraphs: [execOverride] }
    }
    if (solutionOverride && /^solution overview$/i.test(s.heading)) {
      return { ...s, paragraphs: [solutionOverride] }
    }
    return s
  })
  return { ...model, sections }
}

// ---------------------------------------------------------------------------
// Question copy — mirrors the finalized DPDP Pricing Questionnaire style:
// a short question plus a one-line "why we ask" hint, keyed by rate_key.
// ---------------------------------------------------------------------------

export interface QuestionCopy {
  question: string
  why: string
}

export const DP_BASE_Y1_QUESTION: QuestionCopy = {
  question: 'How many data principals (customers) will you manage in Year 1?',
  why: 'Sets your licence slab (On-Prem) or committed tier (SaaS / Hybrid).',
}

/**
 * Step2Scope's Year-2 input (decision from the CM Calculator meeting with
 * Rohit, 2026-07-13; supersedes the earlier "How many do you expect by the
 * end of Year 2?" absolute-headcount question): the AM enters a whole-percent
 * expected growth figure instead. Question hint is Rohit's own wording.
 */
export const DP_GROWTH_PCT_QUESTION: QuestionCopy = {
  question: 'Expected annual growth (%)',
  why: 'What percentage do you expect your data-principal base to grow by the end of Year 2?',
}

/**
 * Derives the absolute Year-2 data-principal base from a whole-percent
 * growth figure over the Year-1 base. `inputs.dp_base_y2` stays the
 * persisted engine field (untouched shape for the engine and any
 * pre-existing records) — this is the only place that turns the AM's
 * percent input into that stored absolute; recomputed whenever either the
 * Year-1 base or the growth percent changes. Mirrors
 * questionnaireImport.ts's computeDpBaseY2 percent branch exactly (kept
 * duplicated rather than shared, since lib code must not import from src/am).
 */
export function dpBaseY2FromGrowth(dpBaseY1: number, growthPct: number): number {
  return Math.round(dpBaseY1 * (1 + growthPct / 100))
}

/**
 * Inverse of dpBaseY2FromGrowth — the whole-percent growth a persisted
 * dp_base_y2 represents over dp_base_y1. Used only to prefill the growth-%
 * input when opening an existing draft (dp_base_y2 is the field that's
 * actually persisted, not the percent). Returns 0 for a zero/blank Year-1
 * base rather than dividing by zero.
 */
export function growthPctFromBases(dpBaseY1: number, dpBaseY2: number): number {
  if (dpBaseY1 <= 0) return 0
  return Math.round(((dpBaseY2 - dpBaseY1) / dpBaseY1) * 100)
}

const ESTATE_QUESTIONS: Record<string, QuestionCopy> = {
  database: {
    question: 'How many databases hold personal data?',
    why: 'Each database in scope is discovered and scanned.',
  },
  cloud_connector: {
    question: 'How many cloud platforms do we connect to?',
    why: 'One connector per cloud platform (AWS / Azure / GCP).',
  },
  account: {
    question: 'How many cloud accounts / subscriptions are in scope?',
    why: 'Accounts set the breadth of cloud-side discovery.',
  },
  onprem_connector: {
    question: 'How many on-prem connectors are needed?',
    why: 'One per isolated on-prem network segment.',
  },
  onprem_dc: {
    question: 'How many on-prem data centres are in scope?',
    why: 'Each data centre needs its own collection footprint.',
  },
  gdrive_user: {
    question: 'How many GDrive / OneDrive users?',
    why: 'Drives file-store scanning scope for DSPM.',
  },
  vm: {
    question: 'How many virtual machines are in scope?',
    why: 'VMs holding local data are scanned individually.',
  },
  sharepoint_site: {
    question: 'How many SharePoint accounts?',
    why: 'Each SharePoint account is priced for discovery scanning.',
  },
  dam_dataset: {
    question: 'How many structured datasets should DAM monitor?',
    why: 'DAM watches access patterns per structured dataset.',
  },
  endpoint_device: {
    question: 'How many endpoint devices (laptops / desktops)?',
    why: 'Endpoint discovery / DLP is licensed per device.',
  },
}

/** Question + why for an estate rate; generic fallback for admin-added keys. */
export function estateQuestion(rate: EstateRate): QuestionCopy {
  return (
    ESTATE_QUESTIONS[rate.rate_key] ?? {
      question: `How many — ${rate.label}?`,
      why: `Priced ${rate.unit}.`,
    }
  )
}
