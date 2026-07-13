import { describe, expect, it } from 'vitest'
import { RATE_CARD_SEED } from '../engine2/seed'
import { validateRateCard } from './validate'
import { isMissingTable, nextVersionAfter, normalizeRateCard } from './repo'

// These cover only the pure, separable logic in repo.ts. The read/write paths
// (loadPublishedRateCard, loadDraft, saveDraft, publishDraft, listVersions,
// rollback) all call the live Supabase client and are intentionally left
// untested here — no live connection in this environment.

describe('nextVersionAfter', () => {
  it('returns 1 when nothing has been published', () => {
    expect(nextVersionAfter(undefined)).toBe(1)
    expect(nextVersionAfter(null)).toBe(1)
  })

  it('increments the current max published version', () => {
    expect(nextVersionAfter(0)).toBe(1)
    expect(nextVersionAfter(5)).toBe(6)
  })
})

describe('isMissingTable', () => {
  it('is false for a null error', () => {
    expect(isMissingTable(null)).toBe(false)
  })

  it('recognizes the Postgres "relation does not exist" code', () => {
    expect(isMissingTable({ code: '42P01', message: 'relation "rate_cards" does not exist' })).toBe(true)
  })

  it('recognizes the PostgREST schema-cache-miss code', () => {
    expect(isMissingTable({ code: 'PGRST205', message: "Could not find the table 'public.rate_cards'" })).toBe(true)
  })

  it('recognizes PGRST205 embedded in the message even without a matching code', () => {
    expect(isMissingTable({ code: undefined, message: 'PGRST205: schema cache miss' })).toBe(true)
  })

  it('is false for unrelated errors', () => {
    expect(isMissingTable({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false)
    expect(isMissingTable({ code: undefined, message: 'network error' })).toBe(false)
  })
})

describe('normalizeRateCard (old-shape Supabase snapshots must never crash the app)', () => {
  // Regression: a snapshot published before usage_rates / included_dp existed
  // caused "Cannot read properties of undefined (reading 'forEach')" on the
  // Admin tab (prod, 2026-07-13). Simulate that old shape.
  function oldShapeSnapshot(): unknown {
    const clone = JSON.parse(JSON.stringify(RATE_CARD_SEED)) as Record<string, unknown>
    delete clone.usage_rates
    const saas = clone.saas_cm as { tiers: Record<string, unknown>[] }
    for (const t of saas.tiers) delete t.included_dp
    return clone
  }

  it('fills usage_rates and per-tier included_dp from the seed', () => {
    const card = normalizeRateCard(oldShapeSnapshot())
    expect(card.usage_rates).toEqual(RATE_CARD_SEED.usage_rates)
    expect(card.saas_cm.tiers.map((t) => t.included_dp)).toEqual(
      RATE_CARD_SEED.saas_cm.tiers.map((t) => t.included_dp),
    )
  })

  it('produces a card that validates clean and preserves edited values', () => {
    const old = oldShapeSnapshot() as { saas_cm: { tiers: { infra_usd_mo_saas_v3: number }[] } }
    old.saas_cm.tiers[0].infra_usd_mo_saas_v3 = 700 // an admin-edited value must survive
    const card = normalizeRateCard(old)
    expect(validateRateCard(card)).toEqual([])
    expect(card.saas_cm.tiers[0].infra_usd_mo_saas_v3).toBe(700)
  })

  it('defaults included_dp to 60% of cap for a tier_key unknown to the seed', () => {
    const old = oldShapeSnapshot() as { saas_cm: { tiers: Record<string, unknown>[] } }
    old.saas_cm.tiers[0].tier_key = 'custom_tier'
    const card = normalizeRateCard(old)
    expect(card.saas_cm.tiers[0].included_dp).toBe(Math.round((card.saas_cm.tiers[0].user_cap * 0.6)))
  })

  it('handles null/garbage input by returning a seed-shaped card', () => {
    expect(validateRateCard(normalizeRateCard(null))).toEqual([])
    expect(validateRateCard(normalizeRateCard({}))).toEqual([])
  })
})
