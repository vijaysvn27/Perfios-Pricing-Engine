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
  // dp_base_y2 is no longer read by priceCmSaas (owner direction 2026-07-13:
  // quoted totals are overage-free, so Year 2+ is a flat renewal regardless
  // of growth) — kept non-equal to dp_base_y1 here only to prove that.
  dp_base_y2: 3_000_000,
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
    usage_rates: RATE_CARD_SEED.usage_rates,
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
    usage_rates: RATE_CARD_SEED.usage_rates,
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
    for (const kind of ['module_wise', 'perfios'] as const) {
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
    for (const kind of ['module_wise', 'perfios'] as const) {
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
    for (const kind of ['module_wise', 'perfios'] as const) {
      const model = buildFormat(kind, clientSafe(onpremInputs), FIXED_DATE)
      expect(model.sections.some((s) => /inclusions & exclusions/i.test(s.heading))).toBe(true)
    }
  })

  it('names unselected modules explicitly under exclusions (on-prem, nothing selected)', () => {
    const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    const bullets = sectionBullets(model, (h) => /inclusions & exclusions/i.test(h))
    expect(bullets).toContain('DSPM — not in current scope; available as a priced add-on.')
    expect(bullets).toContain('DAM — not in current scope; available as a priced add-on.')
    expect(bullets).toContain('Endpoint Discovery / DLP — not in current scope; available as a priced add-on.')
  })

  it('a selected module is described with its quantities under inclusions, and dropped from exclusions', () => {
    const model = buildFormat('perfios', compareClientSafe(compareInputs), FIXED_DATE)
    const bullets = sectionBullets(model, (h) => /inclusions & exclusions/i.test(h))
    expect(bullets.some((b) => b.startsWith('DSPM') && b.includes('10 databases'))).toBe(true)
    expect(bullets).not.toContain('DSPM — not in current scope; available as a priced add-on.')
    expect(bullets).toContain('DAM — not in current scope; available as a priced add-on.')
  })

  it('SaaS mode excludes every estate module regardless of toggles', () => {
    const model = buildFormat('perfios', clientSafe(saasInputs), FIXED_DATE)
    const bullets = sectionBullets(model, (h) => /inclusions & exclusions/i.test(h))
    expect(bullets).toContain('DSPM — not in current scope; available as a priced add-on.')
    expect(bullets).toContain('DAM — not in current scope; available as a priced add-on.')
  })

  it('always carries the standard inclusions and exclusions', () => {
    const model = buildFormat('module_wise', clientSafe(onpremInputs), FIXED_DATE)
    const bullets = sectionBullets(model, (h) => /inclusions & exclusions/i.test(h))
    expect(bullets.some((b) => /^Support/.test(b))).toBe(true)
    expect(bullets.some((b) => /^Applicable taxes/.test(b))).toBe(true)
  })

  it('lists the 7 detailed Consent Manager capability bullets, each with real substance (not one cram-bullet)', () => {
    // compareInputs selects DSPM, so DPIA runs automated and stays in the
    // capability list (see the DPIA dependency describe block below for the
    // CM-only case, where bullet 7 moves to Scope exclusions instead).
    const model = buildFormat('perfios', clientSafe(compareInputs), FIXED_DATE)
    const bullets = sectionBullets(model, (h) => /inclusions & exclusions/i.test(h))
    for (const label of [
      'Consent Notice & Templates',
      'Data Principal Rights Portal (DPAR)',
      'Cookie Consent Manager',
      'Consent Governance (Consent Bridge)',
      'Consent Breach Module',
      'Vendor / Third-Party Module',
      'DPIA',
    ]) {
      expect(bullets.some((b) => b.includes(label))).toBe(true)
    }
    expect(bullets).toContain('Unlimited consents and consent actions per data principal — no per-transaction charges.')
  })

  it('groups inclusions and exclusions under labelled sub-headings', () => {
    const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    const bullets = sectionBullets(model, (h) => /inclusions & exclusions/i.test(h))
    for (const label of [
      'Platform & Licences:',
      'Delivery & Implementation:',
      'Support & Maintenance:',
      'Data-blind by design:',
      'Commercial exclusions:',
      'Scope exclusions:',
      'Client responsibilities (not Perfios-provided):',
    ]) {
      expect(bullets).toContain(label)
    }
  })

  it('quantifies the DSPM line with the actual scoped estate counts when selected', () => {
    const model = buildFormat('perfios', clientSafe(compareInputs), FIXED_DATE)
    const bullets = sectionBullets(model, (h) => /inclusions & exclusions/i.test(h))
    const dspmBullet = bullets.find((b) => b.startsWith('DSPM —'))
    expect(dspmBullet).toBeDefined()
    expect(dspmBullet).toContain('10 databases')
    expect(dspmBullet).toContain('100 GDrive/OneDrive users')
    expect(dspmBullet).toContain('5 virtual machines')
    expect(dspmBullet).toMatch(/data lineage and automated RoPA included/)
  })

  it('carries the On-Prem client-responsibility bullets (infra, network, OS/DB licences) only for On-Prem', () => {
    const onpremModel = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    const onpremBullets = sectionBullets(onpremModel, (h) => /inclusions & exclusions/i.test(h))
    expect(onpremBullets.some((b) => /^Infrastructure — provisioned by you/.test(b))).toBe(true)
    expect(onpremBullets.some((b) => /^Network and firewall provisioning/.test(b))).toBe(true)
    expect(onpremBullets.some((b) => /^Operating-system and database licences/.test(b))).toBe(true)

    const saasModel = buildFormat('perfios', clientSafe(saasInputs), FIXED_DATE)
    const saasBullets = sectionBullets(saasModel, (h) => /inclusions & exclusions/i.test(h))
    expect(saasBullets.some((b) => /^Infrastructure — provisioned by you/.test(b))).toBe(false)
  })

  it('is blocklist-clean and never names the data security partner', () => {
    for (const inputs of [onpremInputs, saasInputs, compareInputs]) {
      const model = buildFormat('perfios', clientSafe(inputs), FIXED_DATE)
      expect(scanForBlocklist(model)).toEqual([])
    }
  })
})

