import { describe, expect, it } from 'vitest'
import { price } from '../engine2/engine2'
import { RATE_CARD_SEED } from '../engine2/seed'
import type { DealInputs } from '../engine2/types'
import { scanForBlocklist, toClientSafe, type ProposalRecord } from './clientSafe'

const inputs: DealInputs = {
  deployment_mode: 'onprem',
  dp_base_y1: 2_500_000,
  dp_base_y2: 2_500_000,
  modules: { dspm: false, dam: false, endpoint: false },
  estate_quantities: {},
  tco_years: 3,
  discount_pct: 0,
}

const record: ProposalRecord = {
  id: 'p1',
  customer_name: 'Acme Appliances',
  channel: 'aurva',
  internal_notes: 'via Aurva co-sell, PwC advising client',
  validity_days: 60,
  inputs,
  results: [price(RATE_CARD_SEED, inputs)],
  discount_shown: true,
}

describe('client-safe proposal (D5)', () => {
  it('toClientSafe strips channel and internal notes', () => {
    const safe = toClientSafe(record)
    expect('channel' in safe).toBe(false)
    expect('internal_notes' in safe).toBe(false)
    expect(scanForBlocklist(safe)).toEqual([])
  })

  it('scanForBlocklist catches partner names anywhere in a payload', () => {
    expect(scanForBlocklist({ note: 'routed via Tech Jockey' })).toContain('tech jockey')
    expect(scanForBlocklist(record)).toContain('aurva')
    expect(scanForBlocklist(record)).toContain('pwc')
  })

  it('engine output itself is clean of partner names', () => {
    expect(scanForBlocklist(price(RATE_CARD_SEED, inputs))).toEqual([])
  })
})
