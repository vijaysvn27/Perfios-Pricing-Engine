import { describe, expect, it } from 'vitest'
import { price, priceAllModes } from '../../engine2/engine2'
import { RATE_CARD_SEED } from '../../engine2/seed'
import type { DealInputs } from '../../engine2/types'
import type { ClientSafeProposal } from '../clientSafe'
import { scanForBlocklist } from '../clientSafe'
import { buildWorkbook } from '../excelExport'
import { buildFormat } from './index'
import type { ProposalRenderModel } from './types'

// Fixed as-of date threaded into every buildFormat call in this file, so the
// cover's date label / reference are deterministic and assertable — the
// pure format builders never call Date.now() themselves (item 3).
const FIXED_DATE = '2026-07-12'

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
  dp_base_y2: 3_000_000, // triggers the overage trace step
}

const compareInputs: DealInputs = {
  ...onpremInputs,
  modules: { dspm: true, dam: false, endpoint: false },
  estate_quantities: { database: 10, cloud_connector: 1, account: 1, gdrive_user: 100, vm: 5 },
}

function clientSafe(inputs: DealInputs, opts: { discount_shown?: boolean } = {}): ClientSafeProposal {
  return {
    customer_name: 'Acme Appliances',
    validity_days: 60,
    inputs,
    results: [price(RATE_CARD_SEED, inputs)],
    discount_shown: opts.discount_shown ?? true,
  }
}

function compareClientSafe(inputs: DealInputs, opts: { discount_shown?: boolean } = {}): ClientSafeProposal {
  const all = priceAllModes(RATE_CARD_SEED, inputs)
  return {
    customer_name: 'Acme Appliances',
    validity_days: 60,
    inputs,
    results: [all.onprem, all.hybrid, all.saas],
    discount_shown: opts.discount_shown ?? true,
  }
}

function tableFromModel(model: ProposalRenderModel, headingPredicate: (h: string) => boolean) {
  const section = model.sections.find((s) => headingPredicate(s.heading))
  if (!section?.table) throw new Error('expected a section with a table')
  return section.table
}

function sectionBullets(model: ProposalRenderModel, headingPredicate: (h: string) => boolean): string[] {
  const section = model.sections.find((s) => headingPredicate(s.heading))
  return section?.bullets ?? []
}

describe('cover (item 3: branding)', () => {
  it('every format emits a cover with the logo flag, customer, validity, and a deterministic reference', () => {
    for (const kind of ['module_wise', 'saas_style', 'perfios'] as const) {
      const model = buildFormat(kind, clientSafe(onpremInputs), FIXED_DATE)
      expect(model.cover).toBeDefined()
      expect(model.cover?.logo).toBe(true)
      expect(model.cover?.customer).toBe('Acme Appliances')
      expect(model.cover?.validity_days).toBe(60)
      expect(model.cover?.date_label).toBe(FIXED_DATE)
      expect(model.cover?.reference).toBe('PER/DPDP/2026/AA')
    }
  })

  it('the reference is deterministic: same customer + date always yields the same code', () => {
    const a = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    const b = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    expect(a.cover?.reference).toBe(b.cover?.reference)
  })

  it('a different customer name yields a different reference', () => {
    const other: ClientSafeProposal = { ...clientSafe(onpremInputs), customer_name: 'Beta Bank' }
    const model = buildFormat('perfios', other, FIXED_DATE)
    expect(model.cover?.reference).toBe('PER/DPDP/2026/BB')
  })
})

describe('template narrative (item 4): every format leads with it', () => {
  it('has Executive Summary, Solution Overview, and Why Perfios as the first three sections', () => {
    for (const kind of ['module_wise', 'saas_style', 'perfios'] as const) {
      const model = buildFormat(kind, clientSafe(onpremInputs), FIXED_DATE)
      expect(model.sections.slice(0, 3).map((s) => s.heading)).toEqual([
        'Executive Summary',
        'Solution Overview',
        'Why Perfios',
      ])
    }
  })

  it('the executive summary names the customer', () => {
    const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    expect(model.sections[0].paragraphs?.[0]).toContain('Acme Appliances')
  })

  it('Why Perfios has 4-5 differentiator bullets', () => {
    const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    const bullets = model.sections[2].bullets ?? []
    expect(bullets.length).toBeGreaterThanOrEqual(4)
    expect(bullets.length).toBeLessThanOrEqual(5)
  })
})

