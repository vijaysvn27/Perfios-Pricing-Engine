import { describe, expect, it } from 'vitest'
import { isMissingTable, nextVersionAfter } from './repo'

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
