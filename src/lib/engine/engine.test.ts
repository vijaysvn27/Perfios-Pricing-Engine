import { describe, expect, it } from 'vitest'
import { calculatePricing } from './engine'
import type { ConfigSnapshot, Selections } from './types'
import { allOnes, seedSnapshot } from './__fixtures__/seedSnapshot'

// Deep-clone the seed snapshot and optionally override settings.
function withSettings(overrides: Partial<ConfigSnapshot['settings']>): ConfigSnapshot {
  return {
    ...seedSnapshot,
    settings: { ...seedSnapshot.settings, ...overrides },
  }
}

function sel(moduleKeys: string[], quantities = allOnes, cmTier?: string): Selections {
  return { moduleKeys, quantities, cmTier }
}

// Shared-platform line sum at qty 1: db+cloud_connector+account+onprem_connector+data_centre
const SHARED = 1000 + 400000 + 100000 + 900000 + 300000 // 1,701,000

describe('composite bucket', () => {
  it('DSPM only', () => {
    const r = calculatePricing(seedSnapshot, sel(['DSPM']))
    // base = shared + gdrive_user(800) + sharepoint_site(12000) = 1,713,800
    expect(r.year1).toBe(2227940) // base + 18% (308,484) + 12% (205,656)
    expect(r.year2).toBe(1919456) // base + amc (deployment dropped)
    expect(r.breakdown_for_admin_only.buckets[0].base_full).toBe(1713800)
  })

  it('DSPM + Data Flow counts shared platform once', () => {
    const r = calculatePricing(seedSnapshot, sel(['DSPM', 'DATA_FLOW']))
    // union = shared + gdrive(800) + sharepoint(12000) + vm(7000) = 1,720,800
    expect(r.breakdown_for_admin_only.buckets[0].base_full).toBe(1720800)
    expect(r.breakdown_for_admin_only.buckets[0].base_full).toBe(SHARED + 800 + 12000 + 7000)
    expect(r.year1).toBe(2237040) // + 18% 309,744 + 12% 206,496
    expect(r.year2).toBe(1927296)
  })

  it('DAM only', () => {
    const r = calculatePricing(seedSnapshot, sel(['DAM']))
    // base = shared + dam_dataset(150000) = 1,851,000
    expect(r.year1).toBe(2406300) // + 333,180 + 222,120
    expect(r.year2).toBe(2073120)
  })

  it('DAM + Data Flow', () => {
    const r = calculatePricing(seedSnapshot, sel(['DAM', 'DATA_FLOW']))
    // union = shared + dam_dataset(150000) + vm(7000) = 1,858,000
    expect(r.breakdown_for_admin_only.buckets[0].base_full).toBe(1858000)
    expect(r.year1).toBe(2415400)
    expect(r.year2).toBe(2080960)
  })

  it('DAM does NOT scale connectors/deployment/amc by dataset count', () => {
    // dam_dataset qty 2, everything else 1. Only the dataset LINE doubles (+150,000).
    const q = { ...allOnes, dam_dataset: 2 }
    const r = calculatePricing(seedSnapshot, sel(['DAM'], q))
    const b = r.breakdown_for_admin_only.buckets[0]
    expect(b.base_full).toBe(SHARED + 2 * 150000) // 2,001,000 — shared NOT multiplied
    expect(b.deployment).toBe(360180) // 18% of 2,001,000, not of (shared+150000)*2
    expect(b.amc).toBe(240120)
    expect(r.year1).toBe(2601300)
    expect(r.year2).toBe(2241120)
  })

  it('y2_includes_deployment=true makes Year 2 equal Year 1 (bug-compat toggle)', () => {
    const r = calculatePricing(withSettings({ y2_includes_deployment: true }), sel(['DSPM']))
    expect(r.year1).toBe(2227940)
    expect(r.year2).toBe(2227940)
  })
})

describe('ROPA standalone bucket', () => {
  it('base x 0.7, one-time, Year 2 = 0', () => {
    const r = calculatePricing(seedSnapshot, sel(['ROPA_STANDALONE']))
    // base = shared + vm(7000) = 1,708,000 ; x 0.7 = 1,195,600
    expect(r.year1).toBe(1195600)
    expect(r.year2).toBe(0)
    const b = r.breakdown_for_admin_only.buckets[0]
    expect(b.kind).toBe('ropa')
    expect(b.amc).toBe(0)
    expect(b.deployment).toBe(0)
  })
})