describe('inclusions & exclusions (item 2)', () => {
  it('every format has an "Inclusions & Exclusions" section (numbered or plain)', () => {
    for (const kind of ['module_wise', 'saas_style', 'perfios'] as const) {
      const model = buildFormat(kind, clientSafe(onpremInputs), FIXED_DATE)
      expect(model.sections.some((s) => /inclusions & exclusions/i.test(s.heading))).toBe(true)
    }
  })

  it('names unselected modules explicitly under exclusions (on-prem, nothing selected)', () => {
    const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    const bullets = sectionBullets(model, (h) => /inclusions & exclusions/i.test(h))
    expect(bullets).toContain('DSPM — not in current scope; available as an add-on.')
    expect(bullets).toContain('DAM — not in current scope; available as an add-on.')
    expect(bullets).toContain('Endpoint Discovery / DLP — not in current scope; available as an add-on.')
  })

  it('a selected module is described with its quantities under inclusions, and dropped from exclusions', () => {
    const model = buildFormat('perfios', compareClientSafe(compareInputs), FIXED_DATE)
    const bullets = sectionBullets(model, (h) => /inclusions & exclusions/i.test(h))
    expect(bullets.some((b) => b.startsWith('DSPM') && b.includes('10 databases'))).toBe(true)
    expect(bullets).not.toContain('DSPM — not in current scope; available as an add-on.')
    expect(bullets).toContain('DAM — not in current scope; available as an add-on.')
  })

  it('SaaS mode excludes every estate module regardless of toggles', () => {
    const model = buildFormat('perfios', clientSafe(saasInputs), FIXED_DATE)
    const bullets = sectionBullets(model, (h) => /inclusions & exclusions/i.test(h))
    expect(bullets).toContain('DSPM — not in current scope; available as an add-on.')
    expect(bullets).toContain('DAM — not in current scope; available as an add-on.')
  })

  it('always carries the standard inclusions and exclusions', () => {
    const model = buildFormat('module_wise', clientSafe(onpremInputs), FIXED_DATE)
    const bullets = sectionBullets(model, (h) => /inclusions & exclusions/i.test(h))
    expect(bullets.some((b) => /^Support/.test(b))).toBe(true)
    expect(bullets).toContain('Applicable taxes.')
  })
})

describe('perfiosFormat (single mode)', () => {
  const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)

  it('has the narrative leading sections followed by the 6 numbered sections', () => {
    expect(model.sections.map((s) => s.heading)).toEqual([
      'Executive Summary',
      'Solution Overview',
      'Why Perfios',
      '1. What You Get — Consent Manager (7 modules)',
      '2. Commercial Summary (INR, exclusive of taxes)',
      '3. Inclusions & Exclusions',
      '4. Scope & Coverage',
      '5. What Drives Your Price',
      '6. Payment Terms',
    ])
  })

  it('section "What You Get" lists all 7 CM modules plus the closing line', () => {
    const bullets = sectionBullets(model, (h) => h.includes('What You Get — Consent Manager'))
    expect(bullets).toHaveLength(8)
    expect(bullets[0]).toContain('Consent Notice & Templates')
    expect(bullets[6]).toContain('Data Privacy Risk Assessment (DPIA)')
    expect(bullets[7]).toBe('Unlimited consents and actions per data principal.')
  })

  it('scope table marks DSPM/DAM/Endpoint Excluded (not selected) and infra Client-provided (on-prem)', () => {
    const scope = tableFromModel(model, (h) => h === '4. Scope & Coverage')
    expect(scope.rows).toContainEqual(['Consent Manager', 'Included'])
    expect(scope.rows).toContainEqual(['DSPM', 'Excluded'])
    expect(scope.rows).toContainEqual(['Infrastructure / hosting', 'Client-provided'])
    expect(scope.rows).toContainEqual(['Custom connectors', 'Excluded'])
    expect(scope.rows).toContainEqual(['Applicable taxes', 'Excluded'])
  })

  it('"What Drives Your Price" uses the on-prem price-driver copy', () => {
    const section = model.sections.find((s) => s.heading === '5. What Drives Your Price')
    expect(section?.paragraphs?.[0]).toMatch(/no hosting charge from us/)
  })

  it('"Payment Terms" includes the validity days', () => {
    const bullets = sectionBullets(model, (h) => h === '6. Payment Terms')
    expect(bullets.some((b) => b.includes('Validity 60 days'))).toBe(true)
  })

  it('SaaS mode scope table marks estate modules "Not available (SaaS is CM-only)" and infra Perfios-hosted', () => {
    const saasModel = buildFormat('perfios', clientSafe(saasInputs), FIXED_DATE)
    const scope = tableFromModel(saasModel, (h) => h === '4. Scope & Coverage')
    expect(scope.rows).toContainEqual(['DSPM', 'Not available (SaaS is CM-only)'])
    expect(scope.rows).toContainEqual(['Infrastructure / hosting', 'Perfios-hosted'])
    const driver = saasModel.sections.find((s) => s.heading === '5. What Drives Your Price')
    expect(driver?.paragraphs?.[0]).toMatch(/Perfios hosts the platform/)
  })
})

