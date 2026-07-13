// Golden parity fixtures: expected values read directly from
// Perfios_CM_Proposal_Builder.xlsx Calculator/Model Comparison with known
// inputs. Engine rounds to whole rupees; Excel keeps fractions (noted inline).
import { describe, expect, it } from 'vitest'
import { price, priceAllModes } from './engine2'
import { RATE_CARD_SEED } from './seed'
import type { DealInputs } from './types'

const base: DealInputs = {
  deployment_mode: 'onprem',
  dp_base_y1: 2_500_000,
  dp_base_y2: 2_500_000,
  modules: { dspm: false, dam: false, endpoint: false },
  estate_quantities: {},
  tco_years: 3,
  discount_pct: 0,
}

describe('On-Prem CM (Excel parity: Calculator D61–D65)', () => {
  it('25L base → Mid slab: Y1 44,40,000 / Y2+ 9,00,000 / 3yr TCO 62,40,000 / one-time 35,40,000', () => {
    const res = price(RATE_CARD_SEED, base)
    const cm = res.lines[0]
    expect(cm.year1_inr).toBe(4_440_000)
    expect(cm.recurring_inr).toBe(900_000)
    expect(cm.tco_inr).toBe(6_240_000)
    expect(res.total_one_time_inr).toBe(3_540_000)
    expect(res.total_tco_inr).toBe(6_240_000)
  })

  it('slab boundaries: exactly at cap stays in slab; cap+1 moves up; beyond Large → Group', () => {
    const at = (dp: number) => price(RATE_CARD_SEED, { ...base, dp_base_y1: dp }).lines[0].year1_inr
    const y1 = (licence: number) => licence + 0.18 * licence + 0.3 * licence
    expect(at(500_000)).toBe(y1(2_000_000)) // Small at cap
    expect(at(500_001)).toBe(y1(3_000_000)) // Mid
    expect(at(2_500_000)).toBe(y1(3_000_000)) // Mid at cap
    expect(at(10_000_001)).toBe(y1(85_000_000)) // Group catch-all
  })
})

