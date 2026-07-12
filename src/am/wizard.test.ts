// Pure-logic tests for the AM wizard (no DOM): estate-question visibility,
// BOM inclusion, filename building, discount unit conversion, commercial-copy
// layering, and the localStorage-fallback repo round-trip via a stubbed
// storage object (vitest runs in a node environment — no real localStorage).
import { describe, expect, it } from 'vitest'
import { price } from '../lib/engine2/engine2'
import { RATE_CARD_SEED } from '../lib/engine2/seed'
import type { DealInputs } from '../lib/engine2/types'
import type { ProposalRenderModel } from '../lib/proposal/formats'
import {
  duplicateLocal,
  localStorageKey,
  readLocal,
  removeLocal,
  upsertLocal,
  type ProposalDraft,
  type StorageLike,
} from '../lib/proposal/proposalsRepo'
import {
  applyCommercialCopy,
  applyNarrativeCopy,
  defaultInputs,
  defaultPaymentTerms,
  fractionToPct,
  includeBom,
  pctToFraction,
  proposalFilename,
  totalsFromResult,
  visibleEstateRates,
} from './wizardLogic'

const RATES = RATE_CARD_SEED.estate.rates

const noModules: DealInputs['modules'] = { dspm: false, dam: false, endpoint: false }

function keysOf(rates: { rate_key: string }[]): string[] {
  return rates.map((r) => r.rate_key).sort()
}

describe('visibleEstateRates', () => {
  it('shows nothing on SaaS regardless of module toggles (CM-only)', () => {
    expect(visibleEstateRates(RATES, 'saas', { dspm: true, dam: true, endpoint: true })).toEqual([])
  })

  it('shows nothing when no module is selected', () => {
    expect(visibleEstateRates(RATES, 'onprem', noModules)).toEqual([])
  })

  it('DSPM only: shared bucket + DSPM-specific rates', () => {
    const visible = visibleEstateRates(RATES, 'onprem', { ...noModules, dspm: true })
    expect(keysOf(visible)).toEqual(
      keysOf(RATES.filter((r) => r.bucket === 'shared' || r.bucket === 'dspm')),
    )
  })

  it('DAM only: shared bucket + DAM-specific rates', () => {
    const visible = visibleEstateRates(RATES, 'hybrid', { ...noModules, dam: true })
    expect(keysOf(visible)).toEqual(
      keysOf(RATES.filter((r) => r.bucket === 'shared' || r.bucket === 'dam')),
    )
  })

  it('Endpoint only: endpoint rates, NO shared bucket', () => {
    const visible = visibleEstateRates(RATES, 'onprem', { ...noModules, endpoint: true })
    expect(visible.every((r) => r.bucket === 'endpoint')).toBe(true)
    expect(visible.length).toBeGreaterThan(0)
  })

  it('all modules on: every rate is visible exactly once', () => {
    const visible = visibleEstateRates(RATES, 'onprem', { dspm: true, dam: true, endpoint: true })
    expect(keysOf(visible)).toEqual(keysOf(RATES))
  })
})

describe('includeBom', () => {
  it('onprem: always yes', () => {
    expect(includeBom('onprem', noModules)).toBe(true)
    expect(includeBom('onprem', { dspm: true, dam: true, endpoint: true })).toBe(true)
  })

  it('hybrid: only with at least one estate module', () => {
    expect(includeBom('hybrid', noModules)).toBe(false)
    expect(includeBom('hybrid', { ...noModules, dspm: true })).toBe(true)
    expect(includeBom('hybrid', { ...noModules, dam: true })).toBe(true)
    expect(includeBom('hybrid', { ...noModules, endpoint: true })).toBe(true)
  })

  it('saas: never, even with modules toggled on', () => {
    expect(includeBom('saas', { dspm: true, dam: true, endpoint: true })).toBe(false)
  })
})

describe('proposalFilename', () => {
  it('builds <customer>_Perfios_DPDP_Proposal.xlsx with underscored spaces', () => {
    expect(proposalFilename('Acme Bank')).toBe('Acme_Bank_Perfios_DPDP_Proposal.xlsx')
  })

  it('strips filesystem-hostile characters', () => {
    expect(proposalFilename('A/B:C*D?E"F<G>H|I\\J')).toBe('ABCDEFGHIJ_Perfios_DPDP_Proposal.xlsx')
  })

  it('falls back to Client for an empty name', () => {
    expect(proposalFilename('   ')).toBe('Client_Perfios_DPDP_Proposal.xlsx')
  })
})

