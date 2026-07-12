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

describe('SaaS CM (Excel parity: Calculator D66–D76; Excel 61,12,579.2 → rounded)', () => {
  it('25L committed, no growth: Y1 61,12,579 / Y2+ 58,87,579', () => {
    const res = price(RATE_CARD_SEED, { ...base, deployment_mode: 'saas' })
    const cm = res.lines[0]
    // infra = 3671*12*83*1.2 = 43,87,579.2 → 43,87,579; platform = 58,87,579
    expect(cm.year1_inr).toBe(6_112_579)
    expect(cm.recurring_inr).toBe(5_887_579)
    expect(cm.one_time_inr).toBe(225_000)
    // Model Comparison F27: 1,78,87,737.6 → rounded
    expect(cm.tco_inr).toBe(17_887_737)
  })

  it('overage: Y2 base 30L over 25L committed adds 5,00,000 × ₹3', () => {
    const res = price(RATE_CARD_SEED, { ...base, deployment_mode: 'saas', dp_base_y2: 3_000_000 })
    expect(res.lines[0].recurring_inr).toBe(5_887_579 + 1_500_000)
  })

  it('Year-2 floor never exceeds platform + overage (guard, matches MAX in D74)', () => {
    const res = price(RATE_CARD_SEED, { ...base, deployment_mode: 'saas' })
    expect(res.lines[0].recurring_inr).toBeGreaterThanOrEqual(Math.round(0.3 * 5_887_579))
  })

  it('infra basis switch (D1): saas_v3 column reprices 25L tier from $3,671 to $1,980/mo', () => {
    const card = { ...RATE_CARD_SEED, saas_cm: { ...RATE_CARD_SEED.saas_cm, infra_basis: 'saas_v3' as const } }
    const res = price(card, { ...base, deployment_mode: 'saas' })
    // 1980*12*83*1.2 = 23,66,496; platform = 38,66,496; Y1 = +2,25,000
    expect(res.lines[0].year1_inr).toBe(225_000 + 1_500_000 + 2_366_496)
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
    expect(res.lines[0].year1_inr).toBe(6_112_579)
    expect(res.lines[1].year1_inr).toBe(5_200_000)
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
    expect(all.hybrid.total_tco_inr).toBe(17_887_737)
    expect(all.saas.total_tco_inr).toBe(17_887_737)
  })

  it('every published number has a trace path; determinism holds', () => {
    const a = price(RATE_CARD_SEED, base)
    const b = price(RATE_CARD_SEED, base)
    expect(a).toEqual(b)
    expect(a.trace.length).toBeGreaterThan(0)
    expect(a.trace.every((s) => typeof s.result === 'number' && s.formula.length > 0)).toBe(true)
  })
})
