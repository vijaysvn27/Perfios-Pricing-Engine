// "Perfios format" — the Client Proposal layout: leading Executive Summary /
// Solution Overview / Why Perfios narrative, then 1. What You Get,
// 2. Commercial Summary, 3. Inclusions & Exclusions, 4. Scope & Coverage,
// 5. What Drives Your Price, 6. Payment Terms. In compare mode (3 priced
// modes) this instead renders the Model Comparison layout: narrative +
// What You Get (all options) + Your Options + Inclusions & Exclusions.
import type { ClientSafeProposal } from '../clientSafe'
import { narrativeSections } from '../narrative'
import type { ComponentLine, DeploymentMode, ModeResult } from '../../engine2/types'
import { buildCover } from './cover'
import { buildInclusionsExclusionsSection } from './inclusions'
import { buildSizingSection } from './sizing'
import { discountTotalRows, findLine, fmtPct, netYearsOf, whatYouGetBullets } from './shared'
import type { ProposalRenderModel, RenderSection, RenderTable } from './types'

const ONPREM_PRICE_DRIVER =
  'Priced on your committed data principal slab. You host the infrastructure, so there is no hosting charge from us.'
const SAAS_HYBRID_PRICE_DRIVER =
  'Priced on your committed data principal base via a per-user rate. Perfios hosts the platform; the consent governance bridge runs on your premises.'

/** Cover/annexure disclaimer (adapted from the Avanse Functional Evidence
 * Pack), unnumbered and identical for every deal — certifications never
 * change per customer. Deliberately does not name the data security partner
 * (blocklist-clean by construction, not by luck). */
const CERTIFICATIONS_SECTION: RenderSection = {
  heading: 'Certifications & Delivery Assurance',
  paragraphs: [
    'Perfios is ISO 27001 certified; SOC 2 Type 2 certification is in process. No DPDP-specific certification is ' +
      'claimed, as no certifying body for the DPDP Act currently exists in India. Discovery, classification, and ' +
      'database-activity monitoring capabilities are delivered together with our data security partner.',
  ],
}

/** Closing statement (adapted from the Vi DPDP Comprehensive Blueprint),
 * appended as the final, unnumbered section of every Perfios-format layout. */
function closingSection(customerName: string): RenderSection {
  return {
    heading: 'One Partner, One Accountable Outcome',
    paragraphs: [
      'One partner, one accountable outcome. Perfios delivers the platform, the consulting and the integration — ' +
        `with the SLAs and support to run it. ${customerName} keeps control of its decisions, its UI/UX and its ` +
        'data; Perfios carries the rest.',
    ],
  }
}

function paymentTermsBullets(validityDays: number): string[] {
  return [
    'Year 1: 50 percent on order, balance on production go-live. Year 2 onward: annually in advance.',
    'One-time charges billed once. Recurring charges renew each year.',
    `Prices exclusive of applicable taxes. Validity ${validityDays} days.`,
  ]
}

/**
 * Only selected components get a row — unselected modules are already named
 * in the Inclusions & Exclusions section, so listing them here again with a
 * status of their own would be redundant and, on SaaS, actively confusing.
 * SaaS never has an estate module selected (the wizard disables
 * those toggles), so this guard should never trip in practice — but if it
 * ever did, the row is simply omitted rather than printing a stale status.
 */
function scopeTable(p: ClientSafeProposal): RenderTable {
  const mode: DeploymentMode = p.inputs.deployment_mode
  const modules = p.inputs.modules
  const moduleRows: [boolean, string][] = [
    [modules.dspm, 'DSPM'],
    [modules.dam, 'DAM'],
    [modules.endpoint, 'Endpoint Discovery / DLP'],
  ]
  const rows: (string | number)[][] = [['Consent Manager', 'Included']]
  for (const [selected, label] of moduleRows) {
    if (selected && mode !== 'saas') rows.push([label, 'Included'])
  }
  rows.push(
    ['Infrastructure / hosting', mode === 'onprem' ? 'Client-provided' : 'Perfios-hosted'],
    ['Custom connectors', 'Excluded'],
    ['Applicable taxes', 'Excluded'],
  )
  return { title: 'Scope & Coverage', columns: ['Item', 'Status'], rows }
}