// DPIA dependency (owner complaint 3: "DPIA cannot be delivered standalone
// in CM-only deals — needs DSPM/DAM discovery data").
describe('DPIA dependency (item 3): CM-only vs with-estate behaviour matrix', () => {
  it('CM-only (no DSPM/DAM, e.g. plain On-Prem or SaaS): DPIA bullet 7 is absent from Platform inclusions, present as a Scope exclusion instead', () => {
    for (const inputs of [onpremInputs, saasInputs]) {
      const model = buildFormat('perfios', clientSafe(inputs), FIXED_DATE)
      const bullets = sectionBullets(model, (h) => /inclusions & exclusions/i.test(h))
      expect(bullets).not.toContain('7. DPIA — data privacy risk assessment with risk scoring and versioning.')
      expect(bullets).toContain('Consent Manager — all modules bundled; DPIA activates fully with DSPM/DAM.')
      expect(bullets).toContain(
        'Automated DPIA — requires DSPM/DAM in scope; questionnaire-based DPIA available as an interim.',
      )
    }
  })

  it('with DSPM (or DAM) selected: DPIA bullet 7 stays a Platform inclusion, no Scope exclusion note', () => {
    const model = buildFormat('perfios', clientSafe(compareInputs), FIXED_DATE) // compareInputs selects DSPM
    const bullets = sectionBullets(model, (h) => /inclusions & exclusions/i.test(h))
    expect(bullets).toContain('7. DPIA — data privacy risk assessment with risk scoring and versioning.')
    expect(bullets).not.toContain('Consent Manager — all modules bundled; DPIA activates fully with DSPM/DAM.')
    expect(bullets).not.toContain(
      'Automated DPIA — requires DSPM/DAM in scope; questionnaire-based DPIA available as an interim.',
    )
  })

  it('SaaS never qualifies as "with DSPM/DAM" even if the module flags are (harmlessly) set — CM-only by mode', () => {
    const saasWithModules: DealInputs = { ...saasInputs, modules: { dspm: true, dam: true, endpoint: true } }
    const model = buildFormat('perfios', clientSafe(saasWithModules), FIXED_DATE)
    const bullets = sectionBullets(model, (h) => /inclusions & exclusions/i.test(h))
    expect(bullets).toContain(
      'Automated DPIA — requires DSPM/DAM in scope; questionnaire-based DPIA available as an interim.',
    )
  })

  it('shared.ts "What You Get" DPIA bullet always carries the dependency qualifier (mode-independent)', () => {
    for (const inputs of [onpremInputs, saasInputs, compareInputs]) {
      const model = buildFormat('perfios', clientSafe(inputs), FIXED_DATE)
      const bullets = sectionBullets(model, (h) => h.includes('What You Get — Consent Manager'))
      const dpiaBullet = bullets.find((b) => b.includes('Data Privacy Risk Assessment (DPIA)'))
      expect(dpiaBullet).toMatch(/delivered in full when DSPM\/DAM are in scope/)
    }
  })

  it('moduleWise attribution table: DPIA Notes column reflects the same dependency', () => {
    const cmOnlyModel = buildFormat('module_wise', clientSafe(onpremInputs), FIXED_DATE)
    const cmOnlyTable = tableFromModel(cmOnlyModel, (h) => h === 'Where Each Capability Is Priced')
    const cmOnlyRow = cmOnlyTable.rows.find((r) => r[0] === 'Data Privacy Risk Assessment (DPIA)')
    expect(cmOnlyRow?.[2]).toMatch(/questionnaire-based DPIA only/)

    const withDspmModel = buildFormat('module_wise', clientSafe(compareInputs), FIXED_DATE)
    const withDspmTable = tableFromModel(withDspmModel, (h) => h === 'Where Each Capability Is Priced')
    const withDspmRow = withDspmTable.rows.find((r) => r[0] === 'Data Privacy Risk Assessment (DPIA)')
    expect(withDspmRow?.[2]).toMatch(/delivered in full/)
  })

  it('narrative solution overview carries the DPIA qualifier', () => {
    const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    const overview = model.sections.find((s) => s.heading === 'Solution Overview')
    expect(overview?.paragraphs?.[0]).toMatch(/Automated DPIA activates fully when DSPM\/DAM are in scope/)
  })

  it('is blocklist-clean for every DPIA scope case', () => {
    for (const inputs of [onpremInputs, saasInputs, compareInputs]) {
      const model = buildFormat('perfios', clientSafe(inputs), FIXED_DATE)
      expect(scanForBlocklist(model)).toEqual([])
    }
  })
})

