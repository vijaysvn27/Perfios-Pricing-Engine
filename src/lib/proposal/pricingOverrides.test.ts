// AM Pricing Worksheet plumbing (pricingOverrides.ts): per-cell negotiated
// prices applied over engine2's priced ModeResult. Every asserted number is
// hand-verified against the seed rate card:
//
// On-Prem 25L fixture (dp_base_y1 2,500,000 → Mid slab, licence 3,000,000):
//   deployment 18% = 540,000; support 30% = 900,000.
//   CM one_time = 3,540,000; years = [4,440,000, 900,000, 900,000];
//   tco = 4,440,000 + 2 × 900,000 = 6,240,000.
// DSPM (modules.dspm, database:10 + account:1):
//   shared base = 10 × 1,000 + 1 × 100,000 = 110,000;
//   one_time = 18% × 110,000 = 19,800; year1 = 110,000 × 1.30 = 143,000;
//   recurring = 110,000 × 1.12 = 123,200; years = [143,000, 123,200, 123,200];
//   tco = 143,000 + 2 × 123,200 = 389,400.
import { describe, expect, it } from 'vitest'
import { price } from '../engine2/engine2'
import { RATE_CARD_SEED } from '../engine2/seed'
import type { DealInputs } from '../engine2/types'
import {
  applyPctAcross,
  applyPricingOverrides,
  hasOverrides,
  listVsNegotiated,
  overrideKey,
  type PricingOverrides,
} from './pricingOverrides'

const onpremInputs: DealInputs = {
  deployment_mode: 'onprem',
  dp_base_y1: 2_500_000,
  dp_base_y2: 2_500_000,
  modules: { dspm: false, dam: false, endpoint: false },
  estate_quantities: {},
  tco_years: 3,
  discount_pct: 0,
}

const withDspmInputs: DealInputs = {
  ...onpremInputs,
  modules: { dspm: true, dam: false, endpoint: false },
  estate_quantities: { database: 10, account: 1 },
}

function cmLine(result: ReturnType<typeof price>) {
  const line = result.lines.find((l) => l.component_key === 'cm')
  if (!line) throw new Error('missing cm line')
  return line
}

describe('overrideKey', () => {
  it('builds "componentKey:one_time" and "componentKey:y{index}" (0-based)', () => {
    expect(overrideKey('cm', 'one_time')).toBe('cm:one_time')
    expect(overrideKey('cm', 0)).toBe('cm:y0')
    expect(overrideKey('dspm', 2)).toBe('dspm:y2')
  })
})