describe('Consent Manager bucket', () => {
  it('perpetual: Year 1 = license + impl, Year 2 = license x 30%', () => {
    const r = calculatePricing(withSettings({ cm_model: 'perpetual' }), sel(['CM'], allOnes, 'mid'))
    expect(r.year1).toBe(3000000) // license 3,000,000 + impl 0
    expect(r.year2).toBe(900000) // 30% of 3,000,000
  })

  it('subscription: Year 1 = implementation only, Year 2 = license', () => {
    const r = calculatePricing(withSettings({ cm_model: 'subscription' }), sel(['CM'], allOnes, 'mid'))
    expect(r.year1).toBe(0) // implementation fee (seeded 0)
    expect(r.year2).toBe(3000000) // license recurs from Year 2
  })

  it('subscription surfaces a non-zero implementation fee in Year 1', () => {
    // Override impl to prove Year 1 = impl (not a hardcoded 0).
    const cfg = withSettings({ cm_model: 'subscription' })
    cfg.cm_tiers = cfg.cm_tiers.map((t) =>
      t.tier_key === 'mid' ? { ...t, implementation_fee_inr: 500000 } : t,
    )
    const r = calculatePricing(cfg, sel(['CM'], allOnes, 'mid'))
    expect(r.year1).toBe(500000)
    expect(r.year2).toBe(3000000)
  })
})

describe('multi-bucket and edge cases', () => {
  it('empty selection is 0 / 0', () => {
    const r = calculatePricing(seedSnapshot, sel([]))
    expect(r.year1).toBe(0)
    expect(r.year2).toBe(0)
    expect(r.breakdown_for_admin_only.buckets).toHaveLength(0)
  })

  it('CM + DSPM sums the independent buckets', () => {
    const r = calculatePricing(seedSnapshot, sel(['DSPM', 'CM'], allOnes, 'mid'))
    expect(r.year1).toBe(2227940 + 3000000)
    expect(r.year2).toBe(1919456 + 900000)
  })

  it('is deterministic: same inputs -> identical result', () => {
    const a = calculatePricing(seedSnapshot, sel(['DSPM', 'DATA_FLOW']))
    const b = calculatePricing(seedSnapshot, sel(['DSPM', 'DATA_FLOW']))
    expect(a).toEqual(b)
  })
})

describe('D3: one-time fields drop out of the Year 2 base and generate no amc', () => {
  it('one-time line is in Year 1 only; amc on recurring base', () => {
    const cfg: ConfigSnapshot = {
      fields: [
        { field_key: 'rec', label: 'Recurring item', unit_price_inr: 1000000, frequency: 'recurring', active: true, sort_order: 10 },
        { field_key: 'once', label: 'One-time setup', unit_price_inr: 500000, frequency: 'one_time', active: true, sort_order: 20 },
      ],
      modules: [
        { module_key: 'TEST', label: 'Test', kind: 'composite', deployment_pct: null, amc_pct: null, multiplier: null, applies_multiplier: false, active: true },
      ],
      module_fields: [
        { module_key: 'TEST', field_key: 'rec' },
        { module_key: 'TEST', field_key: 'once' },
      ],
      cm_tiers: [],
      settings: { currency: 'INR', deployment_pct: 0.18, amc_pct: 0.12, y2_includes_deployment: false, cm_model: 'perpetual', rounding: 'half_up' },
    }
    const r = calculatePricing(cfg, { moduleKeys: ['TEST'], quantities: { rec: 1, once: 1 } })
    const b = r.breakdown_for_admin_only.buckets[0]
    expect(b.base_full).toBe(1500000) // includes one-time
    expect(b.base_recurring).toBe(1000000) // excludes one-time
    expect(b.deployment).toBe(270000) // 18% of base_full
    expect(b.amc).toBe(120000) // 12% of recurring base ONLY (not 180,000)
    expect(r.year1).toBe(1890000) // 1,500,000 + 270,000 + 120,000
    expect(r.year2).toBe(1120000) // 1,000,000 + 120,000 — one-time gone, no recurring amc on it
  })
})