describe('moduleWise', () => {
  it('TOTAL row equals engine totals (no discount)', () => {
    const result = price(RATE_CARD_SEED, onpremInputs)
    const model = buildFormat('module_wise', clientSafe(onpremInputs, { discount_shown: false }), FIXED_DATE)
    const table = tableFromModel(model, (h) => h === 'Commercial Summary — Module-wise')
    const totalRow = table.rows.find((r) => r[0] === 'TOTAL')
    expect(totalRow).toBeDefined()
    expect(totalRow).toEqual(['TOTAL', ...result.total_years_inr, result.total_tco_inr])
  })

  it('only included component lines appear — DSPM/DAM never render when unselected (dynamic only)', () => {
    const model = buildFormat('module_wise', clientSafe(onpremInputs), FIXED_DATE)
    const table = tableFromModel(model, (h) => h === 'Commercial Summary — Module-wise')
    const labels = table.rows.map((r) => r[0])
    expect(labels).toContain('Consent Manager (7 modules)')
    expect(labels).not.toContain('DSPM')
    expect(labels).not.toContain('DAM')
    expect(labels).not.toContain('Endpoint Discovery / DLP')
  })

  it('a selected module DOES render its line', () => {
    const model = buildFormat('module_wise', clientSafe(compareInputs), FIXED_DATE)
    const table = tableFromModel(model, (h) => h === 'Commercial Summary — Module-wise')
    const labels = table.rows.map((r) => r[0])
    expect(labels).toContain('DSPM')
  })

  it('includes the one-time-vs-recurring note', () => {
    const result = price(RATE_CARD_SEED, onpremInputs)
    const model = buildFormat('module_wise', clientSafe(onpremInputs), FIXED_DATE)
    const section = model.sections.find((s) => s.heading === 'Commercial Summary — Module-wise')
    const note = section?.paragraphs?.[0] ?? ''
    expect(note).toContain('one-time')
    expect(note).toContain('recurs annually')
    expect(note).toMatch(new RegExp(result.total_one_time_inr.toLocaleString('en-IN')))
  })
})

describe('saasStyle', () => {
  it('shows platform-fee subscription framing', () => {
    const model = buildFormat('saas_style', clientSafe(saasInputs), FIXED_DATE)
    expect(model.title).toBe('Your Subscription')
    const subscription = model.sections.find((s) => s.heading === 'Your Subscription')
    const text = (subscription?.paragraphs ?? []).join(' ')
    expect(text).toMatch(/Platform fee: ₹/)
    expect(text).toMatch(/Implementation \(one-time\): ₹/)
    expect(text).toMatch(/Committed base: 25,00,000/)
  })

  it('pulls the overage rate from the trace when available', () => {
    const model = buildFormat('saas_style', clientSafe(saasInputs), FIXED_DATE)
    const subscription = model.sections.find((s) => s.heading === 'Your Subscription')
    const text = (subscription?.paragraphs ?? []).join(' ')
    expect(text).toMatch(/₹3\/user/) // 25L tier overage rate from RATE_CARD_SEED
  })

  it("lists What's Included with the 7 CM modules", () => {
    const model = buildFormat('saas_style', clientSafe(saasInputs), FIXED_DATE)
    const included = model.sections.find((s) => s.heading === "What's Included")
    expect(included?.bullets).toHaveLength(8)
  })

  it('annual cost table has no TCO column', () => {
    const model = buildFormat('saas_style', clientSafe(saasInputs), FIXED_DATE)
    const table = tableFromModel(model, (h) => /Annual Cost/.test(h))
    expect(table.columns.some((c) => /TCO/.test(c))).toBe(false)
  })

  it('SaaS is CM-only: no DSPM/DAM/Endpoint line ever renders', () => {
    const model = buildFormat('saas_style', clientSafe(saasInputs), FIXED_DATE)
    const table = tableFromModel(model, (h) => /Annual Cost/.test(h))
    const labels = table.rows.map((r) => r[0])
    expect(labels).not.toContain('DSPM')
  })
})

