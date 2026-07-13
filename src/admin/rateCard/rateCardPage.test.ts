// Pure-helper tests for the admin Rate Card page (no DOM / component tests —
// jsdom is not configured; the React tree is verified by CI type-checking).
import { describe, expect, it } from 'vitest'
import { RATE_CARD_SEED } from '../../lib/engine2/seed'
import { price } from '../../lib/engine2/engine2'
import {
  buildSampleDeal,
  estateRateDescription,
  inputToPct,
  pctToInput,
  pickSaasTier,
  saasVsOnPremYear1,
  tierDerivedRate,
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

describe('tierDerivedRate (per-tier ₹/DP: ceil(platform ÷ tier user_cap), the admin "₹/DP (derived)" column)', () => {
  it('matches the seed saas_v3 basis (default) for every tier: rates 5/3/2/2/1', () => {
    const expectedRate = [5, 3, 2, 2, 1]
    RATE_CARD_SEED.saas_cm.tiers.forEach((t, i) => {
      expect(tierDerivedRate(RATE_CARD_SEED, t).rate_inr_per_dp).toBe(expectedRate[i])
    })
  })

  it('25L tier: infra 23,66,496, platform 38,66,496, rate ceil(38,66,496 ÷ 25,00,000) = ceil(1.5465984) = ₹2/DP', () => {
    const tier = RATE_CARD_SEED.saas_cm.tiers.find((t) => t.tier_key === '25l')!
    const d = tierDerivedRate(RATE_CARD_SEED, tier)
    expect(d.infra_inr_yr).toBe(2_366_496)
    expect(d.platform_fee_inr_yr).toBe(3_866_496)
    expect(d.rate_inr_per_dp).toBe(2)
  })

  it('reproduces the historical 7/4/3/2/2 overage column at the onprem_ref basis', () => {
    const card = { ...RATE_CARD_SEED, saas_cm: { ...RATE_CARD_SEED.saas_cm, infra_basis: 'onprem_ref' as const } }
    const expectedRate = [7, 4, 3, 2, 2]
    card.saas_cm.tiers.forEach((t, i) => {
      expect(tierDerivedRate(card, t).rate_inr_per_dp).toBe(expectedRate[i])
    })
  })
})

describe('saasVsOnPremYear1 ("SaaS vs On-Prem — Year 1" tuning table, overage-free quote)', () => {
  it('at the seed saas_v3 basis: SaaS Year 1 (implementation + platform, no overage) vs the covering On-Prem slab', () => {
    const rows = saasVsOnPremYear1(RATE_CARD_SEED)
    expect(rows).toHaveLength(5)

    const byKey = new Map(rows.map((r) => [r.tier_key, r] as const))
    const get = (key: string) => byKey.get(key)!

    // Tier 0: Y1 = 2,25,000 + 22,76,880 = 25,01,880 (no overage in the quote)
    // On-Prem: first slab with cap >= 5,00,000 is Small (licence 20,00,000) → 20,00,000 × 1.48 = 29,60,000
    expect(get('tier0').saas_year1_at_cap_inr).toBe(2_501_880)
    expect(get('tier0').onprem_year1_inr).toBe(2_960_000)
    expect(get('tier0').onprem_slab_label).toBe('Small')
    expect(get('tier0').saas_gte_onprem).toBe(false)

    // 10L: infra 950*12*83*1.2 = 11,35,440; platform = 15,00,000 + 11,35,440 = 26,35,440; Y1 = 2,25,000 + 26,35,440 = 28,60,440
    // On-Prem: first slab with cap >= 10,00,000 is Mid (licence 30,00,000) → 30,00,000 × 1.48 = 44,40,000
    expect(get('10l').saas_year1_at_cap_inr).toBe(2_860_440)
    expect(get('10l').onprem_year1_inr).toBe(4_440_000)
    expect(get('10l').onprem_slab_label).toBe('Mid')
    expect(get('10l').saas_gte_onprem).toBe(false)

    // 25L: Y1 = 2,25,000 + 38,66,496 = 40,91,496 (no overage in the quote)
    // On-Prem: first slab with cap >= 25,00,000 is Mid (cap 25,00,000 exactly) → 44,40,000
    expect(get('25l').saas_year1_at_cap_inr).toBe(4_091_496)
    expect(get('25l').onprem_year1_inr).toBe(4_440_000)
    expect(get('25l').saas_gte_onprem).toBe(false)

    // 50L: infra 3089*12*83*1.2 = 36,91,972.8 → 36,91,973; platform = 15,00,000 + 36,91,973 = 51,91,973; Y1 = 2,25,000 + 51,91,973 = 54,16,973
    // On-Prem: first slab with cap >= 50,00,000 is Large (licence 50,00,000) → 50,00,000 × 1.48 = 74,00,000
    expect(get('50l').saas_year1_at_cap_inr).toBe(5_416_973)
    expect(get('50l').onprem_year1_inr).toBe(7_400_000)
    expect(get('50l').onprem_slab_label).toBe('Large')
    expect(get('50l').saas_gte_onprem).toBe(false)

    // 100L: infra 5385*12*83*1.2 = 64,36,152; platform = 15,00,000 + 64,36,152 = 79,36,152; Y1 = 2,25,000 + 79,36,152 = 81,61,152
    // On-Prem: first slab with cap >= 1,00,00,000 is Large (cap 1,00,00,000 exactly) → 74,00,000
    expect(get('100l').saas_year1_at_cap_inr).toBe(8_161_152)
    expect(get('100l').onprem_year1_inr).toBe(7_400_000)
    expect(get('100l').onprem_slab_label).toBe('Large')
    expect(get('100l').saas_gte_onprem).toBe(true)
  })

  it('flags every tier that needs tuning (seed data, overage-free quote: only the 100L tier now exceeds On-Prem)', () => {
    const flagged = saasVsOnPremYear1(RATE_CARD_SEED)
      .filter((r) => r.saas_gte_onprem)
      .map((r) => r.tier_key)
    expect(flagged).toEqual(['100l'])
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

  it("WorkedExample's default sample (5,00,000 DP, SaaS, 3yr TCO — the owner's canonical demo case): Y1 25,01,880, Year 2+ 6,83,064 (the overage-free quote — overage no longer appears)", () => {
    const deal = buildSampleDeal({
      dp_base: 500_000,
      deployment_mode: 'saas',
      dspm: false,
      dam: false,
      endpoint: false,
      quantities: {},
    })
    const res = price(RATE_CARD_SEED, deal)
    const cm = res.lines[0]
    expect(cm.year1_inr).toBe(2_501_880)
    expect(cm.recurring_inr).toBe(683_064)
  })
})

describe('pctToInput / inputToPct (percent-input boundary conversion)', () => {
  it('converts stored fractions to whole-percent display values', () => {
    expect(pctToInput(0.18)).toBe(18)
    expect(pctToInput(0.3)).toBe(30)
    expect(pctToInput(0.2)).toBe(20)
    expect(pctToInput(0.15)).toBe(15)
    expect(pctToInput(0.12)).toBe(12)
  })

  it('converts whole-percent input values back to stored fractions', () => {
    expect(inputToPct(18)).toBe(0.18)
    expect(inputToPct(30)).toBe(0.3)
    expect(inputToPct(20)).toBe(0.2)
    expect(inputToPct(15)).toBe(0.15)
    expect(inputToPct(12)).toBe(0.12)
  })

  it('round-trips every seed percent field without float artifacts', () => {
    const fractions = [
      RATE_CARD_SEED.onprem_cm.deployment_pct,
      RATE_CARD_SEED.onprem_cm.support_pct,
      RATE_CARD_SEED.saas_cm.sgna_uplift_pct,
      RATE_CARD_SEED.saas_cm.implementation_pct,
      RATE_CARD_SEED.saas_cm.y2_floor_pct,
      RATE_CARD_SEED.estate.deployment_pct,
      RATE_CARD_SEED.estate.amc_pct,
    ]
    for (const f of fractions) {
      // exact round-trip: no 0.18000000000000002-style artifacts
      expect(inputToPct(pctToInput(f))).toBe(f)
    }
  })

  it('18 -> 0.18 -> 18 round-trips exactly (owner example)', () => {
    expect(inputToPct(18)).toBe(0.18)
    expect(pctToInput(inputToPct(18))).toBe(18)
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