describe('applyPricingOverrides', () => {
  it('fixture sanity: on-prem 25L list prices match the ENGINE FACTS', () => {
    const result = price(RATE_CARD_SEED, onpremInputs)
    const cm = cmLine(result)
    expect(cm.one_time_inr).toBe(3_540_000)
    expect(cm.years_inr).toEqual([4_440_000, 900_000, 900_000])
    expect(cm.tco_inr).toBe(6_240_000)
    expect(result.total_year1_inr).toBe(4_440_000)
    expect(result.total_tco_inr).toBe(6_240_000)
  })

  it('single cell: CM Year 1 4,440,000 → 4,000,000 gives total_year1 4,000,000 and tco 5,800,000', () => {
    const result = price(RATE_CARD_SEED, onpremInputs)
    const adjusted = applyPricingOverrides(result, { 'cm:y0': 4_000_000 })

    const cm = cmLine(adjusted)
    expect(cm.years_inr).toEqual([4_000_000, 900_000, 900_000])
    expect(cm.year1_inr).toBe(4_000_000)
    expect(cm.tco_inr).toBe(5_800_000) // 4,000,000 + 2 × 900,000

    expect(adjusted.total_year1_inr).toBe(4_000_000)
    expect(adjusted.total_years_inr).toEqual([4_000_000, 900_000, 900_000])
    expect(adjusted.total_tco_inr).toBe(5_800_000)
    // The worksheet IS the negotiation: net totals equal the adjusted totals.
    expect(adjusted.net_total_year1_inr).toBe(4_000_000)
    expect(adjusted.net_total_tco_inr).toBe(5_800_000)
  })

  it('returns a NEW result — the input ModeResult is never mutated', () => {
    const result = price(RATE_CARD_SEED, onpremInputs)
    const adjusted = applyPricingOverrides(result, { 'cm:y0': 4_000_000 })
    expect(adjusted).not.toBe(result)
    expect(result.total_year1_inr).toBe(4_440_000)
    expect(cmLine(result).years_inr).toEqual([4_440_000, 900_000, 900_000])
    expect(result.trace.some((s) => s.label === 'Negotiated price')).toBe(false)
  })

  it('multiple cells incl. one-time: totals, recurring, and tco all recompute from the adjusted lines', () => {
    const result = price(RATE_CARD_SEED, onpremInputs)
    const overrides: PricingOverrides = {
      'cm:one_time': 3_000_000,
      'cm:y0': 4_000_000,
      'cm:y1': 800_000,
    }
    const adjusted = applyPricingOverrides(result, overrides)
    const cm = cmLine(adjusted)
    expect(cm.one_time_inr).toBe(3_000_000)
    expect(cm.years_inr).toEqual([4_000_000, 800_000, 900_000]) // y2 untouched = list
    expect(cm.recurring_inr).toBe(800_000) // = years_inr[1]
    expect(cm.tco_inr).toBe(5_700_000) // 4,000,000 + 800,000 + 900,000

    expect(adjusted.total_one_time_inr).toBe(3_000_000)
    expect(adjusted.total_recurring_inr).toBe(800_000)
    expect(adjusted.total_years_inr).toEqual([4_000_000, 800_000, 900_000])
    expect(adjusted.total_tco_inr).toBe(5_700_000)
  })

  it('multi-line deal: only the overridden line moves, totals re-sum across lines', () => {
    const result = price(RATE_CARD_SEED, withDspmInputs)
    // Fixture sanity (hand-computed in the header comment).
    const dspmList = result.lines.find((l) => l.component_key === 'dspm')
    expect(dspmList?.years_inr).toEqual([143_000, 123_200, 123_200])
    expect(result.total_tco_inr).toBe(6_629_400) // 6,240,000 + 389,400

    const adjusted = applyPricingOverrides(result, { 'dspm:y1': 100_000 })
    const dspm = adjusted.lines.find((l) => l.component_key === 'dspm')
    expect(dspm?.years_inr).toEqual([143_000, 100_000, 123_200])
    expect(dspm?.recurring_inr).toBe(100_000)
    expect(dspm?.tco_inr).toBe(366_200) // 143,000 + 100,000 + 123,200
    expect(cmLine(adjusted).years_inr).toEqual([4_440_000, 900_000, 900_000]) // untouched
    expect(adjusted.total_years_inr).toEqual([4_583_000, 1_000_000, 1_023_200])
    expect(adjusted.total_recurring_inr).toBe(1_000_000)
    expect(adjusted.total_tco_inr).toBe(6_606_200) // 6,240,000 + 366,200
  })

  it('ignores negative and non-finite overrides (cell stays at list)', () => {
    const result = price(RATE_CARD_SEED, onpremInputs)
    const adjusted = applyPricingOverrides(result, {
      'cm:y0': -100,
      'cm:y1': Number.NaN,
      'cm:one_time': Number.POSITIVE_INFINITY,
    })
    expect(cmLine(adjusted).years_inr).toEqual([4_440_000, 900_000, 900_000])
    expect(cmLine(adjusted).one_time_inr).toBe(3_540_000)
    expect(adjusted.total_tco_inr).toBe(6_240_000)
    expect(adjusted.trace.some((s) => s.label === 'Negotiated price')).toBe(false)
  })

  it('a zero override is valid — negotiating a cell down to nothing is allowed', () => {
    const result = price(RATE_CARD_SEED, onpremInputs)
    const adjusted = applyPricingOverrides(result, { 'cm:y2': 0 })
    expect(cmLine(adjusted).years_inr).toEqual([4_440_000, 900_000, 0])
    expect(adjusted.total_tco_inr).toBe(5_340_000) // 4,440,000 + 900,000
  })

  it('adds one transparent "Negotiated price" trace step per overridden cell', () => {
    const result = price(RATE_CARD_SEED, onpremInputs)
    const adjusted = applyPricingOverrides(result, { 'cm:y0': 4_000_000, 'cm:one_time': 3_000_000 })
    const steps = adjusted.trace.filter((s) => s.label === 'Negotiated price')
    expect(steps).toHaveLength(2)
    expect(steps.map((s) => s.formula)).toContain(
      'Consent Manager (7 modules), Year 1: list ₹44,40,000 → ₹40,00,000',
    )
    expect(steps.map((s) => s.formula)).toContain(
      'Consent Manager (7 modules), one-time: list ₹35,40,000 → ₹30,00,000',
    )
    expect(steps.find((s) => /Year 1/.test(s.formula))?.result).toBe(4_000_000)
    // The engine's own steps are preserved ahead of the negotiation steps.
    expect(adjusted.trace.length).toBe(result.trace.length + 2)
  })

  it('overrides keyed to an excluded (not-included) line are ignored', () => {
    const result = price(RATE_CARD_SEED, onpremInputs) // CM-only: dspm excluded
    const adjusted = applyPricingOverrides(result, { 'dspm:y0': 1_000_000 })
    expect(adjusted.total_tco_inr).toBe(6_240_000)
    expect(adjusted.lines.find((l) => l.component_key === 'dspm')?.years_inr).toEqual([0, 0, 0])
    expect(adjusted.trace.some((s) => s.label === 'Negotiated price')).toBe(false)
  })

  it('undefined / empty overrides leave every number at list', () => {
    const result = price(RATE_CARD_SEED, onpremInputs)
    for (const ov of [undefined, {}]) {
      const adjusted = applyPricingOverrides(result, ov)
      expect(adjusted.total_tco_inr).toBe(6_240_000)
      expect(adjusted.total_year1_inr).toBe(4_440_000)
      expect(adjusted.net_total_tco_inr).toBe(6_240_000)
    }
  })

  it('supersedes a legacy discount_pct: net totals follow the worksheet, not the % discount', () => {
    const discounted = price(RATE_CARD_SEED, { ...onpremInputs, discount_pct: 0.1 })
    expect(discounted.net_total_tco_inr).toBe(5_616_000) // engine: 6,240,000 × 0.9
    const adjusted = applyPricingOverrides(discounted, { 'cm:y0': 4_000_000 })
    expect(adjusted.net_total_tco_inr).toBe(5_800_000) // worksheet wins
    expect(adjusted.net_total_year1_inr).toBe(4_000_000)
  })
})