describe('perfiosFormat (single mode)', () => {
  const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)

  it('has the narrative leading sections, the 10 numbered sections (Usage-Based Items + Sizing Estimate + inline On-Prem BOM annexure, present even for CM-only On-Prem), then the certifications and closing sections', () => {
    expect(model.sections.map((s) => s.heading)).toEqual([
      'Executive Summary',
      'Solution Overview',
      'Why Perfios',
      '1. What You Get — Consent Manager (7 modules)',
      '2. Commercial Summary (INR, exclusive of taxes)',
      '3. Usage-Based Items (billed on actuals)',
      '4. Inclusions & Exclusions',
      '5. Scope & Coverage',
      '6. Sizing Estimate',
      '7. Primary Site — Infrastructure You Provide',
      '8. Cold DR Site',
      '9. What Drives Your Price',
      '10. Payment Terms',
      'Certifications & Delivery Assurance',
      'One Partner, One Accountable Outcome',
    ])
  })

  it('section "What You Get" lists all 7 CM modules plus the closing line', () => {
    const bullets = sectionBullets(model, (h) => h.includes('What You Get — Consent Manager'))
    expect(bullets).toHaveLength(8)
    expect(bullets[0]).toContain('Consent Notice & Templates')
    expect(bullets[6]).toContain('Data Privacy Risk Assessment (DPIA)')
    expect(bullets[7]).toBe('Unlimited consents and actions per data principal.')
  })

  it('scope table omits unselected modules entirely and shows infra Client-provided (on-prem)', () => {
    const scope = tableFromModel(model, (h) => h === '5. Scope & Coverage')
    expect(scope.rows).toContainEqual(['Consent Manager', 'Included'])
    expect(scope.rows).toContainEqual(['Infrastructure / hosting', 'Client-provided'])
    expect(scope.rows).toContainEqual(['Custom connectors', 'Excluded'])
    expect(scope.rows).toContainEqual(['Applicable taxes', 'Excluded'])
    const labels = scope.rows.map((r) => r[0])
    expect(labels).not.toContain('DSPM')
    expect(labels).not.toContain('DAM')
    expect(labels).not.toContain('Endpoint Discovery / DLP')
  })

  it('scope table lists a selected module as Included (dynamic only)', () => {
    const selectedModel = buildFormat('perfios', clientSafe(compareInputs), FIXED_DATE)
    const scope = tableFromModel(selectedModel, (h) => h === '5. Scope & Coverage')
    expect(scope.rows).toContainEqual(['DSPM', 'Included'])
    const labels = scope.rows.map((r) => r[0])
    expect(labels).not.toContain('DAM')
    expect(labels).not.toContain('Endpoint Discovery / DLP')
  })

  it('"What Drives Your Price" uses the on-prem price-driver copy', () => {
    const section = model.sections.find((s) => /what drives your price/i.test(s.heading))
    expect(section?.paragraphs?.[0]).toMatch(/no hosting charge from us/)
  })

  it('"Payment Terms" includes the validity days', () => {
    const bullets = sectionBullets(model, (h) => /payment terms/i.test(h))
    expect(bullets.some((b) => b.includes('Validity 60 days'))).toBe(true)
  })

  it('SaaS mode scope table omits estate modules entirely (never selectable on SaaS) and shows infra Perfios-hosted', () => {
    const saasModel = buildFormat('perfios', clientSafe(saasInputs), FIXED_DATE)
    const scope = tableFromModel(saasModel, (h) => h === '5. Scope & Coverage')
    const labels = scope.rows.map((r) => r[0])
    expect(labels).not.toContain('DSPM')
    expect(labels).not.toContain('DAM')
    expect(labels).not.toContain('Endpoint Discovery / DLP')
    expect(scope.rows).toContainEqual(['Infrastructure / hosting', 'Perfios-hosted'])
    expect(JSON.stringify(scope)).not.toContain('Not available')
    // Heading number is found by regex, not hardcoded: SaaS mode always carries
    // a Usage-Based Items section plus a Sizing Estimate section (transparent
    // platform sizing), which shift every following numbered heading up
    // versus the CM-only On-Prem case.
    const driver = saasModel.sections.find((s) => /what drives your price/i.test(s.heading))
    expect(driver?.heading).toBe('7. What Drives Your Price')
    expect(driver?.paragraphs?.[0]).toMatch(/Perfios hosts the platform/)
  })
})