describe('perfios compare mode (3 priced modes)', () => {
  const model = buildFormat('perfios', compareClientSafe(compareInputs), FIXED_DATE)

  it('renders narrative + "What You Get (all options)" + "Your Options" + "Inclusions & Exclusions"', () => {
    expect(model.sections.map((s) => s.heading)).toEqual([
      'Executive Summary',
      'Solution Overview',
      'Why Perfios',
      'What You Get (all options)',
      'Your Options',
      'Inclusions & Exclusions',
    ])
    const table = tableFromModel(model, (h) => h === 'Your Options')
    expect(table.columns).toEqual(['Line Item', 'Option A: On-Prem', 'Option B: Hybrid', 'Option C: SaaS'])
  })

  it('marks SaaS estate rows "Not available" while on-prem/hybrid show real figures, for the selected module', () => {
    const table = tableFromModel(model, (h) => h === 'Your Options')
    const dspmRow = table.rows.find((r) => r[0] === 'DSPM Year1')
    expect(dspmRow).toBeDefined()
    expect(dspmRow?.[1]).toEqual(expect.any(Number)) // on-prem
    expect(dspmRow?.[2]).toEqual(expect.any(Number)) // hybrid
    expect(dspmRow?.[3]).toBe('Not available') // SaaS is CM-only
  })

  it('dynamic only: DAM/Endpoint rows do not exist at all — compareInputs never selected them', () => {
    const table = tableFromModel(model, (h) => h === 'Your Options')
    const labels = table.rows.map((r) => r[0])
    expect(labels).not.toContain('DAM Year1')
    expect(labels).not.toContain('DAM Annual')
    expect(labels).not.toContain('Endpoint Year1')
    expect(labels).not.toContain('Endpoint Annual')
  })

  it('includes Total Year 1 / Total Annual / N-Year TCO rows summing to the engine totals', () => {
    const all = priceAllModes(RATE_CARD_SEED, compareInputs)
    const table = tableFromModel(model, (h) => h === 'Your Options')
    expect(table.rows).toContainEqual([
      'Total Year 1',
      all.onprem.total_year1_inr,
      all.hybrid.total_year1_inr,
      all.saas.total_year1_inr,
    ])
    expect(table.rows).toContainEqual([
      '3-Year TCO',
      all.onprem.total_tco_inr,
      all.hybrid.total_tco_inr,
      all.saas.total_tco_inr,
    ])
  })
})