describe('discount unit conversion', () => {
  it('pctToFraction clamps to 0..100 and divides by 100', () => {
    expect(pctToFraction(15)).toBe(0.15)
    expect(pctToFraction(-5)).toBe(0)
    expect(pctToFraction(250)).toBe(1)
    expect(pctToFraction(Number.NaN)).toBe(0)
  })

  it('fractionToPct round-trips clean values', () => {
    expect(fractionToPct(0.15)).toBe(15)
    expect(fractionToPct(pctToFraction(12.5))).toBe(12.5)
  })
})

describe('applyCommercialCopy', () => {
  const model: ProposalRenderModel = {
    title: 'Commercial Proposal',
    subtitle: 'Prepared for Acme',
    sections: [
      { heading: '1. What You Get', bullets: ['module 1'] },
      { heading: '5. Payment Terms', bullets: ['old terms'] },
    ],
  }

  it('replaces Payment Terms bullets with the edited lines', () => {
    const out = applyCommercialCopy(model, 'Net 30.\nTaxes extra.', '')
    const pay = out.sections.find((s) => /payment terms/i.test(s.heading))
    expect(pay?.bullets).toEqual(['Net 30.', 'Taxes extra.'])
    expect(out.sections[0].bullets).toEqual(['module 1']) // others untouched
  })

  it('keeps existing bullets when the textarea is blank', () => {
    const out = applyCommercialCopy(model, '   \n  ', '')
    const pay = out.sections.find((s) => /payment terms/i.test(s.heading))
    expect(pay?.bullets).toEqual(['old terms'])
  })

  it('appends a Special Terms section only when non-empty', () => {
    expect(applyCommercialCopy(model, '', '').sections.some((s) => s.heading === 'Special Terms')).toBe(false)
    const out = applyCommercialCopy(model, '', 'Pilot credit applies.\nSLA per MSA.')
    const special = out.sections.find((s) => s.heading === 'Special Terms')
    expect(special?.bullets).toEqual(['Pilot credit applies.', 'SLA per MSA.'])
  })

  it('does not mutate the input model', () => {
    applyCommercialCopy(model, 'New terms.', 'Special.')
    expect(model.sections).toHaveLength(2)
    expect(model.sections[1].bullets).toEqual(['old terms'])
  })
})

describe('applyNarrativeCopy', () => {
  const narrativeModel: ProposalRenderModel = {
    title: 'Commercial Proposal',
    subtitle: 'Prepared for Acme',
    sections: [
      { heading: 'Executive Summary', paragraphs: ['generated exec summary'] },
      { heading: 'Solution Overview', paragraphs: ['generated solution overview'] },
      { heading: '1. What You Get', bullets: ['module 1'] },
    ],
  }

  it('replaces Executive Summary and Solution Overview when overrides are non-blank', () => {
    const out = applyNarrativeCopy(narrativeModel, {
      executive_summary: 'AM-written summary.',
      solution_overview: 'AM-written overview.',
    })
    expect(out.sections[0].paragraphs).toEqual(['AM-written summary.'])
    expect(out.sections[1].paragraphs).toEqual(['AM-written overview.'])
    expect(out.sections[2].bullets).toEqual(['module 1']) // untouched
  })

  it('keeps the generated copy when overrides are blank or omitted', () => {
    const out = applyNarrativeCopy(narrativeModel, { executive_summary: '   ', solution_overview: '' })
    expect(out.sections[0].paragraphs).toEqual(['generated exec summary'])
    expect(out.sections[1].paragraphs).toEqual(['generated solution overview'])
  })

  it('only replaces the section it has an override for', () => {
    const out = applyNarrativeCopy(narrativeModel, { executive_summary: 'Only exec changed.' })
    expect(out.sections[0].paragraphs).toEqual(['Only exec changed.'])
    expect(out.sections[1].paragraphs).toEqual(['generated solution overview'])
  })

  it('does not mutate the input model', () => {
    applyNarrativeCopy(narrativeModel, { executive_summary: 'New.', solution_overview: 'New.' })
    expect(narrativeModel.sections[0].paragraphs).toEqual(['generated exec summary'])
  })
})

describe('totalsFromResult', () => {
  it('snapshots the engine totals for the list view', () => {
    const inputs: DealInputs = {
      deployment_mode: 'onprem',
      dp_base_y1: 2_500_000,
      dp_base_y2: 2_500_000,
      modules: { dspm: false, dam: false, endpoint: false },
      estate_quantities: {},
      tco_years: 3,
      discount_pct: 0,
    }
    const result = price(RATE_CARD_SEED, inputs)
    const totals = totalsFromResult(result)
    expect(totals.tco_years).toBe(3)
    expect(totals.total_year1_inr).toBe(result.total_year1_inr)
    expect(totals.total_tco_inr).toBe(result.total_tco_inr)
    expect(totals.net_total_tco_inr).toBe(result.net_total_tco_inr)
  })
})