function commercialSummaryTable(p: ClientSafeProposal, result: ModeResult): RenderTable {
  const years = result.total_years_inr.length
  const d = p.inputs.discount_pct
  const columns = ['Component', ...Array.from({ length: years }, (_, i) => `Year ${i + 1}`), `${years}-Year TCO`]
  const rows: (string | number)[][] = result.lines
    .filter((l) => l.included)
    .map((l) => [l.label, ...l.years_inr, l.tco_inr])
  const netYears = netYearsOf(result.total_years_inr, d)
  rows.push(
    ...discountTotalRows({
      label: 'TOTAL',
      years: result.total_years_inr,
      netYears,
      tco: result.total_tco_inr,
      netTco: result.net_total_tco_inr,
      discount_pct: d,
      discount_shown: p.discount_shown,
    }),
  )
  return { title: 'Commercial Summary (INR, exclusive of taxes)', columns, rows }
}

/**
 * Numbers each core section 1..N as it's appended — dynamic, not hardcoded,
 * so the optional "Sizing Estimate" section (present only when there's
 * something to size — see sizing.ts) never leaves a numbering gap or forces
 * every other heading to be re-literaled by hand.
 */
function numberedSections(entries: RenderSection[]): RenderSection[] {
  return entries.map((s, i) => ({ ...s, heading: `${i + 1}. ${s.heading}` }))
}

function buildSingleMode(p: ClientSafeProposal, asOfDate: string): ProposalRenderModel {
  const result = p.results[0]
  const mode = result.mode
  const driver = mode === 'onprem' ? ONPREM_PRICE_DRIVER : SAAS_HYBRID_PRICE_DRIVER
  const title = 'Commercial Proposal'

  const sizing = buildSizingSection(p, result)

  const core = numberedSections([
    { heading: 'What You Get — Consent Manager (7 modules)', bullets: whatYouGetBullets() },
    { heading: 'Commercial Summary (INR, exclusive of taxes)', table: commercialSummaryTable(p, result) },
    { ...buildInclusionsExclusionsSection(p), heading: 'Inclusions & Exclusions' },
    { heading: 'Scope & Coverage', table: scopeTable(p) },
    ...(sizing ? [sizing] : []),
    { heading: 'What Drives Your Price', paragraphs: [driver] },
    { heading: 'Payment Terms', bullets: paymentTermsBullets(p.validity_days) },
  ])

  const sections: RenderSection[] = [
    ...narrativeSections(p),
    ...core,
    CERTIFICATIONS_SECTION,
    closingSection(p.customer_name),
  ]

  return {
    title,
    subtitle: `Prepared for ${p.customer_name} — valid ${p.validity_days} days`,
    cover: buildCover(p, asOfDate, title),
    sections,
  }
}

function moduleRow(
  label: string,
  key: ComponentLine['component_key'],
  results: { onprem: ModeResult; hybrid: ModeResult; saas: ModeResult },
  metric: 'year1_inr' | 'recurring_inr',
): (string | number)[] {
  const cell = (r: ModeResult): string | number => {
    const line = findLine(r, key)
    // This row only exists because the AM selected the module (see
    // buildCompare below), so an excluded line here means SaaS genuinely
    // can't carry it — not that it was never in scope.
    return line.included ? line[metric] : 'On-Prem / Hybrid only'
  }
  return [label, cell(results.onprem), cell(results.hybrid), cell(results.saas)]
}