describe('SaaS CM (overage-free quoted model, 2026-07-13 owner direction, confirmed on the CM Calculator call with Rohit: "One time, implementation + per DP cost. That\'s all for CM SaaS" — Year 1 = implementation + platform fee, Year 2+ = renewal (30% of the platform fee); overage beyond the bundle is a published rate billed on actuals, never a quoted amount, and dp_base_y2 no longer affects price. Committed 25L tier: platform 38,66,496, cap 25,00,000, rate ceil(1.5465984)=₹2/DP, included 15,00,000, renewal r(0.3×38,66,496)=11,59,949)', () => {
  it('25L tier: any dp within cap prices identically (dp 25,00,000 and dp 15,00,000) — Y1 40,91,496, recurring 11,59,949, 3yr TCO 64,11,394, one-time 2,25,000, rate ₹2/DP, bundle 15,00,000', () => {
    for (const dp of [2_500_000, 1_500_000]) {
      const res = price(RATE_CARD_SEED, { ...base, deployment_mode: 'saas', dp_base_y1: dp })
      const cm = res.lines[0]
      expect(cm.one_time_inr).toBe(225_000)
      expect(cm.year1_inr).toBe(4_091_496)
      expect(cm.recurring_inr).toBe(1_159_949)
      expect(cm.tco_inr).toBe(6_411_394)
      expect(res.saas_per_user_rate).toBe(2)
      expect(res.saas_included_dp).toBe(1_500_000)
    }
  })

  it('dp_base_y2 no longer affects price — overage is a published rate billed on actuals, never quoted', () => {
    const res = price(RATE_CARD_SEED, { ...base, deployment_mode: 'saas', dp_base_y2: 3_000_000 })
    expect(res.lines[0].recurring_inr).toBe(1_159_949)
  })

  it('Tier-0: dp 3,00,000 (at the bundle) and dp 5,00,000 (at cap) price identically — platform 22,76,880, rate ceil(4.5538)=₹5/DP, Y1 25,01,880, recurring (renewal alone) 6,83,064, 3yr TCO 38,68,008', () => {
    // infra = 650*12*83*1.2 = 7,76,880; platform = 15,00,000 + 7,76,880 = 22,76,880; cap 5,00,000 → ceil(22,76,880/5,00,000) = ceil(4.5538) = 5
    for (const dp of [300_000, 500_000]) {
      const res = price(RATE_CARD_SEED, { ...base, deployment_mode: 'saas', dp_base_y1: dp, dp_base_y2: dp })
      const cm = res.lines[0]
      expect(res.saas_included_dp).toBe(300_000)
      expect(res.saas_per_user_rate).toBe(5)
      expect(cm.year1_inr).toBe(2_501_880)
      expect(cm.recurring_inr).toBe(683_064)
      expect(cm.tco_inr).toBe(3_868_008)
    }
  })

  it('legacy reproduction: ceil(platform ÷ tier cap) at the onprem_ref basis reproduces the historical 7/4/3/2/2 overage column exactly, one tier at a time', () => {
    const card = { ...RATE_CARD_SEED, saas_cm: { ...RATE_CARD_SEED.saas_cm, infra_basis: 'onprem_ref' as const } }
    // Hand-verified platforms (licence 15,00,000 + round(usd_mo × 12 × 83 × 1.2)):
    // tier0 31,09,934; 10l 33,51,365; 25l 58,87,579; 50l 69,23,818; 100l 1,05,15,394
    const expectedRate = [7, 4, 3, 2, 2]
    RATE_CARD_SEED.saas_cm.tiers.forEach((tier, i) => {
      const res = price(card, { ...base, deployment_mode: 'saas', dp_base_y1: tier.user_cap, dp_base_y2: tier.user_cap })
      expect(res.saas_per_user_rate).toBe(expectedRate[i])
    })
  })

  it('onprem_ref regression (constructed card, dp 1,500,000): platform 58,87,579 → Y1 61,12,579; recurring (renewal alone) 17,66,274', () => {
    const card = { ...RATE_CARD_SEED, saas_cm: { ...RATE_CARD_SEED.saas_cm, infra_basis: 'onprem_ref' as const } }
    const res = price(card, { ...base, deployment_mode: 'saas', dp_base_y1: 1_500_000, dp_base_y2: 1_500_000 })
    // 3671*12*83*1.2 = 43,87,579.2 → 43,87,579; platform = 15,00,000 + 43,87,579 = 58,87,579
    expect(res.lines[0].year1_inr).toBe(6_112_579)
    // renewal = round(0.3 × 58,87,579) = 17,66,274; no overage in the quote → recurring = renewal
    expect(res.lines[0].recurring_inr).toBe(1_766_274)
  })

  it('trace includes the bundle/overage-rate/renewal steps for saas with the correct render kinds, never for onprem; the retired Year-1/Year-2+ overage labels are gone', () => {
    const saasRes = price(RATE_CARD_SEED, { ...base, deployment_mode: 'saas' })
    const onpremRes = price(RATE_CARD_SEED, base)
    for (const label of [
      'Included DP bundle',
      'Overage rate (billed on actuals, beyond the bundle)',
      'Year 2+ renewal (30% of platform)',
    ]) {
      expect(saasRes.trace.some((s) => s.label === label)).toBe(true)
      expect(onpremRes.trace.some((s) => s.label === label)).toBe(false)
    }
    for (const retiredLabel of ['Year 1 overage', 'Year 2+ overage', 'Year 2+ total']) {
      expect(saasRes.trace.some((s) => s.label === retiredLabel)).toBe(false)
    }
    const step = (label: string) => saasRes.trace.find((s) => s.label === label)!
    expect(step('SaaS tier').kind).toBe('usd')
    expect(step('Included DP bundle').kind).toBe('count')
    expect(step('Included DP bundle').formula).toContain('all consent actions')
    expect(step('Overage rate (billed on actuals, beyond the bundle)').kind).toBe('rate')
  })
})

describe('Estate modules (Excel parity: Calculator D79–D92)', () => {
  const estateInputs: DealInputs = {
    ...base,
    modules: { dspm: true, dam: false, endpoint: false },
    estate_quantities: {
      database: 50,
      cloud_connector: 4,
      account: 4,
      gdrive_user: 2_000,
      vm: 50,
    },
  }

  it('DSPM only: shared 20,50,000 + specific 19,50,000 → Y1 52,00,000 / Y2+ 44,80,000', () => {
    const res = price(RATE_CARD_SEED, estateInputs)
    const dspm = res.lines[1]
    expect(dspm.year1_inr).toBe(5_200_000) // 40,00,000 × 1.30
    expect(dspm.recurring_inr).toBe(4_480_000) // 40,00,000 × 1.12
    expect(dspm.one_time_inr).toBe(720_000) // 40,00,000 × 0.18
  })

  it('shared base charged once: with DSPM on, DAM gets only DAM-specific datasets', () => {
    const res = price(RATE_CARD_SEED, {
      ...estateInputs,
      modules: { dspm: true, dam: true, endpoint: false },
      estate_quantities: { ...estateInputs.estate_quantities, dam_dataset: 2 },
    })
    expect(res.lines[2].year1_inr).toBe(Math.round(300_000 * 1.3))
  })

  it('DAM without DSPM inherits the shared base', () => {
    const res = price(RATE_CARD_SEED, {
      ...estateInputs,
      modules: { dspm: false, dam: true, endpoint: false },
      estate_quantities: { database: 50, cloud_connector: 4, account: 4, dam_dataset: 0 },
    })
    expect(res.lines[2].year1_inr).toBe(Math.round(2_050_000 * 1.3))
  })

  it('SaaS is CM-only: estate toggles are ignored', () => {
    const res = price(RATE_CARD_SEED, { ...estateInputs, deployment_mode: 'saas' })
    expect(res.lines[1].included).toBe(false)
    expect(res.lines[1].year1_inr).toBe(0)
  })

  it('Hybrid: CM priced as SaaS, estate still available', () => {
    const res = price(RATE_CARD_SEED, { ...estateInputs, deployment_mode: 'hybrid' })
    // estateInputs carries base's dp 25L both years → same overage-free Y1 as the SaaS 25L case
    expect(res.lines[0].year1_inr).toBe(4_091_496)
    expect(res.lines[1].year1_inr).toBe(5_200_000)
  })
})