// ---------------------------------------------------------------------------
// localStorage-fallback repo round-trip with a stubbed storage object.
// ---------------------------------------------------------------------------

function stubStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

function makeDraft(id: string, customer: string): ProposalDraft {
  return {
    id,
    instance_id: 'inst-1',
    customer_name: customer,
    channel: 'direct',
    internal_notes: '',
    validity_days: 60,
    inputs: defaultInputs(60),
    rate_card_version: 1,
    totals: totalsFromResult(
      price(RATE_CARD_SEED, {
        deployment_mode: 'onprem',
        dp_base_y1: 100,
        dp_base_y2: 100,
        modules: { dspm: false, dam: false, endpoint: false },
        estate_quantities: {},
        tco_years: 3,
        discount_pct: 0,
      }),
    ),
    discount_shown: true,
  }
}

describe('local fallback repo', () => {
  it('round-trips a saved proposal through the stubbed storage', () => {
    const store = stubStorage()
    const saved = upsertLocal(store, makeDraft('p1', 'Acme'), '2026-07-12T00:00:00.000Z')
    expect(saved.created_at).toBe('2026-07-12T00:00:00.000Z')
    expect(store.data.has(localStorageKey('inst-1'))).toBe(true)

    const rows = readLocal(store, 'inst-1')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(saved)
  })

  it('update keeps created_at, bumps updated_at, and does not duplicate', () => {
    const store = stubStorage()
    upsertLocal(store, makeDraft('p1', 'Acme'), '2026-07-12T00:00:00.000Z')
    const updated = upsertLocal(store, makeDraft('p1', 'Acme Renamed'), '2026-07-13T00:00:00.000Z')
    expect(updated.created_at).toBe('2026-07-12T00:00:00.000Z')
    expect(updated.updated_at).toBe('2026-07-13T00:00:00.000Z')

    const rows = readLocal(store, 'inst-1')
    expect(rows).toHaveLength(1)
    expect(rows[0].customer_name).toBe('Acme Renamed')
  })

  it('duplicateLocal copies under a new id with "(copy)" suffix', () => {
    const store = stubStorage()
    upsertLocal(store, makeDraft('p1', 'Acme'), '2026-07-12T00:00:00.000Z')
    const copy = duplicateLocal(store, 'inst-1', 'p1', 'p2', '2026-07-14T00:00:00.000Z')
    expect(copy?.id).toBe('p2')
    expect(copy?.customer_name).toBe('Acme (copy)')
    expect(copy?.created_at).toBe('2026-07-14T00:00:00.000Z')
    expect(readLocal(store, 'inst-1')).toHaveLength(2)
  })

  it('duplicateLocal returns null for an unknown id', () => {
    const store = stubStorage()
    expect(duplicateLocal(store, 'inst-1', 'nope', 'p2')).toBeNull()
  })

  it('removeLocal deletes only the targeted row', () => {
    const store = stubStorage()
    upsertLocal(store, makeDraft('p1', 'Acme'), '2026-07-12T00:00:00.000Z')
    upsertLocal(store, makeDraft('p2', 'Beta'), '2026-07-12T00:00:00.000Z')
    removeLocal(store, 'inst-1', 'p1')
    const rows = readLocal(store, 'inst-1')
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('p2')
  })

  it('readLocal tolerates corrupt or missing payloads', () => {
    const store = stubStorage()
    expect(readLocal(store, 'inst-1')).toEqual([])
    store.setItem(localStorageKey('inst-1'), 'not json {')
    expect(readLocal(store, 'inst-1')).toEqual([])
    store.setItem(localStorageKey('inst-1'), '{"an":"object"}')
    expect(readLocal(store, 'inst-1')).toEqual([])
  })
})

describe('defaults', () => {
  it('defaultPaymentTerms carries the three standard bullets with the validity', () => {
    const lines = defaultPaymentTerms(60).split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatch(/Year 1: 50 percent on order/)
    expect(lines[1]).toMatch(/One-time charges billed once/)
    expect(lines[2]).toMatch(/Validity 60 days/)
  })

  it('defaultInputs starts on-prem, 3-yr TCO, no discount, no modules', () => {
    const d = defaultInputs(60)
    expect(d.deployment_mode).toBe('onprem')
    expect(d.tco_years).toBe(3)
    expect(d.discount_pct).toBe(0)
    expect(d.compare_all_modes).toBe(false)
    expect(d.modules).toEqual({ dspm: false, dam: false, endpoint: false })
  })
})
