// Pure helpers for the admin Rate Card page. No React, no Supabase — every
// function here is unit-testable (rateCardPage.test.ts) without a DOM.
import type {
  DealInputs,
  DeploymentMode,
  RateCard,
  SaasInfraBasis,
  SaasTier,
} from '../../lib/engine2/types'

/** Shared shape for rate-card mutators passed down to the group editors. */
export type UpdateCard = (fn: (c: RateCard) => RateCard) => void

// ---------------------------------------------------------------------------
// Percent-input boundary conversion (owner: "when you say deployment /
// implementation in %, the input should not be in decimal" — every percent
// field in the admin Rate Card UI displays/accepts whole numbers, e.g. 18 for
// 18%, and converts to/from the stored 0..1 fraction only at the input
// boundary. Rounded to 4 decimal places on the fraction side to guard against
// float round-trip artifacts (18 -> 0.18 -> 18, never 0.18000000000000002).
// ---------------------------------------------------------------------------

/** Stored fraction (0..1) → whole-percent number for display (0.18 -> 18). */
export function pctToInput(fraction: number): number {
  return Math.round(fraction * 1_000_000) / 10_000
}

/** Whole-percent number from the input (18) → stored fraction (0.18). */
export function inputToPct(percent: number): number {
  return Math.round(percent * 100) / 10_000
}

/** Same pick rule as engine2: first tier whose cap covers the base; last is catch-all. */
export function pickSaasTier(tiers: SaasTier[], committedBase: number): SaasTier {
  for (const t of tiers) if (committedBase <= t.user_cap) return t
  return tiers[tiers.length - 1]
}

export interface BasisPreview {
  usd_mo: number
  infra_inr_yr: number
  platform_fee_inr_yr: number
}

/**
 * Annual platform fee (licence + hosting infra) for a sample committed DP base
 * under one infra basis — mirrors engine2's priceCmSaas arithmetic exactly so
 * the D1 before/after preview matches what price() will produce.
 */
export function basisPreview(card: RateCard, basis: SaasInfraBasis, sampleDpBase: number): BasisPreview {
  const s = card.saas_cm
  const tier = pickSaasTier(s.tiers, sampleDpBase)
  const usd_mo = basis === 'onprem_ref' ? tier.infra_usd_mo_onprem_ref : tier.infra_usd_mo_saas_v3
  const infra_inr_yr = Math.round(usd_mo * 12 * s.fx_inr_per_usd * (1 + s.sgna_uplift_pct))
  return { usd_mo, infra_inr_yr, platform_fee_inr_yr: s.annual_licence_inr + infra_inr_yr }
}

export interface BasisSwitchPreview {
  sample_dp_base: number
  tier_label: string
  onprem_ref: BasisPreview
  saas_v3: BasisPreview
  /** saas_v3 platform fee minus onprem_ref platform fee (negative = cheaper). */
  delta_inr_yr: number
}

/** Before/after platform fee for the D1 basis switch, at a sample deal size. */
export function basisSwitchPreview(card: RateCard, sampleDpBase: number): BasisSwitchPreview {
  const onprem_ref = basisPreview(card, 'onprem_ref', sampleDpBase)
  const saas_v3 = basisPreview(card, 'saas_v3', sampleDpBase)
  return {
    sample_dp_base: sampleDpBase,
    tier_label: pickSaasTier(card.saas_cm.tiers, sampleDpBase).label,
    onprem_ref,
    saas_v3,
    delta_inr_yr: saas_v3.platform_fee_inr_yr - onprem_ref.platform_fee_inr_yr,
  }
}

export interface SampleDealConfig {
  dp_base: number
  deployment_mode: DeploymentMode
  dspm: boolean
  dam: boolean
  endpoint: boolean
  quantities: Record<string, number>
  tco_years?: DealInputs['tco_years']
}

/** DealInputs for the worked-example rail (no growth, no discount). */
export function buildSampleDeal(cfg: SampleDealConfig): DealInputs {
  const base = Math.max(0, Math.trunc(cfg.dp_base))
  return {
    deployment_mode: cfg.deployment_mode,
    dp_base_y1: base,
    dp_base_y2: base,
    modules: { dspm: cfg.dspm, dam: cfg.dam, endpoint: cfg.endpoint },
    estate_quantities: cfg.quantities,
    tco_years: cfg.tco_years ?? 3,
    discount_pct: 0,
  }
}

// ---------------------------------------------------------------------------
// One-line plain-language descriptions ("what this drives") per rate row.
// ---------------------------------------------------------------------------

export function slabDescription(label: string): string {
  return `Caps the data-principal base for the ${label} band — the first slab whose cap covers the base sets the annual licence.`
}

export function tierDescription(label: string): string {
  return `Applies while the committed user base fits this cap — its included-DP bundle and hosting infra set the ₹/DP rate for the ${label} tier.`
}

/** Explainer line shown under the SaaS CM tier table (bundled-DP renewal
 * model, 2026-07-13 owner direction, confirmed on the CM Calculator call with
 * Rohit): the bundle + overage-rate derivation plus the Year-2+ rule, in the
 * owner's own words, so admins see the model without opening the trace. */