describe('applyPctAcross', () => {
  it('10% across the on-prem 25L fixture: every non-zero cell at 90% of list, rounded', () => {
    const result = price(RATE_CARD_SEED, onpremInputs)
    const overrides = applyPctAcross(result, 0.1)
    expect(overrides).toEqual({
      'cm:one_time': 3_186_000, // 3,540,000 × 0.9
      'cm:y0': 3_996_000, // 4,440,000 × 0.9
      'cm:y1': 810_000, // 900,000 × 0.9
      'cm:y2': 810_000,
    })
    // Round-trips through applyPricingOverrides to a coherent 90% total.
    const adjusted = applyPricingOverrides(result, overrides)
    expect(adjusted.total_tco_inr).toBe(5_616_000) // 3,996,000 + 2 × 810,000
    expect(adjusted.total_year1_inr).toBe(3_996_000)
  })

  it('covers every included line (multi-line deal), never excluded ones', () => {
    const result = price(RATE_CARD_SEED, withDspmInputs)
    const overrides = applyPctAcross(result, 0.1)
    expect(overrides['dspm:y0']).toBe(128_700) // 143,000 × 0.9
    expect(overrides['dspm:one_time']).toBe(17_820) // 19,800 × 0.9
    expect(Object.keys(overrides).some((k) => k.startsWith('dam:'))).toBe(false)
    expect(Object.keys(overrides).some((k) => k.startsWith('endpoint:'))).toBe(false)
  })

  it('rounds to the rupee and skips zero cells', () => {
    const result = price(RATE_CARD_SEED, onpremInputs)
    const overrides = applyPctAcross(result, 1 / 3) // 33.33…%
    expect(overrides['cm:y1']).toBe(600_000) // round(900,000 × 2/3)
    // A 0% pass still builds overrides (each at list) — the AM asked for it.
    const zeroPct = applyPctAcross(result, 0)
    expect(zeroPct['cm:y0']).toBe(4_440_000)
    // Invalid pcts clamp safely.
    expect(applyPctAcross(result, Number.NaN)['cm:y0']).toBe(4_440_000)
    expect(applyPctAcross(result, 2)['cm:y0']).toBe(0)
  })
})

describe('hasOverrides', () => {
  it('false for undefined or empty; true once any cell is negotiated', () => {
    expect(hasOverrides(undefined)).toBe(false)
    expect(hasOverrides({})).toBe(false)
    expect(hasOverrides({ 'cm:y0': 4_000_000 })).toBe(true)
  })
})

describe('listVsNegotiated', () => {
  it('pairs the list totals with the adjusted totals', () => {
    const result = price(RATE_CARD_SEED, onpremInputs)
    const adjusted = applyPricingOverrides(result, { 'cm:y0': 4_000_000 })
    expect(listVsNegotiated(result, adjusted)).toEqual({
      list_tco: 6_240_000,
      negotiated_tco: 5_800_000,
      list_y1: 4_440_000,
      negotiated_y1: 4_000_000,
    })
  })
})