describe('Sizing Estimate (item: transparent sizing, Perfios format only)', () => {
  it('present for CM-only On-Prem too — infra is needed even without estate modules, so the BOM shows inline (owner feedback: infra sizing must be in the proposal body)', () => {
    const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    expect(model.sections.some((s) => /sizing estimate/i.test(s.heading))).toBe(true)
    const primary = model.sections.find((s) => /primary site — infrastructure you provide/i.test(s.heading))
    const dr = model.sections.find((s) => /cold dr site/i.test(s.heading))
    expect(primary?.table?.columns).toEqual(['Component', 'Nodes', 'vCPU/node', 'RAM GB/node', 'Storage/node'])
    expect(primary?.table?.rows.some((r) => r[0] === 'MySQL primary + standby')).toBe(true)
    expect(dr?.table?.rows.some((r) => String(r[0]).includes('MongoDB'))).toBe(true)
  })

  it('present when an estate module is selected on On-Prem, with the inline BOM annexure sections following it', () => {
    const model = buildFormat('perfios', clientSafe(compareInputs), FIXED_DATE)
    const section = model.sections.find((s) => /sizing estimate/i.test(s.heading))
    expect(section).toBeDefined()
    expect(section?.paragraphs?.some((p) => /RPO < 15 min/.test(p))).toBe(true)
    expect(
      section?.paragraphs?.some((p) => /reference architecture for your committed data-principal base/.test(p)),
    ).toBe(true)
    const headings = model.sections.map((s) => s.heading)
    expect(headings.some((h) => /primary site — infrastructure you provide/i.test(h))).toBe(true)
    expect(headings.some((h) => /cold dr site/i.test(h))).toBe(true)
  })

  it('Hybrid never gets the inline CM On-Prem BOM (its CM is Perfios-hosted) — estate infra is a standing TBD confirmed with the data security partner', () => {
    const hybridInputs: DealInputs = { ...saasInputs, deployment_mode: 'hybrid' }
    const model = buildFormat('perfios', clientSafe(hybridInputs), FIXED_DATE)
    const headings = model.sections.map((s) => s.heading)
    expect(headings.some((h) => /primary site/i.test(h))).toBe(false)
    expect(headings.some((h) => /cold dr site/i.test(h))).toBe(false)
    const section = model.sections.find((s) => /sizing estimate/i.test(s.heading))
    const text = (section?.paragraphs ?? []).join(' ')
    expect(text).toMatch(/data-security components \(DSPM\/DAM\) is confirmed with our data security partner/)
    expect(scanForBlocklist(model)).toEqual([])
  })

  it('present for SaaS even with no estate module selected — transparent platform sizing', () => {
    const model = buildFormat('perfios', clientSafe(saasInputs), FIXED_DATE)
    const section = model.sections.find((s) => /sizing estimate/i.test(s.heading))
    expect(section).toBeDefined()
    const text = (section?.paragraphs ?? []).join(' ')
    expect(text).toMatch(/Your Year-1 base: 25,00,000 data principals/)
    expect(text).toMatch(/Included DP bundle: 15,00,000 data principals in the Year-1 platform fee/)
    expect(text).toMatch(/Per-user rate: ₹2 per user per year/)
    expect(text).toMatch(/the renewal \(30% of the Year-1 platform fee\)/) // Year 2+ rule, shared copy
    expect(text).toMatch(/Perfios-hosted, India region/)
    // The consent governance bridge sits on the client's premises in EVERY
    // hosted mode, INCLUDING SaaS (Olivia, Vi call 2026-07-07: "even in SaaS
    // the consent bridge will always be a part of their premise").
    expect(text).toMatch(/consent governance bridge runs on your premises/)
  })

  it('Hybrid sizing also keeps the consent governance bridge (plus data-security components) on premises', () => {
    const hybridInputs: DealInputs = { ...saasInputs, deployment_mode: 'hybrid' }
    const model = buildFormat('perfios', clientSafe(hybridInputs), FIXED_DATE)
    const section = model.sections.find((s) => /sizing estimate/i.test(s.heading))
    const text = (section?.paragraphs ?? []).join(' ')
    expect(text).toMatch(/consent governance bridge and the data-security components run on your premises/)
  })

  it('never appears in compare mode (three simultaneous modes have no single deployment_mode to size)', () => {
    const model = buildFormat('perfios', compareClientSafe(compareInputs), FIXED_DATE)
    expect(model.sections.some((s) => /sizing estimate/i.test(s.heading))).toBe(false)
  })

  it('Estate Considered table: qty x unit rate = annual, override-aware, with a Subtotal row', () => {
    const proposal: ClientSafeProposal = {
      ...clientSafe(compareInputs),
      sizing_lines: [
        { label: 'Databases', unit: 'per database', qty: 10, unit_rate_inr: 5_000, annual_inr: 50_000 },
        { label: 'Cloud connectors', unit: 'per connector', qty: 1, unit_rate_inr: 20_000, annual_inr: 20_000 },
      ],
    }
    const model = buildFormat('perfios', proposal, FIXED_DATE)
    const section = model.sections.find((s) => /sizing estimate/i.test(s.heading))
    expect(section?.table?.columns).toEqual(['Driver', 'Count', 'Unit Rate (₹)', 'Annual (₹)'])
    expect(section?.table?.rows).toContainEqual(['Databases', '10', 5_000, 50_000])
    expect(section?.table?.rows).toContainEqual(['Cloud connectors', '1', 20_000, 20_000])
    expect(section?.table?.rows).toContainEqual(['Subtotal', '', '', 70_000])
  })
})