describe('estate rate overrides (deal-level endpoint pricing)', () => {
  const endpointInputs: DealInputs = {
    ...base,
    modules: { dspm: false, dam: false, endpoint: true },
    estate_quantities: { endpoint_device: 100 },
  }

  it('override honored: endpoint_device at 150 → base = 100 × 150 = 15,000', () => {
    const res = price(RATE_CARD_SEED, {
      ...endpointInputs,
      estate_rate_overrides: { endpoint_device: 150 },
    })
    const endpoint = res.lines[3]
    expect(endpoint.one_time_inr).toBe(2_700) // 15,000 × 0.18
    expect(endpoint.year1_inr).toBe(19_500) // 15,000 × 1.30
    expect(endpoint.recurring_inr).toBe(16_800) // 15,000 × 1.12
  })

  it('absent override falls back to the card rate: base = 100 × 1,600 = 1,60,000', () => {
    const res = price(RATE_CARD_SEED, endpointInputs)
    const endpoint = res.lines[3]
    expect(endpoint.year1_inr).toBe(208_000) // 1,60,000 × 1.30
    expect(endpoint.recurring_inr).toBe(179_200) // 1,60,000 × 1.12
  })

  it('negative override is ignored: falls back to the card rate', () => {
    const res = price(RATE_CARD_SEED, {
      ...endpointInputs,
      estate_rate_overrides: { endpoint_device: -1 },
    })
    const endpoint = res.lines[3]
    expect(endpoint.year1_inr).toBe(208_000)
  })

  it('trace contains the override step: "Rate override: Endpoint device at ₹150/device (rate card: ₹1,600) — deal-specific"', () => {
    const res = price(RATE_CARD_SEED, {
      ...endpointInputs,
      estate_rate_overrides: { endpoint_device: 150 },
    })
    const step = res.trace.find((s) => s.label === 'Rate override')
    expect(step).toBeDefined()
    expect(`${step?.label}: ${step?.formula}`).toBe(
      'Rate override: Endpoint device at ₹150/device (rate card: ₹1,600) — deal-specific',
    )
    expect(step?.result).toBe(150)
  })

  it('no trace step when there is no override (or it equals the card rate)', () => {
    const res = price(RATE_CARD_SEED, endpointInputs)
    expect(res.trace.some((s) => s.label === 'Rate override')).toBe(false)
    const same = price(RATE_CARD_SEED, { ...endpointInputs, estate_rate_overrides: { endpoint_device: 1_600 } })
    expect(same.trace.some((s) => s.label === 'Rate override')).toBe(false)
  })
})

describe('totals, discount, compare, trace', () => {
  it('discount produces net alongside untouched list', () => {
    const res = price(RATE_CARD_SEED, { ...base, discount_pct: 0.1 })
    expect(res.total_tco_inr).toBe(6_240_000)
    expect(res.net_total_tco_inr).toBe(5_616_000)
  })

  it('priceAllModes reproduces Model Comparison D27/E27/F27 (3yr TCO)', () => {
    const all = priceAllModes(RATE_CARD_SEED, base)
    expect(all.onprem.total_tco_inr).toBe(6_240_000)
    // base carries dp 25L (no-estate) — hybrid/saas CM quotes are overage-free
    // (Year 1 = implementation + platform; Year 2+ = 30% renewal), 2026-07-13
    // owner direction, confirmed on the CM Calculator call with Rohit
    expect(all.hybrid.total_tco_inr).toBe(6_411_394)
    expect(all.saas.total_tco_inr).toBe(6_411_394)
  })

  it('every published number has a trace path; determinism holds', () => {
    const a = price(RATE_CARD_SEED, base)
    const b = price(RATE_CARD_SEED, base)
    expect(a).toEqual(b)
    expect(a.trace.length).toBeGreaterThan(0)
    expect(a.trace.every((s) => typeof s.result === 'number' && s.formula.length > 0)).toBe(true)
  })
})
