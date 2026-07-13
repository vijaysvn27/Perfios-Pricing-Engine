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

  it('agrees with price(): platform fee equals SaaS Year-1 minus one-time implementation minus Year-1 overage (bundled-DP model: 25L committed is beyond the 15L bundle, so overage is non-zero)', () => {
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
      const rate = res.saas_per_user_rate as number
      const included = res.saas_included_dp as number
      const y1Overage = Math.max(0, deal.dp_base_y1 - included) * rate
      expect(basisPreview(card, basis, 2_500_000).platform_fee_inr_yr).toBe(cm.year1_inr - cm.one_time_inr - y1Overage)
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

describe('saasVsOnPremYear1 ("SaaS vs On-Prem — Year 1" tuning table)', () => {
  it('at the seed saas_v3 basis: SaaS Year 1 at each tier cap vs the covering On-Prem slab', () => {
    const rows = saasVsOnPremYear1(RATE_CARD_SEED)
    expect(rows).toHaveLength(5)

    const byKey = new Map(rows.map((r) => [r.tier_key, r] as const))
    const get = (key: string) => byKey.get(key)!

    // Tier 0: cap 5L, included 3L, rate ₹5 → overage 2L×5=10L; Y1 = 2,25,000 + 22,76,880 + 10,00,000 = 35,01,880
    // On-Prem: first slab with cap >= 5,00,000 is Small (licence 20,00,000) → 20,00,000 × 1.48 = 29,60,000
    expect(get('tier0').saas_year1_at_cap_inr).toBe(3_501_880)
    expect(get('tier0').onprem_year1_inr).toBe(2_960_000)
    expect(get('tier0').onprem_slab_label).toBe('Small')
    expect(get('tier0').saas_gte_onprem).toBe(true)

    // 10L: cap 10L, included 6L, rate ₹3 → overage 4L×3=12L; Y1 = 2,25,000 + 26,35,440 + 12,00,000 = 40,60,440
    // On-Prem: first slab with cap >= 10,00,000 is Mid (licence 30,00,000) → 30,00,000 × 1.48 = 44,40,000
    expect(get('10l').saas_year1_at_cap_inr).toBe(4_060_440)
    expect(get('10l').onprem_year1_inr).toBe(4_440_000)
    expect(get('10l').onprem_slab_label).toBe('Mid')
    expect(get('10l').saas_gte_onprem).toBe(false) // SaaS undercuts On-Prem at this tier's cap

    // 25L: cap 25L, included 15L, rate ₹2 → overage 10L×2=20L; Y1 = 2,25,000 + 38,66,496 + 20,00,000 = 60,91,496
    // On-Prem: first slab with cap >= 25,00,000 is Mid (cap 25,00,000 exactly) → 44,40,000
    expect(get('25l').saas_year1_at_cap_inr).toBe(6_091_496)
    expect(get('25l').onprem_year1_inr).toBe(4_440_000)
    expect(get('25l').saas_gte_onprem).toBe(true)
  })

  it('flags every tier that needs tuning (seed data: only the 10L tier currently undercuts On-Prem)', () => {
    const flagged = saasVsOnPremYear1(RATE_CARD_SEED)
      .filter((r) => r.saas_gte_onprem)
      .map((r) => r.tier_key)
    expect(flagged).toEqual(['tier0', '25l', '50l', '100l'])
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

  it("WorkedExample's default sample (5,00,000 DP, SaaS, 3yr TCO — the owner's canonical demo case): Y1 35,01,880, Year 2+ 16,83,064 (renewal 6,83,064 + overage 2,00,000 × ₹5 = 10,00,000)", () => {
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
    expect(cm.year1_inr).toBe(3_501_880)
    expect(cm.recurring_inr).toBe(1_683_064)
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
