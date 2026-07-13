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
  askedEstateRates,
  buildRecord,
  buildSizingLines,
  defaultInputs,
  defaultPaymentTerms,
  dpBaseY2FromGrowth,
  estateQuestion,
  fractionToPct,
  growthPctFromBases,
  hiddenEstateRatesWithValue,
  HIDDEN_ESTATE_KEYS,
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

describe('askedEstateRates / hiddenEstateRatesWithValue (fewer wizard questions, owner 2026-07-13)', () => {
  it('askedEstateRates drops the retired questions (onprem_connector, sharepoint_site, dam_dataset) even when their module is selected', () => {
    const asked = askedEstateRates(RATES, 'onprem', { dspm: true, dam: true, endpoint: true })
    for (const key of HIDDEN_ESTATE_KEYS) {
      expect(asked.some((r) => r.rate_key === key)).toBe(false)
    }
    // everything else in scope is still asked
    expect(asked.some((r) => r.rate_key === 'database')).toBe(true)
    expect(asked.some((r) => r.rate_key === 'gdrive_user')).toBe(true)
    expect(asked.some((r) => r.rate_key === 'endpoint_device')).toBe(true)
  })

  it('askedEstateRates is otherwise identical to visibleEstateRates minus the hidden keys', () => {
    const modules = { dspm: true, dam: true, endpoint: true }
    const visible = visibleEstateRates(RATES, 'onprem', modules)
    const asked = askedEstateRates(RATES, 'onprem', modules)
    expect(keysOf(asked)).toEqual(
      keysOf(visible.filter((r) => !HIDDEN_ESTATE_KEYS.includes(r.rate_key))),
    )
  })

  it('askedEstateRates: SaaS still asks nothing (CM-only)', () => {
    expect(askedEstateRates(RATES, 'saas', { dspm: true, dam: true, endpoint: true })).toEqual([])
  })

  it('hiddenEstateRatesWithValue: empty when every hidden key is zero', () => {
    const hidden = hiddenEstateRatesWithValue(RATES, 'onprem', { dspm: true, dam: true, endpoint: true }, {})
    expect(hidden).toEqual([])
  })

  it('hiddenEstateRatesWithValue: surfaces a hidden key read-only once it carries a non-zero quantity (imported/earlier data)', () => {
    const modules = { dspm: true, dam: true, endpoint: true }
    const quantities = { onprem_connector: 2, sharepoint_site: 0, dam_dataset: 5 }
    const hidden = hiddenEstateRatesWithValue(RATES, 'onprem', modules, quantities)
    expect(keysOf(hidden)).toEqual(['dam_dataset', 'onprem_connector'])
  })

  it('hiddenEstateRatesWithValue: a hidden key with a non-zero quantity is NOT surfaced when its module is off (not priced, so nothing to protect)', () => {
    const hidden = hiddenEstateRatesWithValue(
      RATES,
      'onprem',
      { dspm: false, dam: false, endpoint: false },
      { onprem_connector: 2, sharepoint_site: 3, dam_dataset: 5 },
    )
    expect(hidden).toEqual([])
  })

  it('gdrive_user question wording merges M365 / Google Workspace (mail, drive, OneDrive, SharePoint)', () => {
    const gdrive = RATES.find((r) => r.rate_key === 'gdrive_user')
    expect(gdrive).toBeDefined()
    const q = estateQuestion(gdrive!)
    expect(q.question).toBe('How many M365 / Google Workspace users? (mail, drive, OneDrive, SharePoint)')
  })
})