function buildCompare(p: ClientSafeProposal, asOfDate: string): ProposalRenderModel {
  const onprem = p.results.find((r) => r.mode === 'onprem')
  const hybrid = p.results.find((r) => r.mode === 'hybrid')
  const saas = p.results.find((r) => r.mode === 'saas')
  if (!onprem || !hybrid || !saas) {
    throw new Error('perfios compare format requires all three deployment modes (onprem, hybrid, saas)')
  }
  const results = { onprem, hybrid, saas }
  const years = onprem.total_years_inr.length
  const d = p.inputs.discount_pct

  const columns = ['Line Item', 'Option A: On-Prem', 'Option B: Hybrid', 'Option C: SaaS']
  // Dynamic only: CM is always in scope, but DSPM/DAM/Endpoint rows exist
  // ONLY when the AM selected that module — never for modules that were
  // never toggled on, regardless of what any single mode's line shows.
  const rows: (string | number)[][] = [
    moduleRow('CM Year 1', 'cm', results, 'year1_inr'),
    moduleRow('CM Annual', 'cm', results, 'recurring_inr'),
  ]
  if (p.inputs.modules.dspm) {
    rows.push(moduleRow('DSPM Year1', 'dspm', results, 'year1_inr'))
    rows.push(moduleRow('DSPM Annual', 'dspm', results, 'recurring_inr'))
  }
  if (p.inputs.modules.dam) {
    rows.push(moduleRow('DAM Year1', 'dam', results, 'year1_inr'))
    rows.push(moduleRow('DAM Annual', 'dam', results, 'recurring_inr'))
  }
  if (p.inputs.modules.endpoint) {
    rows.push(moduleRow('Endpoint Year1', 'endpoint', results, 'year1_inr'))
    rows.push(moduleRow('Endpoint Annual', 'endpoint', results, 'recurring_inr'))
  }

  const totalYear1List = [onprem.total_year1_inr, hybrid.total_year1_inr, saas.total_year1_inr]
  const totalYear1Net = totalYear1List.map((v) => Math.round(v * (1 - Math.min(Math.max(d, 0), 1))))
  const totalAnnualList = [onprem.total_recurring_inr, hybrid.total_recurring_inr, saas.total_recurring_inr]
  const totalAnnualNet = totalAnnualList.map((v) => Math.round(v * (1 - Math.min(Math.max(d, 0), 1))))
  const totalTcoList = [onprem.total_tco_inr, hybrid.total_tco_inr, saas.total_tco_inr]
  const totalTcoNet = [onprem.net_total_tco_inr, hybrid.net_total_tco_inr, saas.net_total_tco_inr]

  const compareTotalRows = (
    label: string,
    list: number[],
    net: number[],
  ): (string | number)[][] => {
    if (d > 0 && p.discount_shown) {
      const disc = list.map((v, i) => -(v - net[i]))
      return [
        [`${label} — List`, ...list],
        [`Discount (${fmtPct(d)})`, ...disc],
        [`${label} — Net`, ...net],
      ]
    }
    if (d > 0 && !p.discount_shown) return [[label, ...net]]
    return [[label, ...list]]
  }

  rows.push(...compareTotalRows('Total Year 1', totalYear1List, totalYear1Net))
  rows.push(...compareTotalRows('Total Annual', totalAnnualList, totalAnnualNet))
  rows.push(...compareTotalRows(`${years}-Year TCO`, totalTcoList, totalTcoNet))

  const table: RenderTable = { title: 'Your Options', columns, rows }
  const title = 'Commercial Proposal — Compare Deployment Options'

  const sections: RenderSection[] = [
    ...narrativeSections(p),
    { heading: 'What You Get (all options)', bullets: whatYouGetBullets() },
    { heading: 'Your Options', table },
    buildInclusionsExclusionsSection(p),
    CERTIFICATIONS_SECTION,
    closingSection(p.customer_name),
  ]

  return {
    title,
    subtitle: `Prepared for ${p.customer_name} — valid ${p.validity_days} days`,
    cover: buildCover(p, asOfDate, title),
    sections,
  }
}

export function build(p: ClientSafeProposal, asOfDate: string): ProposalRenderModel {
  return p.results.length === 3 ? buildCompare(p, asOfDate) : buildSingleMode(p, asOfDate)
}
