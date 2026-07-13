import type { RateCard } from '../engine2/types'

export interface RateCardError {
  path: string
  message: string
}

const pctFields: [string, (c: RateCard) => number][] = [
  ['onprem_cm.deployment_pct', (c) => c.onprem_cm.deployment_pct],
  ['onprem_cm.support_pct', (c) => c.onprem_cm.support_pct],
  ['saas_cm.sgna_uplift_pct', (c) => c.saas_cm.sgna_uplift_pct],
  ['saas_cm.implementation_pct', (c) => c.saas_cm.implementation_pct],
  ['saas_cm.y2_floor_pct', (c) => c.saas_cm.y2_floor_pct],
  ['estate.deployment_pct', (c) => c.estate.deployment_pct],
  ['estate.amc_pct', (c) => c.estate.amc_pct],
]

/** Draft gate: a rate card must pass with zero errors before publish. */
export function validateRateCard(card: RateCard): RateCardError[] {
  const errors: RateCardError[] = []
  const err = (path: string, message: string) => errors.push({ path, message })

  if (card.onprem_cm.slabs.length === 0) err('onprem_cm.slabs', 'At least one slab is required')
  card.onprem_cm.slabs.forEach((s, i) => {
    if (s.dp_cap <= 0) err(`onprem_cm.slabs[${i}].dp_cap`, `${s.label}: DP cap must be positive`)
    if (s.annual_licence_inr <= 0) err(`onprem_cm.slabs[${i}].annual_licence_inr`, `${s.label}: licence must be positive`)
    if (i > 0 && s.dp_cap <= card.onprem_cm.slabs[i - 1].dp_cap)
      err(`onprem_cm.slabs[${i}].dp_cap`, `${s.label}: caps must be strictly increasing`)
  })

  if (card.saas_cm.tiers.length === 0) err('saas_cm.tiers', 'At least one tier is required')
  card.saas_cm.tiers.forEach((t, i) => {
    if (t.user_cap <= 0) err(`saas_cm.tiers[${i}].user_cap`, `${t.label}: user cap must be positive`)
    if (t.infra_usd_mo_onprem_ref <= 0) err(`saas_cm.tiers[${i}].infra_usd_mo_onprem_ref`, `${t.label}: on-prem-ref infra $/mo must be positive`)
    if (t.infra_usd_mo_saas_v3 <= 0) err(`saas_cm.tiers[${i}].infra_usd_mo_saas_v3`, `${t.label}: SaaS-v3 infra $/mo must be positive`)
    if (t.overage_inr_per_user < 0) err(`saas_cm.tiers[${i}].overage_inr_per_user`, `${t.label}: overage cannot be negative`)
    if (!(t.included_dp > 0) || t.included_dp > t.user_cap)
      err(`saas_cm.tiers[${i}].included_dp`, `${t.label}: included DP bundle must be positive and cannot exceed the user cap`)
    if (i > 0 && t.user_cap <= card.saas_cm.tiers[i - 1].user_cap)
      err(`saas_cm.tiers[${i}].user_cap`, `${t.label}: caps must be strictly increasing`)
  })
  if (card.saas_cm.fx_inr_per_usd <= 0) err('saas_cm.fx_inr_per_usd', 'FX rate must be positive')
  if (card.saas_cm.annual_licence_inr <= 0) err('saas_cm.annual_licence_inr', 'SaaS annual licence must be positive')

  if (card.estate.rates.length === 0) err('estate.rates', 'At least one estate rate is required')
  const seen = new Set<string>()
  card.estate.rates.forEach((rt, i) => {
    if (rt.unit_price_inr < 0) err(`estate.rates[${i}].unit_price_inr`, `${rt.label}: unit price cannot be negative`)
    if (seen.has(rt.rate_key)) err(`estate.rates[${i}].rate_key`, `${rt.label}: duplicate rate_key "${rt.rate_key}"`)
    seen.add(rt.rate_key)
  })

  const seenUsageKeys = new Set<string>()
  card.usage_rates.forEach((ur, i) => {
    if (ur.unit_price_inr < 0) err(`usage_rates[${i}].unit_price_inr`, `${ur.label || ur.rate_key}: unit price cannot be negative`)
    if (ur.label.trim().length === 0) err(`usage_rates[${i}].label`, `usage_rates[${i}]: label is required`)
    if (seenUsageKeys.has(ur.rate_key)) err(`usage_rates[${i}].rate_key`, `${ur.label || ur.rate_key}: duplicate rate_key "${ur.rate_key}"`)
    seenUsageKeys.add(ur.rate_key)
  })

  for (const [path, get] of pctFields) {
    const v = get(card)
    if (!(v >= 0 && v <= 1)) err(path, `Percentage must be between 0 and 1 (got ${v})`)
  }

  return errors
}