export const SAAS_PRICING_EXPLAINER =
  "The platform fee includes the tier's DP bundle — covering all consent actions (grant, revocation, modification, deletion, cookie consent). DPs beyond the bundle are charged at the overage rate, billed on actuals. Year 1 = implementation + platform fee (+ overage on the declared base). Year 2 onwards = 30% of the platform fee + overage on actuals."

export interface TierDerivedRate {
  infra_inr_yr: number
  platform_fee_inr_yr: number
  /** ceil(platform ÷ tier user_cap), whole rupees — mirrors priceCmSaas's overage rate exactly (0 when user_cap <= 0). */
  rate_inr_per_dp: number
}

/**
 * Per-tier derived hosting economics under the card's ACTIVE infra basis —
 * mirrors priceCmSaas's platform-fee and overage-rate arithmetic exactly
 * (rate = ceil(platform ÷ tier user_cap), not ÷ included_dp — the historical
 * ₹7/4/3/2/2 column is ceil(platform/cap) at the on-prem-ref basis), so the
 * admin table can show a live "₹/DP (derived)" figure per row that recomputes
 * as user_cap / FX / SG&A / licence / basis change.
 */
export function tierDerivedRate(card: RateCard, tier: SaasTier): TierDerivedRate {
  const s = card.saas_cm
  const usd_mo = s.infra_basis === 'onprem_ref' ? tier.infra_usd_mo_onprem_ref : tier.infra_usd_mo_saas_v3
  const infra_inr_yr = Math.round(usd_mo * 12 * s.fx_inr_per_usd * (1 + s.sgna_uplift_pct))
  const platform_fee_inr_yr = s.annual_licence_inr + infra_inr_yr
  const rate_inr_per_dp = tier.user_cap > 0 ? Math.ceil(platform_fee_inr_yr / tier.user_cap) : 0
  return { infra_inr_yr, platform_fee_inr_yr, rate_inr_per_dp }
}

export interface TierYear1Comparison {
  tier_key: string
  tier_label: string
  /** impl + platform + (cap − included) × rate, at the tier's own user_cap — mirrors priceCmSaas at baseY1 = cap. */
  saas_year1_at_cap_inr: number
  onprem_year1_inr: number
  onprem_slab_label: string
  /** true when SaaS Year 1 at the cap is >= the comparable On-Prem Year 1 (tuning flag: "tune included DPs / licence"). */
  saas_gte_onprem: boolean
}

/**
 * "SaaS vs On-Prem — Year 1" tuning surface: for each SaaS tier, prices a
 * client sized exactly at the tier's cap under both SaaS (this tier, with
 * Year-1 overage beyond the bundle) and On-Prem (the first slab whose cap
 * covers the tier cap — same pickByCap rule engine2 uses for slabs), so the
 * commercial team can see where SaaS undercuts On-Prem and where it doesn't.
 */
export function saasVsOnPremYear1(card: RateCard): TierYear1Comparison[] {
  const { tiers, implementation_pct, annual_licence_inr } = card.saas_cm
  const { slabs, deployment_pct, support_pct } = card.onprem_cm
  const impl = Math.round(annual_licence_inr * implementation_pct)

  return tiers.map((t) => {
    const derived = tierDerivedRate(card, t)
    const overageAtCap = Math.round(Math.max(0, t.user_cap - t.included_dp) * derived.rate_inr_per_dp)
    const saas_year1_at_cap_inr = impl + derived.platform_fee_inr_yr + overageAtCap

    const slab = slabs.find((s) => s.dp_cap >= t.user_cap) ?? slabs[slabs.length - 1]
    const onprem_year1_inr = Math.round(slab.annual_licence_inr * (1 + deployment_pct + support_pct))

    return {
      tier_key: t.tier_key,
      tier_label: t.label,
      saas_year1_at_cap_inr,
      onprem_year1_inr,
      onprem_slab_label: slab.label,
      saas_gte_onprem: saas_year1_at_cap_inr >= onprem_year1_inr,
    }
  })
}

const ESTATE_RATE_DESCRIPTIONS: Record<string, string> = {
  database: 'Each discovered database adds to the shared estate base (charged once across DSPM/DAM).',
  cloud_connector: 'Each cloud source connector adds to the shared estate base (charged once).',
  account: 'Each cloud account or subscription scanned adds to the shared estate base (charged once).',
  onprem_connector: 'Each on-prem source connector adds to the shared estate base (charged once).',
  onprem_dc: 'Each on-prem data centre in scope adds to the shared estate base (charged once).',
  gdrive_user: 'Each GDrive/OneDrive user scanned adds to the DSPM-specific base.',
  vm: 'Each virtual machine scanned adds to the DSPM-specific base.',
  sharepoint_site: 'Each SharePoint site scanned adds to the DSPM-specific base.',
  dam_dataset: 'Each structured dataset under activity monitoring adds to the DAM-specific base.',
  endpoint_device: 'Each managed endpoint device adds to the Endpoint base (rate pending final confirmation).',
}

export function estateRateDescription(rateKey: string, unit: string): string {
  return (
    ESTATE_RATE_DESCRIPTIONS[rateKey] ??
    `Charged ${unit} into the module base before the deployment and AMC uplifts.`
  )
}
