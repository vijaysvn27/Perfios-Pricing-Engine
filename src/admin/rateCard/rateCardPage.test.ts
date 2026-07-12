// Pure-helper tests for the admin Rate Card page (no DOM / component tests —
// jsdom is not configured; the React tree is verified by CI type-checking).
import { describe, expect, it } from 'vitest'
import { RATE_CARD_SEED } from '../../lib/engine2/seed'
import { price } from '../../lib/engine2/engine2'
import {
  basisPreview,
  basisSwitchPreview,
  buildSampleDeal,
  estateRateDescription,
  pickSaasTier,
} from './helpers'

describe('pickSaasTier', () => {
  const tiers = RATE_CARD_SEED.saas_cm.tiers

  it('picks the first tier whose cap covers the base (boundary inclusive)', () => {
    expect(pickSaasTier(tiers, 500_000).tier_key).toBe('tier0')
    expect(pickSaasTier(tiers, 500_001).tier_key).toBe('10l')
    expect(pickSaasTier(tiers, 2_500_000).tier_key).toBe('25l')
  })

  it('falls back to the last tier beyond every cap (catch-all, same as engine2)', () => {
    expect(pickSaasTier(tiers, 99_000_000).tier_key).toBe('100l')
  })
})

describe('basisPreview (D1 before/after arithmetic)', () => {
  it('matches engine2 for the on-prem-ref basis at a 25L deal', () => {
    const p = basisPreview(RATE_CARD_SEED, 'onprem_ref', 2_500_000)
    // 3671 × 12 × 83 × 1.2 = 43,87,579.2 → 43,87,579; + 15,00,000 licence
    expect(p.usd_mo).toBe(3671)
    expect(p.infra_inr_yr).toBe(4_387_579)
    expect(p.platform_fee_inr_yr).toBe(5_887_579)
  })

  it('matches engine2 for the saas_v3 basis at a 25L deal', () => {
    const p = basisPreview(RATE_CARD_SEED, 'saas_v3', 2_500_000)
    // 1980 × 12 × 83 × 1.2 = 23,66,496; + 15,00,000 licence
    expect(p.usd_mo).toBe(1980)
    expect(p.infra_inr_yr).toBe(2_366_496)
    expect(p.platform_fee_inr_yr).toBe(3_866_496)
  })

  it('agrees with price(): platform fee equals SaaS Year-1 minus one-time implementation', () => {
    const deal = buildSampleDeal({
      dp_base: 2_500_000,
      deployment_mode: 'saas',
      dspm: false,
      dam: false,
      endpoint: false,
      quantities: {},
    })
    for (const basis of ['onprem_ref', 'saas_v3'] as const) {
      const card = { ...RATE_CARD_SEED, saas_cm: { ...RATE_CARD_SEED.saas_cm, infra_basis: basis } }
      const res = price(card, deal)
      const cm = res.lines[0]
      expect(basisPreview(card, basis, 2_500_000).platform_fee_inr_yr).toBe(cm.year1_inr - cm.one_time_inr)
    }
  })
})

describe('basisSwitchPreview', () => {
  it('reports both bases, the sample tier and the delta', () => {
    const p = basisSwitchPreview(RATE_CARD_SEED, 2_500_000)
    expect(p.tier_label).toBe('25L')
    expect(p.onprem_ref.platform_fee_inr_yr).toBe(5_887_579)
    expect(p.saas_v3.platform_fee_inr_yr).toBe(3_866_496)
    expect(p.delta_inr_yr).toBe(3_866_496 - 5_887_579)
  })
})

describe('buildSampleDeal', () => {
  it('builds a no-growth, no-discount deal with 3-year default TCO', () => {
    const d = buildSampleDeal({
      dp_base: 2_500_000,
      deployment_mode: 'onprem',
      dspm: true,
      dam: false,
      endpoint: false,
      quantities: { database: 50 },
    })
    expect(d.dp_base_y1).toBe(2_500_000)
    expect(d.dp_base_y2).toBe(2_500_000)
    expect(d.tco_years).toBe(3)
    expect(d.discount_pct).toBe(0)
    expect(d.modules).toEqual({ dspm: true, dam: false, endpoint: false })
    expect(d.estate_quantities).toEqual({ database: 50 })
  })

  it('clamps negative/fractional sample bases to a whole non-negative number', () => {
    expect(buildSampleDeal({ dp_base: -5, deployment_mode: 'saas', dspm: false, dam: false, endpoint: false, quantities: {} }).dp_base_y1).toBe(0)
    expect(buildSampleDeal({ dp_base: 10.9, deployment_mode: 'saas', dspm: false, dam: false, endpoint: false, quantities: {} }).dp_base_y1).toBe(10)
  })

  it('honours an explicit TCO horizon', () => {
    const d = buildSampleDeal({ dp_base: 1, deployment_mode: 'onprem', dspm: false, dam: false, endpoint: false, quantities: {}, tco_years: 5 })
    expect(d.tco_years).toBe(5)
  })
})

describe('estateRateDescription', () => {
  it('has bespoke copy for every seed estate rate', () => {
    for (const rt of RATE_CARD_SEED.estate.rates) {
      const desc = estateRateDescription(rt.rate_key, rt.unit)
      expect(desc.length).toBeGreaterThan(10)
      expect(desc).not.toContain('undefined')
    }
  })

  it('falls back to a generic unit-based line for unknown keys', () => {
    expect(estateRateDescription('brand_new_rate', 'per widget')).toContain('per widget')
  })
})
