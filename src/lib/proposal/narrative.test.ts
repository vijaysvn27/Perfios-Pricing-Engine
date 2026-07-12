// Pure tests for the template narrative (item 4 of the revamp): scope-aware
// copy so an AM starts from a filled-in document instead of a blank page.
import { describe, expect, it } from 'vitest'
import { price } from '../engine2/engine2'
import { RATE_CARD_SEED } from '../engine2/seed'
import type { DealInputs } from '../engine2/types'
import { CLIENT_BLOCKLIST, scanForBlocklist } from './clientSafe'
import type { ClientSafeProposal } from './clientSafe'
import { buildNarrative, narrativeSections } from './narrative'

const onpremInputs: DealInputs = {
  deployment_mode: 'onprem',
  dp_base_y1: 2_500_000,
  dp_base_y2: 2_500_000,
  modules: { dspm: false, dam: false, endpoint: false },
  estate_quantities: {},
  tco_years: 3,
  discount_pct: 0,
}

const saasInputs: DealInputs = {
  ...onpremInputs,
  deployment_mode: 'saas',
}

const withDspm: DealInputs = {
  ...onpremInputs,
  modules: { dspm: true, dam: false, endpoint: false },
  estate_quantities: { database: 50, cloud_connector: 4 },
}

function clientSafe(customer: string, inputs: DealInputs): ClientSafeProposal {
  return {
    customer_name: customer,
    validity_days: 60,
    inputs,
    results: [price(RATE_CARD_SEED, inputs)],
    discount_shown: true,
  }
}

describe('buildNarrative', () => {
  it('names the customer in the executive summary', () => {
    const n = buildNarrative(clientSafe('Acme Appliances', onpremInputs))
    expect(n.executive_summary).toContain('Acme Appliances')
  })

  it('on-prem and SaaS copy differ in hosting framing', () => {
    const onprem = buildNarrative(clientSafe('Acme', onpremInputs))
    const saas = buildNarrative(clientSafe('Acme', saasInputs))
    expect(onprem.executive_summary).toMatch(/hosted fully within your environment/)
    expect(saas.executive_summary).not.toMatch(/hosted fully within your environment/)
    expect(saas.executive_summary).toMatch(/hosted and managed by Perfios/)
    expect(onprem.executive_summary).not.toBe(saas.executive_summary)
  })

  it('selected modules appear in the solution overview; unselected ones do not', () => {
    const n = buildNarrative(clientSafe('Acme', withDspm))
    expect(n.solution_overview).toMatch(/DSPM/)
    expect(n.solution_overview).not.toMatch(/\bDAM\b/)
    expect(n.solution_overview).not.toMatch(/Endpoint Discovery/)
  })

  it('SaaS mode never mentions estate modules, even if inputs.modules is (harmlessly) set', () => {
    const saasWithModules: DealInputs = { ...saasInputs, modules: { dspm: true, dam: true, endpoint: true } }
    const n = buildNarrative(clientSafe('Acme', saasWithModules))
    expect(n.solution_overview).not.toMatch(/DSPM/)
    expect(n.executive_summary).not.toMatch(/DSPM/)
  })

  it('the DP base scale appears in lakh form', () => {
    const n = buildNarrative(clientSafe('Acme', onpremInputs)) // 2,500,000 -> 25-lakh
    expect(n.executive_summary).toMatch(/25-lakh/)
  })

  it('why_perfios has 4-5 differentiator bullets covering the required themes', () => {
    const n = buildNarrative(clientSafe('Acme', onpremInputs))
    expect(n.why_perfios.length).toBeGreaterThanOrEqual(4)
    expect(n.why_perfios.length).toBeLessThanOrEqual(5)
    const text = n.why_perfios.join(' ')
    expect(text).toMatch(/22\b.*languages|languages.*22/i)
    expect(text).toMatch(/unlimited consents/i)
    expect(text).toMatch(/seven|7 (consent manager )?modules/i)
    expect(text).toMatch(/audit trail/i)
    expect(text).toMatch(/RPO.*15/i)
  })

  it('is a pure function: same input yields the same output', () => {
    const a = buildNarrative(clientSafe('Acme', withDspm))
    const b = buildNarrative(clientSafe('Acme', withDspm))
    expect(a).toEqual(b)
  })

  it('contains no blocklisted partner names, for any scope', () => {
    for (const inputs of [onpremInputs, saasInputs, withDspm]) {
      const n = buildNarrative(clientSafe('Acme', inputs))
      const text = JSON.stringify(n).toLowerCase()
      const offenders = CLIENT_BLOCKLIST.filter((term) => text.includes(term))
      expect(offenders).toEqual([])
    }
  })
})

describe('narrativeSections', () => {
  it('returns Executive Summary, Solution Overview, and Why Perfios sections in order', () => {
    const sections = narrativeSections(clientSafe('Acme', onpremInputs))
    expect(sections.map((s) => s.heading)).toEqual(['Executive Summary', 'Solution Overview', 'Why Perfios'])
    expect(sections[0].paragraphs).toHaveLength(1)
    expect(sections[1].paragraphs).toHaveLength(1)
    expect(sections[2].bullets?.length).toBeGreaterThanOrEqual(4)
  })

  it('passes the blocklist scan', () => {
    const sections = narrativeSections(clientSafe('Acme', withDspm))
    expect(scanForBlocklist(sections)).toEqual([])
  })
})
