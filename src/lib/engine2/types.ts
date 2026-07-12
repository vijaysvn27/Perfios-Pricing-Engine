// Proposal-builder pricing engine (engine2). Pure type contracts.
// Rate card seeded from Perfios_CM_Proposal_Builder.xlsx (Olivia/Anil-reviewed).
// All money is whole integer INR; every computed line is rounded to the rupee
// (Excel keeps fractional rupees, so parity fixtures assert the rounded value).

export type DeploymentMode = 'onprem' | 'hybrid' | 'saas'
export type EstateBucket = 'shared' | 'dspm' | 'dam' | 'endpoint'
export type SaasInfraBasis = 'onprem_ref' | 'saas_v3'

export interface OnPremSlab {
  slab_key: string
  label: string
  dp_cap: number
  annual_licence_inr: number
}

export interface SaasTier {
  tier_key: string
  label: string
  user_cap: number
  /** Consentick Summary "On-Prem Total ($/mo)" column. */
  infra_usd_mo_onprem_ref: number
  /** Consentick Summary "SaaS v3 ($/mo)" column. */
  infra_usd_mo_saas_v3: number
  /**
   * SUPERSEDED (2026-07-07 per-user methodology) — retained for history,
   * not read by the engine. Year 2+ is now max(30% of Year-1 platform fee,
   * committed-base-derived per-user rate × actual users); see
   * priceCmSaas in engine2.ts and the design-doc amendment under §6.
   */
  overage_inr_per_user: number
}

export interface EstateRate {
  rate_key: string
  label: string
  unit: string
  unit_price_inr: number
  provisional: boolean
  bucket: EstateBucket
}

export interface RateCard {
  onprem_cm: {
    slabs: OnPremSlab[] // ascending dp_cap; last slab is the catch-all
    deployment_pct: number // one-time, of licence
    support_pct: number // annual from Year 1, of licence
  }
  saas_cm: {
    tiers: SaasTier[] // ascending user_cap; last tier is the catch-all
    infra_basis: SaasInfraBasis
    fx_inr_per_usd: number
    sgna_uplift_pct: number
    annual_licence_inr: number
    implementation_pct: number // one-time, of licence
    y2_floor_pct: number // of Year-1 platform fee
  }
  estate: {
    rates: EstateRate[]
    deployment_pct: number // one-time, of base
    amc_pct: number // annual, of base, on top of the recurring base
  }
}

export interface DealInputs {
  deployment_mode: DeploymentMode
  dp_base_y1: number
  dp_base_y2: number
  modules: { dspm: boolean; dam: boolean; endpoint: boolean }
  /** keyed by EstateRate.rate_key; missing = 0 */
  estate_quantities: Record<string, number>
  tco_years: 1 | 2 | 3 | 4 | 5
  /** 0..1 discount applied uniformly to every line (list kept alongside net). */
  discount_pct: number
}

/** One transparent calculation step. Every published number has a trace path. */
export interface TraceStep {
  label: string
  formula: string // formula in words, with the actual numbers
  result: number
}

export type ComponentKey = 'cm' | 'dspm' | 'dam' | 'endpoint'

export interface ComponentLine {
  component_key: ComponentKey
  label: string
  included: boolean
  one_time_inr: number
  year1_inr: number
  recurring_inr: number // Year 2+ annual
  years_inr: number[] // length = tco_years
  tco_inr: number
}

export interface ModeResult {
  mode: DeploymentMode
  lines: ComponentLine[]
  total_one_time_inr: number
  total_year1_inr: number
  total_recurring_inr: number
  total_years_inr: number[]
  total_tco_inr: number
  net_total_tco_inr: number // == total when discount_pct = 0
  net_total_year1_inr: number
  /**
   * (licence + infra) ÷ committed users (dp_base_y1), unrounded. Set for
   * saas/hybrid (per-user 2026-07-07 methodology); undefined for onprem,
   * which has no per-user concept. Exposed here so formats can render it
   * without re-deriving from the trace.
   */
  saas_per_user_rate?: number
  trace: TraceStep[]
}