describe('buildSizingLines (Sizing Estimate plumbing)', () => {
  const baseInputs: DealInputs = {
    deployment_mode: 'onprem',
    dp_base_y1: 2_500_000,
    dp_base_y2: 2_500_000,
    modules: { dspm: true, dam: false, endpoint: false },
    estate_quantities: { database: 10, cloud_connector: 0, account: 2 },
    tco_years: 3,
    discount_pct: 0,
  }

  it('one line per non-zero quantity of a selected module, at the rate-card unit price', () => {
    const lines = buildSizingLines(RATE_CARD_SEED, baseInputs)
    const database = lines.find((l) => l.label === 'Database')
    const account = lines.find((l) => l.label === 'Account / subscription')
    expect(database).toEqual({ label: 'Database', unit: 'per database', qty: 10, unit_rate_inr: 1_000, annual_inr: 10_000 })
    expect(account).toEqual({
      label: 'Account / subscription',
      unit: 'per account',
      qty: 2,
      unit_rate_inr: 100_000,
      annual_inr: 200_000,
    })
  })

  it('omits zero-quantity rates entirely (cloud_connector was asked but left at 0)', () => {
    const lines = buildSizingLines(RATE_CARD_SEED, baseInputs)
    expect(lines.some((l) => l.label === 'Cloud connector')).toBe(false)
  })

  it('is override-aware: a non-negative estate_rate_overrides entry replaces the rate-card price', () => {
    const overridden: DealInputs = { ...baseInputs, estate_rate_overrides: { database: 1_500 } }
    const lines = buildSizingLines(RATE_CARD_SEED, overridden)
    const database = lines.find((l) => l.label === 'Database')
    expect(database).toEqual({ label: 'Database', unit: 'per database', qty: 10, unit_rate_inr: 1_500, annual_inr: 15_000 })
  })

  it('ignores a negative override and falls back to the rate-card price', () => {
    const overridden: DealInputs = { ...baseInputs, estate_rate_overrides: { database: -1 } }
    const lines = buildSizingLines(RATE_CARD_SEED, overridden)
    expect(lines.find((l) => l.label === 'Database')?.unit_rate_inr).toBe(1_000)
  })

  it('never selected module -> its rates never appear, even with a quantity set', () => {
    const lines = buildSizingLines(RATE_CARD_SEED, {
      ...baseInputs,
      modules: { dspm: true, dam: false, endpoint: false },
      estate_quantities: { ...baseInputs.estate_quantities, endpoint_device: 50 },
    })
    expect(lines.some((l) => l.label === 'Endpoint device')).toBe(false)
  })

  it('SaaS (CM-only) always yields an empty list, regardless of quantities', () => {
    const lines = buildSizingLines(RATE_CARD_SEED, { ...baseInputs, deployment_mode: 'saas' })
    expect(lines).toEqual([])
  })

  it('buildRecord plumbs sizing_lines onto the ProposalRecord from the draft + rate card', () => {
    const draft: ProposalDraft = { ...makeDraft('p1', 'Acme'), inputs: { ...defaultInputs(60), ...baseInputs } }
    const record = buildRecord(draft, RATE_CARD_SEED)
    expect(record.sizing_lines).toEqual(buildSizingLines(RATE_CARD_SEED, baseInputs))
    expect(record.sizing_lines?.length).toBeGreaterThan(0)
  })

  it('buildRecord plumbs usage_rates onto the ProposalRecord from the rate card (item: ₹1/OCR rate missing from proposals)', () => {
    const draft: ProposalDraft = { ...makeDraft('p1', 'Acme'), inputs: { ...defaultInputs(60), ...baseInputs } }
    const record = buildRecord(draft, RATE_CARD_SEED)
    expect(record.usage_rates).toEqual([
      { label: 'OCR processing (scanned / physical consent capture)', unit: 'per document', unit_price_inr: 1 },
    ])
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

describe('growth-% <-> dp_base_y2 (Step2Scope, CM Calculator call with Rohit 2026-07-13)', () => {
  it('dpBaseY2FromGrowth rounds Year-1 base up by a whole-percent growth figure', () => {
    expect(dpBaseY2FromGrowth(500_000, 10)).toBe(550_000)
    expect(dpBaseY2FromGrowth(2_500_000, 20)).toBe(3_000_000)
    expect(dpBaseY2FromGrowth(333_333, 10)).toBe(366_666) // round(366,666.3)
  })

  it('dpBaseY2FromGrowth treats 0% growth as flat', () => {
    expect(dpBaseY2FromGrowth(500_000, 0)).toBe(500_000)
  })

  it('dpBaseY2FromGrowth handles negative growth (de-growth)', () => {
    expect(dpBaseY2FromGrowth(500_000, -10)).toBe(450_000)
  })

  it('growthPctFromBases is the inverse of dpBaseY2FromGrowth for whole-percent inputs', () => {
    expect(growthPctFromBases(500_000, 550_000)).toBe(10)
    expect(growthPctFromBases(2_500_000, 3_000_000)).toBe(20)
  })

  it('growthPctFromBases returns 0 for a zero (or blank) Year-1 base, never NaN/Infinity', () => {
    expect(growthPctFromBases(0, 0)).toBe(0)
    expect(growthPctFromBases(0, 500_000)).toBe(0)
  })

  it('round-trips: growthPctFromBases(y1, dpBaseY2FromGrowth(y1, pct)) recovers a whole-percent pct', () => {
    for (const pct of [0, 5, 10, 25, 50]) {
      const y2 = dpBaseY2FromGrowth(2_500_000, pct)
      expect(growthPctFromBases(2_500_000, y2)).toBe(pct)
    }
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