describe('included-DP note (Honda "included DPs + overage" framing)', () => {
  const hybridInputs: DealInputs = { ...saasInputs, deployment_mode: 'hybrid' }

  it('appears in "What Drives Your Price" for SaaS with the bundle, derived rate, and renewal percentage (15,00,000 / ₹2 / 30%)', () => {
    const model = buildFormat('perfios', clientSafe(saasInputs), FIXED_DATE)
    const driver = model.sections.find((s) => /what drives your price/i.test(s.heading))
    expect(driver?.paragraphs).toContainEqual(
      'Included: 15,00,000 data principals — covering all consent actions (grant, revocation, modification, ' +
        'deletion, cookie consent) — in the Year-1 platform fee. Beyond the bundle: ₹2 per data principal per ' +
        'year, billed on actuals. From Year 2, the platform renews at 30% of the Year-1 platform fee.',
    )
    // The consent-modification caveat rides along as a bullet (owner
    // documentation call: consent modifications by existing DPs never
    // inflate the billed user count).
    expect(driver?.bullets?.some((b) => /net-new data principals/.test(b))).toBe(true)
  })

  it('appears for Hybrid too (per-user rate applies the same way as SaaS)', () => {
    const model = buildFormat('perfios', clientSafe(hybridInputs), FIXED_DATE)
    const driver = model.sections.find((s) => /what drives your price/i.test(s.heading))
    const text = (driver?.paragraphs ?? []).join(' ')
    expect(text).toMatch(/Included: 15,00,000 data principals/)
    expect(text).toMatch(/From Year 2, the platform renews at 30% of the Year-1 platform fee/)
  })

  it('is absent for On-Prem (no per-user rate to quote)', () => {
    const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    const driver = model.sections.find((s) => /what drives your price/i.test(s.heading))
    const text = (driver?.paragraphs ?? []).join(' ')
    expect(text).not.toMatch(/Included:/)
    expect(JSON.stringify(model)).not.toMatch(/Included: \d/)
  })

  it('does not break the client-safety blocklist scan for saas/hybrid/onprem', () => {
    for (const inputs of [onpremInputs, saasInputs, hybridInputs]) {
      const model = buildFormat('perfios', clientSafe(inputs), FIXED_DATE)
      expect(scanForBlocklist(model)).toEqual([])
    }
  })
})

