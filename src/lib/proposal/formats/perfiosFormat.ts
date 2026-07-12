// "Perfios format" — the Client Proposal layout: 1. What You Get,
// 2. Commercial Summary, 3. Scope & Coverage, 4. What Drives Your Price,
// 5. Payment Terms. In compare mode (3 priced modes) this instead renders
// the Model Comparison layout: What You Get (all options) + Your Options.
import type { ClientSafeProposal } from '../clientSafe'
import type { ComponentLine, DeploymentMode, ModeResult } from '../../engine2/types'
import { discountTotalRows, findLine, fmtPct, netYearsOf, whatYouGetBullets } from './shared'
import type { ProposalRenderModel, RenderSection, RenderTable } from './types'

const ONPREM_PRICE_DRIVER =
  'Priced on your committed data principal slab. You host the infrastructure, so there is no hosting charge from us.'
const SAAS_HYBRID_PRICE_DRIVER =
  'Priced on your committed data principal base with per-user overage. Perfios hosts the platform; the consent governance bridge runs on your premises.'

function paymentTermsBullets(validityDays: number): string[] {
  return [
    'Year 1: 50 percent on order, balance on production go-live. Year 2 onward: annually in advance.',
    'One-time charges billed once. Recurring charges renew each year.',
    `Prices exclusive of applicable taxes. Validity ${validityDays} days.`,
  ]
}

function scopeStatus(mode: DeploymentMode, _key: 'dspm' | 'dam' | 'endpoint', enabled: boolean): string {
  if (mode === 'saas') return 'Not available (SaaS is CM-only)'
  return enabled ? 'Included' : 'Excluded'
}

function scopeTable(p: ClientSafeProposal): RenderTable {
  const mode = p.inputs.deployment_mode
  const rows: (string | number)[][] = [
    ['Consent Manager', 'Included'],
    ['DSPM', scopeStatus(mode, 'dspm', p.inputs.modules.dspm)],
    ['DAM', scopeStatus(mode, 'dam', p.inputs.modules.dam)],
    ['Endpoint Discovery / DLP', scopeStatus(mode, 'endpoint', p.inputs.modules.endpoint)],
    ['Infrastructure / hosting', mode === 'onprem' ? 'Client-provided' : 'Perfios-hosted'],
    ['Custom connectors', 'Excluded'],
    ['Applicable taxes', 'Excluded'],
  ]
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

function buildSingleMode(p: ClientSafeProposal): ProposalRenderModel {
  const result = p.results[0]
  const mode = result.mode
  const driver = mode === 'onprem' ? ONPREM_PRICE_DRIVER : SAAS_HYBRID_PRICE_DRIVER

  const sections: RenderSection[] = [
    { heading: '1. What You Get — Consent Manager (7 modules)', bullets: whatYouGetBullets() },
    { heading: '2. Commercial Summary (INR, exclusive of taxes)', table: commercialSummaryTable(p, result) },
    { heading: '3. Scope & Coverage', table: scopeTable(p) },
    { heading: '4. What Drives Your Price', paragraphs: [driver] },
    { heading: '5. Payment Terms', bullets: paymentTermsBullets(p.validity_days) },
  ]

  return {
    title: 'Commercial Proposal',
    subtitle: `Prepared for ${p.customer_name} — valid ${p.validity_days} days`,
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
    return line.included ? line[metric] : 'Not available'
  }
  return [label, cell(results.onprem), cell(results.hybrid), cell(results.saas)]
}

function buildCompare(p: ClientSafeProposal): ProposalRenderModel {
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
  const rows: (string | number)[][] = [
    moduleRow('CM Year 1', 'cm', results, 'year1_inr'),
    moduleRow('CM Annual', 'cm', results, 'recurring_inr'),
    moduleRow('DSPM Year1', 'dspm', results, 'year1_inr'),
    moduleRow('DSPM Annual', 'dspm', results, 'recurring_inr'),
    moduleRow('DAM Year1', 'dam', results, 'year1_inr'),
    moduleRow('DAM Annual', 'dam', results, 'recurring_inr'),
    moduleRow('Endpoint Year1', 'endpoint', results, 'year1_inr'),
    moduleRow('Endpoint Annual', 'endpoint', results, 'recurring_inr'),
  ]

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

  const sections: RenderSection[] = [
    { heading: 'What You Get (all options)', bullets: whatYouGetBullets() },
    { heading: 'Your Options', table },
  ]

  return {
    title: 'Commercial Proposal — Compare Deployment Options',
    subtitle: `Prepared for ${p.customer_name} — valid ${p.validity_days} days`,
    sections,
  }
}

export function build(p: ClientSafeProposal): ProposalRenderModel {
  return p.results.length === 3 ? buildCompare(p) : buildSingleMode(p)
}
