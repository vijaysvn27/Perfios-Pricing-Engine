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

describe('SaaS CM (2026-07-13: default basis saas_v3, owner direction; committed 25L tier: infra 23,66,496, platform 38,66,496, per-user rate 1.5465984)', () => {
  it('25L committed, no growth: Y1 40,91,496 / Y2+ 38,66,496', () => {
    const res = price(RATE_CARD_SEED, { ...base, deployment_mode: 'saas' })
    const cm = res.lines[0]
    // infra = 1980*12*83*1.2 = 23,66,496; platform = 38,66,496
    expect(cm.year1_inr).toBe(4_091_496)
    expect(cm.recurring_inr).toBe(3_866_496)
    expect(cm.one_time_inr).toBe(225_000)
    // 3-yr TCO = 40,91,496 + 2×38,66,496 = 1,18,24,488
    expect(cm.tco_inr).toBe(11_824_488)
    expect(res.saas_per_user_rate).toBeCloseTo(1.5465984)
  })

  it('per-user rate at committed usage reproduces the platform fee exactly: round(committed × rate) === platform', () => {
    const res = price(RATE_CARD_SEED, { ...base, deployment_mode: 'saas' })
    const rate = res.saas_per_user_rate
    expect(rate).toBeDefined()
    expect(Math.round(base.dp_base_y1 * (rate as number))).toBe(3_866_496)
  })

  it('growth: Y2 base 30L over 25L committed bills 30,00,000 users × the per-user rate (replaces the old overage line)', () => {
    const res = price(RATE_CARD_SEED, { ...base, deployment_mode: 'saas', dp_base_y2: 3_000_000 })
    // round(30,00,000 × 1.5465984) = 46,39,795
    expect(res.lines[0].recurring_inr).toBe(4_639_795)
  })

  it('shrink: Y2 base 5L under 25L committed floors at 30% of the Year-1 platform fee (floor finally binds)', () => {
    const res = price(RATE_CARD_SEED, { ...base, deployment_mode: 'saas', dp_base_y2: 500_000 })
    // usage round(5,00,000 × 1.5465984) = 7,73,299 < floor round(0.3 × 38,66,496) = 11,59,949
    expect(res.lines[0].recurring_inr).toBe(1_159_949)
  })

  it('Year-2 floor is a lower bound (guard, matches MAX in the engine)', () => {
    const res = price(RATE_CARD_SEED, { ...base, deployment_mode: 'saas' })
    expect(res.lines[0].recurring_inr).toBeGreaterThanOrEqual(Math.round(0.3 * 3_866_496))
  })

  it('infra basis switch (D1): saas_v3 is now the default; onprem_ref remains available and reprices 25L tier from $1,980 back to $3,671/mo', () => {
    const card = { ...RATE_CARD_SEED, saas_cm: { ...RATE_CARD_SEED.saas_cm, infra_basis: 'onprem_ref' as const } }
    const res = price(card, { ...base, deployment_mode: 'saas' })
    // 3671*12*83*1.2 = 43,87,579.2 → 43,87,579; platform = 58,87,579; Y1 = +2,25,000
    expect(res.lines[0].year1_inr).toBe(6_112_579)
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
    expect(all.hybrid.total_tco_inr).toBe(11_824_488)
    expect(all.saas.total_tco_inr).toBe(11_824_488)
  })

  it('every published number has a trace path; determinism holds', () => {
    const a = price(RATE_CARD_SEED, base)
    const b = price(RATE_CARD_SEED, base)
    expect(a).toEqual(b)
    expect(a.trace.length).toBeGreaterThan(0)
    expect(a.trace.every((s) => typeof s.result === 'number' && s.formula.length > 0)).toBe(true)
  })
})