describe('discount handling (D4, all formats)', () => {
  const discountedInputs: DealInputs = { ...onpremInputs, discount_pct: 0.1 }

  it('shown: List/Discount/Net rows appear and Discount string is present', () => {
    for (const kind of ['module_wise', 'saas_style', 'perfios'] as const) {
      const model = buildFormat(kind, clientSafe(discountedInputs, { discount_shown: true }), FIXED_DATE)
      expect(JSON.stringify(model)).toContain('Discount (10%)')
    }
  })

  it('hidden: no "Discount" string anywhere and totals are net', () => {
    const result = price(RATE_CARD_SEED, discountedInputs)
    const d = discountedInputs.discount_pct
    for (const kind of ['module_wise', 'saas_style', 'perfios'] as const) {
      const model = buildFormat(kind, clientSafe(discountedInputs, { discount_shown: false }), FIXED_DATE)
      expect(JSON.stringify(model)).not.toContain('Discount')
      const table = model.sections.find((s) => s.table)?.table
      const totalRow = table?.rows.find((r) => r[0] === 'TOTAL')
      expect(totalRow).toBeDefined()
      const last = totalRow?.[totalRow!.length - 1]
      if (kind === 'saas_style') {
        // saas_style's "Annual Cost" table has no TCO column by design; its
        // last cell is the net figure for the final year, not the net TCO.
        const lastYearList = result.total_years_inr[result.total_years_inr.length - 1]
        expect(last).toBe(Math.round(lastYearList * (1 - d)))
      } else {
        expect(last).toBe(result.net_total_tco_inr)
      }
    }
  })

  it('hidden discount in compare mode also shows net totals without the word Discount', () => {
    const compareInputsDiscounted: DealInputs = { ...compareInputs, discount_pct: 0.15 }
    const all = priceAllModes(RATE_CARD_SEED, compareInputsDiscounted)
    const model = buildFormat('perfios', compareClientSafe(compareInputsDiscounted, { discount_shown: false }), FIXED_DATE)
    expect(JSON.stringify(model)).not.toContain('Discount')
    const table = tableFromModel(model, (h) => h === 'Your Options')
    expect(table.rows).toContainEqual([
      '3-Year TCO',
      all.onprem.net_total_tco_inr,
      all.hybrid.net_total_tco_inr,
      all.saas.net_total_tco_inr,
    ])
  })
})

describe('client-safety (D5): every render model passes the blocklist scan', () => {
  const cases: Array<{ label: string; proposal: ClientSafeProposal }> = [
    { label: 'onprem', proposal: clientSafe(onpremInputs) },
    { label: 'saas', proposal: clientSafe(saasInputs) },
    { label: 'compare', proposal: compareClientSafe(compareInputs) },
    {
      label: 'discount-hidden',
      proposal: clientSafe({ ...onpremInputs, discount_pct: 0.1 }, { discount_shown: false }),
    },
  ]

  for (const { label, proposal } of cases) {
    for (const kind of ['module_wise', 'saas_style', 'perfios'] as const) {
      it(`${kind}/${label} -> scanForBlocklist([])`, () => {
        const model = buildFormat(kind, proposal, FIXED_DATE)
        expect(scanForBlocklist(model)).toEqual([])
      })
    }
  }
})

describe('excelExport blocklist guard (D5)', () => {
  it('buildWorkbook throws when the model contains a blocklisted partner name', () => {
    const poisoned: ProposalRenderModel = {
      title: 'Commercial Proposal',
      subtitle: 'Routed via Aurva co-sell',
      sections: [{ heading: '1. What You Get', bullets: ['Sourced through our partner Aurva'] }],
    }
    expect(() => buildWorkbook(poisoned)).toThrow(/aurva/i)
  })

  it('buildWorkbook throws when a BOM annexure row contains a blocklisted term', () => {
    const clean: ProposalRenderModel = { title: 'Proposal', subtitle: 'x', sections: [] }
    expect(() =>
      buildWorkbook(clean, {
        bom: [{ component: 'App server (via TechJockey)', site: 'primary', nodes: 1, vcpu: 2, ram_gb: 8, storage: '100 GB SSD' }],
      }),
    ).toThrow(/techjockey/i)
  })

  it('buildWorkbook succeeds (no throw) for a clean model and returns a workbook with a worksheet', () => {
    const model = buildFormat('module_wise', clientSafe(onpremInputs), FIXED_DATE)
    const wb = buildWorkbook(model)
    expect(wb.worksheets.length).toBeGreaterThan(0)
  })

  it('buildWorkbook adds an "Infrastructure You Provide" sheet when bom rows are given', () => {
    const model = buildFormat('module_wise', clientSafe(onpremInputs), FIXED_DATE)
    const wb = buildWorkbook(model, {
      bom: [{ component: 'App server', site: 'primary', nodes: 2, vcpu: 8, ram_gb: 32, storage: '100 GB SSD' }],
    })
    expect(wb.worksheets.map((w) => w.name)).toContain('Infrastructure You Provide')
  })
})
