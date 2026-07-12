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
})