describe('boilerplate: certifications disclaimer and closing statement (Perfios format)', () => {
  it('every Perfios-format build (single and compare) ends with the closing statement, naming the customer', () => {
    const single = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    const compare = buildFormat('perfios', compareClientSafe(compareInputs), FIXED_DATE)
    for (const model of [single, compare]) {
      const last = model.sections[model.sections.length - 1]
      expect(last.heading).toBe('One Partner, One Accountable Outcome')
      expect(last.paragraphs?.[0]).toContain('Acme Appliances')
      expect(last.paragraphs?.[0]).toContain('One partner, one accountable outcome')
    }
  })

  it('carries the ISO/SOC2/no-DPDP-certification disclaimer, and it never names the data security partner', () => {
    const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    const section = model.sections.find((s) => /certifications/i.test(s.heading))
    expect(section?.paragraphs?.[0]).toMatch(/ISO 27001/)
    expect(section?.paragraphs?.[0]).toMatch(/SOC 2 Type 2/)
    expect(section?.paragraphs?.[0]).toMatch(/no certifying body/)
    expect(scanForBlocklist(section)).toEqual([])
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

  describe('"Where Each Capability Is Priced" table', () => {
    it('is present, right after the commercial table', () => {
      const model = buildFormat('module_wise', clientSafe(onpremInputs), FIXED_DATE)
      const headings = model.sections.map((s) => s.heading)
      const commercialIdx = headings.indexOf('Commercial Summary — Module-wise')
      const attributionIdx = headings.indexOf('Where Each Capability Is Priced')
      expect(attributionIdx).toBeGreaterThan(-1)
      expect(attributionIdx).toBe(commercialIdx + 1)
      const table = tableFromModel(model, (h) => h === 'Where Each Capability Is Priced')
      expect(table.columns).toEqual(['Capability', 'Priced Under', 'Notes'])
    })

    it('the RoPA/lineage row is priced under DSPM / DAM, not Consent Manager', () => {
      const model = buildFormat('module_wise', clientSafe(onpremInputs), FIXED_DATE)
      const table = tableFromModel(model, (h) => h === 'Where Each Capability Is Priced')
      const ropaRow = table.rows.find((r) => r[0] === 'Data lineage & automated RoPA')
      expect(ropaRow?.[1]).toBe('DSPM / DAM')
    })

    it('the DPAR row is priced under Consent Manager, bundled', () => {
      const model = buildFormat('module_wise', clientSafe(onpremInputs), FIXED_DATE)
      const table = tableFromModel(model, (h) => h === 'Where Each Capability Is Priced')
      const dparRow = table.rows.find((r) => r[0] === 'Data Principal Rights Portal (DPAR)')
      expect(dparRow?.[1]).toBe('Consent Manager')
      expect(dparRow?.[2]).toMatch(/bundled/i)
    })

    it('scope note follows the module selection: selected module reads "In current scope", others read the add-on note', () => {
      const model = buildFormat('module_wise', clientSafe(compareInputs), FIXED_DATE)
      const table = tableFromModel(model, (h) => h === 'Where Each Capability Is Priced')
      const dspmRow = table.rows.find((r) => r[0] === 'DSPM (discovery & classification)')
      const damRow = table.rows.find((r) => r[0] === 'DAM (database activity monitoring)')
      expect(dspmRow?.[2]).toBe('In current scope.')
      expect(damRow?.[2]).toBe('Not in current scope — available as an add-on.')
    })

    it('on SaaS, DSPM/DAM/Endpoint all read as not in current scope regardless of module toggles', () => {
      const model = buildFormat('module_wise', clientSafe(saasInputs), FIXED_DATE)
      const table = tableFromModel(model, (h) => h === 'Where Each Capability Is Priced')
      for (const label of ['DSPM (discovery & classification)', 'DAM (database activity monitoring)', 'Endpoint Discovery / DLP']) {
        const row = table.rows.find((r) => r[0] === label)
        expect(row?.[2]).toBe('Not in current scope — available as an add-on.')
      }
    })

    it('is blocklist-clean', () => {
      for (const proposal of [clientSafe(onpremInputs), clientSafe(saasInputs), clientSafe(compareInputs)]) {
        const model = buildFormat('module_wise', proposal, FIXED_DATE)
        expect(scanForBlocklist(model)).toEqual([])
      }
    })
  })
})

// Fixture math (25L tier, saas_v3 basis, dp_base_y1 2,500,000): platform
// 3,866,496; included_dp 1,500,000; per-DP rate = ceil(platform ÷ tier
// user_cap 2,500,000) = ceil(1.5465984) = ₹2 — published as a rate only (see
// includedDpNote / Usage-Based Items), never as a row in this table.
// implementation = 15% × licence 1,500,000 = 225,000. QUOTED totals are
// overage-free (owner direction 2026-07-13: "One time, implementation + per
// DP cost. That's all for CM SaaS"): Year 1 = implementation + platform =
// 225,000 + 3,866,496 = 4,091,496. Year 2+ = renewal = round(30% × platform
// 3,866,496) = 1,159,949 (dp_base_y2 is no longer read by the engine — see
// engine2.ts's priceCmSaas, which keeps it in the signature for tier
// headroom context only). 3-year TCO = 4,091,496 + 2 × 1,159,949 = 6,411,394.
describe('perfiosFormat subscription table (Commercial Summary, saas/hybrid) — fixes "no commercial table"', () => {
  it('Implementation and Platform fee are Year-1 only, Annual renewal is Year-2+ only, no Overage row, TOTAL matches engine totals', () => {
    const result = price(RATE_CARD_SEED, saasInputs)
    const model = buildFormat('perfios', clientSafe(saasInputs), FIXED_DATE)
    const table = tableFromModel(model, (h) => h === '2. Commercial Summary (INR, exclusive of taxes)')
    expect(table.columns).toEqual(['Component', 'Year 1', 'Year 2', 'Year 3', '3-Year TCO'])

    expect(table.rows).toContainEqual(['Implementation (one-time)', 225_000, '', '', 225_000])
    expect(table.rows).toContainEqual([
      'Platform fee — includes 15,00,000 data principals, all consent actions (grant, revocation, modification, ' +
        'deletion, cookie consent)',
      3_866_496,
      '',
      '',
      3_866_496,
    ])
    expect(table.rows).toContainEqual([
      'Annual renewal — 30% of platform fee',
      '',
      1_159_949,
      1_159_949,
      1_159_949 * 2,
    ])
    expect(table.rows.some((r) => String(r[0]).includes('Overage —'))).toBe(false)

    const totalRow = table.rows.find((r) => r[0] === 'TOTAL')
    expect(totalRow).toEqual(['TOTAL', ...result.total_years_inr, result.total_tco_inr])
    expect(result.total_years_inr).toEqual([4_091_496, 1_159_949, 1_159_949])
    expect(result.total_tco_inr).toBe(6_411_394)
  })

  it('no Overage row ever appears in the commercial table, regardless of how the base compares to the bundle', () => {
    // Tier 0 (user_cap 500,000, included_dp 300,000): 200,000 DPs is inside
    // the bundle; ENGINE FACTS tier-0 fixture (platform 2,276,880, rate ₹5,
    // renewal 683,064) still yields no Overage row either way — overage is
    // never a row in this table, only a published rate.
    const tier0: DealInputs = { ...saasInputs, dp_base_y1: 200_000, dp_base_y2: 200_000 }
    const result = price(RATE_CARD_SEED, tier0)
    expect(result.saas_included_dp).toBe(300_000) // sanity: confirms the tier/bundle picked
    expect(result.total_year1_inr).toBe(2_501_880)
    expect(result.total_recurring_inr).toBe(683_064)
    const model = buildFormat('perfios', clientSafe(tier0), FIXED_DATE)
    const table = tableFromModel(model, (h) => h === '2. Commercial Summary (INR, exclusive of taxes)')
    expect(table.rows.some((r) => String(r[0]).includes('Overage —'))).toBe(false)
  })

  it('Hybrid gets the same subscription table plus estate module lines when selected', () => {
    const hybridWithDspm: DealInputs = {
      ...saasInputs,
      deployment_mode: 'hybrid',
      modules: { dspm: true, dam: false, endpoint: false },
      estate_quantities: { database: 5 },
    }
    const model = buildFormat('perfios', clientSafe(hybridWithDspm), FIXED_DATE)
    const table = tableFromModel(model, (h) => h === '2. Commercial Summary (INR, exclusive of taxes)')
    expect(table.rows.some((r) => r[0] === 'DSPM')).toBe(true)
  })

  it('On-Prem keeps the plain per-component Commercial Summary table (unaffected)', () => {
    const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    const table = tableFromModel(model, (h) => h === '2. Commercial Summary (INR, exclusive of taxes)')
    expect(table.rows.some((r) => String(r[0]).startsWith('Platform fee'))).toBe(false)
    expect(table.rows.some((r) => r[0] === 'Consent Manager (7 modules)')).toBe(true)
  })

  it('is blocklist-clean', () => {
    for (const inputs of [onpremInputs, saasInputs]) {
      const model = buildFormat('perfios', clientSafe(inputs), FIXED_DATE)
      expect(scanForBlocklist(model)).toEqual([])
    }
  })
})

describe('perfiosFormat usage-based items table — fixes "₹1/OCR usage rate missing"', () => {
  it('SaaS/Hybrid: per-DP overage row plus the OCR row from the rate card', () => {
    const model = buildFormat('perfios', clientSafe(saasInputs), FIXED_DATE)
    const table = tableFromModel(model, (h) => h === '3. Usage-Based Items (billed on actuals)')
    expect(table.columns).toEqual(['Item', 'Unit', 'Rate'])
    expect(table.rows).toContainEqual(['Additional data principals beyond the included bundle', 'per DP per year', '₹2'])
    expect(table.rows).toContainEqual([
      'OCR processing (scanned / physical consent capture)',
      'per document',
      '₹1',
    ])
  })

  it('On-Prem: OCR row only, no per-DP row (On-Prem has no per-user rate)', () => {
    const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    const table = tableFromModel(model, (h) => h === '3. Usage-Based Items (billed on actuals)')
    expect(table.rows).toContainEqual([
      'OCR processing (scanned / physical consent capture)',
      'per document',
      '₹1',
    ])
    expect(table.rows.some((r) => String(r[0]).startsWith('Additional data principals'))).toBe(false)
  })

  it('the section is omitted entirely when the proposal carries no usage_rates and no per-DP rate', () => {
    const noUsageRates: ClientSafeProposal = { ...clientSafe(onpremInputs), usage_rates: undefined }
    const model = buildFormat('perfios', noUsageRates, FIXED_DATE)
    expect(model.sections.some((s) => /usage-based items/i.test(s.heading))).toBe(false)
  })
})

describe('perfios compare mode (3 priced modes)', () => {
  const model = buildFormat('perfios', compareClientSafe(compareInputs), FIXED_DATE)

  it('renders narrative + "What You Get (all options)" + "Your Options" + "Inclusions & Exclusions" + certifications + closing', () => {
    expect(model.sections.map((s) => s.heading)).toEqual([
      'Executive Summary',
      'Solution Overview',
      'Why Perfios',
      'What You Get (all options)',
      'Your Options',
      'Inclusions & Exclusions',
      'Certifications & Delivery Assurance',
      'One Partner, One Accountable Outcome',
    ])
    const table = tableFromModel(model, (h) => h === 'Your Options')
    expect(table.columns).toEqual(['Line Item', 'Option A: On-Prem', 'Option B: Hybrid', 'Option C: SaaS'])
  })

  it('marks the SaaS column "On-Prem / Hybrid only" while on-prem/hybrid show real figures, for the selected module', () => {
    const table = tableFromModel(model, (h) => h === 'Your Options')
    const dspmRow = table.rows.find((r) => r[0] === 'DSPM Year1')
    expect(dspmRow).toBeDefined()
    expect(dspmRow?.[1]).toEqual(expect.any(Number)) // on-prem
    expect(dspmRow?.[2]).toEqual(expect.any(Number)) // hybrid
    expect(dspmRow?.[3]).toBe('On-Prem / Hybrid only') // SaaS is CM-only
    expect(JSON.stringify(table)).not.toContain('Not available')
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
    for (const kind of ['module_wise', 'perfios'] as const) {
      const model = buildFormat(kind, clientSafe(discountedInputs, { discount_shown: true }), FIXED_DATE)
      expect(JSON.stringify(model)).toContain('Discount (10%)')
    }
  })

  it('hidden: no "Discount" string anywhere and totals are net', () => {
    const result = price(RATE_CARD_SEED, discountedInputs)
    for (const kind of ['module_wise', 'perfios'] as const) {
      const model = buildFormat(kind, clientSafe(discountedInputs, { discount_shown: false }), FIXED_DATE)
      expect(JSON.stringify(model)).not.toContain('Discount')
      const table = model.sections.find((s) => s.table)?.table
      const totalRow = table?.rows.find((r) => r[0] === 'TOTAL')
      expect(totalRow).toBeDefined()
      const last = totalRow?.[totalRow!.length - 1]
      expect(last).toBe(result.net_total_tco_inr)
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
    for (const kind of ['module_wise', 'perfios'] as const) {
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
