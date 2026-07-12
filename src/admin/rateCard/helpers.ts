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
  return `Applies while the committed user base fits this cap — sets the hosting infra cost that feeds the per-user rate for the ${label} tier.`
}

/** Explainer line shown under the SaaS CM tier table (2026-07-07 per-user
 * methodology): the per-user derivation plus the Year-2+ rule, in one
 * sentence so admins see the model without opening the trace. */
export const SAAS_PRICING_EXPLAINER =
  'SaaS pricing is per-user: (licence + infra) ÷ committed users; Year 2+ = greater of 30% of Year-1 platform fee or actual users × rate.'

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
