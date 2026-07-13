import { describe, expect, it } from 'vitest'
import { RATE_CARD_SEED } from '../engine2/seed'
import type { RateCard } from '../engine2/types'
import { validateRateCard } from './validate'

const clone = (): RateCard => JSON.parse(JSON.stringify(RATE_CARD_SEED)) as RateCard

describe('validateRateCard', () => {
  it('seed rate card is valid', () => {
    expect(validateRateCard(RATE_CARD_SEED)).toEqual([])
  })

  it('rejects non-increasing slab caps', () => {
    const c = clone()
    c.onprem_cm.slabs[1].dp_cap = c.onprem_cm.slabs[0].dp_cap
    expect(validateRateCard(c).some((e) => e.message.includes('strictly increasing'))).toBe(true)
  })

  it('rejects out-of-range percentages', () => {
    const c = clone()
    c.saas_cm.sgna_uplift_pct = 1.2
    expect(validateRateCard(c).some((e) => e.path === 'saas_cm.sgna_uplift_pct')).toBe(true)
  })

  it('rejects duplicate estate rate keys and non-positive FX', () => {
    const c = clone()
    c.estate.rates[1].rate_key = c.estate.rates[0].rate_key
    c.saas_cm.fx_inr_per_usd = 0
    const errors = validateRateCard(c)
    expect(errors.some((e) => e.message.includes('duplicate'))).toBe(true)
    expect(errors.some((e) => e.path === 'saas_cm.fx_inr_per_usd')).toBe(true)
  })

  it('rejects a tier with included_dp <= 0', () => {
    const c = clone()
    c.saas_cm.tiers[0].included_dp = 0
    const errors = validateRateCard(c)
    expect(errors.some((e) => e.path === 'saas_cm.tiers[0].included_dp')).toBe(true)
  })

  it('rejects a tier with included_dp above its user_cap', () => {
    const c = clone()
    c.saas_cm.tiers[0].included_dp = c.saas_cm.tiers[0].user_cap + 1
    const errors = validateRateCard(c)
    expect(errors.some((e) => e.path === 'saas_cm.tiers[0].included_dp')).toBe(true)
  })

  it('accepts included_dp exactly at the user cap', () => {
    const c = clone()
    c.saas_cm.tiers[0].included_dp = c.saas_cm.tiers[0].user_cap
    expect(validateRateCard(c).some((e) => e.path === 'saas_cm.tiers[0].included_dp')).toBe(false)
  })

  it('rejects a usage rate with a negative unit price', () => {
    const c = clone()
    c.usage_rates[0].unit_price_inr = -1
    const errors = validateRateCard(c)
    expect(errors.some((e) => e.path === 'usage_rates[0].unit_price_inr')).toBe(true)
  })

  it('rejects a usage rate with an empty label', () => {
    const c = clone()
    c.usage_rates[0].label = '   '
    const errors = validateRateCard(c)
    expect(errors.some((e) => e.path === 'usage_rates[0].label')).toBe(true)
  })

  it('rejects duplicate usage_rate keys', () => {
    const c = clone()
    c.usage_rates = [...c.usage_rates, { ...c.usage_rates[0] }]
    const errors = validateRateCard(c)
    expect(errors.some((e) => e.path === 'usage_rates[1].rate_key' && e.message.includes('duplicate'))).toBe(true)
  })
})
