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
import {
  blankIfZero,
  CONSENT_MODIFICATION_CAVEAT,
  discountTotalRows,
  findLine,
  formatINR,
  formatPerUserRate,
  includedDpNote,
  totalRowInputs,
  traceValue,
  whatYouGetBullets,
} from './shared'
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

function commercialSummaryTable(p: ClientSafeProposal, result: ModeResult, listResult: ModeResult | undefined): RenderTable {
  const years = result.total_years_inr.length
  const columns = ['Component', ...Array.from({ length: years }, (_, i) => `Year ${i + 1}`), `${years}-Year TCO`]
  const rows: (string | number)[][] = result.lines
    .filter((l) => l.included)
    .map((l) => [l.label, ...l.years_inr.map(blankIfZero), blankIfZero(l.tco_inr)])
  const t = totalRowInputs(p, result, listResult)
  rows.push(
    ...discountTotalRows({
      label: 'TOTAL',
      years: t.years,
      netYears: t.netYears,
      tco: t.tco,
      netTco: t.netTco,
      discount_pct: p.inputs.discount_pct,
      discount_shown: p.discount_shown,
      overrides: t.overrides,
    }),
  )
  return { title: 'Commercial Summary (INR, exclusive of taxes)', columns, rows }
}

/**
 * SaaS/Hybrid single-mode Commercial Summary — a proper subscription table
 * (owner complaint: "SaaS proposal has no commercial table"). Every rupee
 * figure is read straight off ModeResult/trace fields the engine already
 * computed — implementation, platform fee, Year-2+ renewal (engine2.ts's
 * priceCmSaas pushes exactly these trace steps). QUOTED totals are
 * deliberately overage-free (owner direction 2026-07-13: "One time,
 * implementation + per DP cost. That's all for CM SaaS") — overage never
 * appears as a row in this table; it is published only as a rate (see
 * includedDpNote / usageItemsTable), billed on actuals outside the quote.
 * The TOTAL row is still sourced straight from the engine's own
 * total_years_inr/total_tco_inr, not from summing these rows, so a future
 * engine change can never silently under- or over-state it. Blank-not-zero
 * (owner: "Fields not included in the pricing should be left empty"): every
 * cell with no charge in a year is the empty string, never 0.
 */
function subscriptionTable(p: ClientSafeProposal, result: ModeResult, listResult: ModeResult | undefined): RenderTable {
  const years = result.total_years_inr.length
  const columns = ['Component', ...Array.from({ length: years }, (_, i) => `Year ${i + 1}`), `${years}-Year TCO`]
  const trace = result.trace
  const platform = traceValue(trace, 'Platform fee (Year 1)') ?? 0
  const implementation = traceValue(trace, 'Implementation (one-time)') ?? 0
  const renewalStep = trace.find((s) => /^Year 2\+ renewal/.test(s.label))
  const renewal = renewalStep?.result ?? 0
  const renewalPctMatch = renewalStep?.label.match(/\(([\d.]+)% of platform\)/)
  const renewalPct = renewalPctMatch ? renewalPctMatch[1] : '30'
  const included = result.saas_included_dp ?? 0
  const B = blankIfZero

  const rows: (string | number)[][] = []

  // Implementation — one-time, Year 1 only.
  rows.push(['Implementation (one-time)', B(implementation), ...Array.from({ length: years - 1 }, () => ''), B(implementation)])

  // Platform fee — Year 1 only. Includes the tier's bundled DP count and
  // covers every consent action for those data principals; from Year 2 the
  // deal moves to the Annual renewal row below.
  rows.push([
    `Platform fee — includes ${included.toLocaleString('en-IN')} data principals, all consent actions (grant, ` +
      `revocation, modification, deletion, cookie consent)`,
    B(platform),
    ...Array.from({ length: years - 1 }, () => ''),
    B(platform),
  ])

  // Annual renewal — Year 2..N only, at the engine's y2_floor_pct of the
  // Year-1 platform fee. No overage row: overage is a published rate
  // (includedDpNote / the Usage-Based Items table), never a projected
  // amount in the quoted commercial table.
  if (years > 1) {
    rows.push([
      `Annual renewal — ${renewalPct}% of platform fee`,
      '',
      ...Array.from({ length: years - 1 }, () => B(renewal)),
      B(renewal * (years - 1)),
    ])
  }

  // Estate module lines (DSPM/DAM/Endpoint) — unchanged from the plain
  // Commercial Summary table, only relevant for Hybrid (SaaS is CM-only).
  for (const line of result.lines) {
    if (line.component_key === 'cm' || !line.included) continue
    rows.push([line.label, ...line.years_inr.map(B), B(line.tco_inr)])
  }

  const t = totalRowInputs(p, result, listResult)
  rows.push(
    ...discountTotalRows({
      label: 'TOTAL',
      years: t.years,
      netYears: t.netYears,
      tco: t.tco,
      netTco: t.netTco,
      discount_pct: p.inputs.discount_pct,
      discount_shown: p.discount_shown,
      overrides: t.overrides,
    }),
  )

  return { title: 'Commercial Summary (INR, exclusive of taxes)', columns, rows }
}

/** Dispatch: On-Prem keeps the plain per-component table; SaaS/Hybrid get
 * the subscription framing (fixes complaint 1: "SaaS proposal has no
 * commercial table"). Same section heading either way — only the shape of
 * the numbers underneath changes with the deployment mode. */
function commercialTable(p: ClientSafeProposal, result: ModeResult, listResult: ModeResult | undefined): RenderTable {
  return result.mode === 'onprem' ? commercialSummaryTable(p, result, listResult) : subscriptionTable(p, result, listResult)
}

/**
 * "Usage-Based Items (billed on actuals)" — billed outside the TCO, on
 * actuals (fixes complaint 4: the ₹1/OCR usage rate was missing from every
 * proposal). The per-DP overage row only applies to SaaS/Hybrid (On-Prem
 * has no per-user rate); the rate-card usage rates (OCR — see
 * RATE_CARD_SEED.usage_rates / clientSafe.ts's usage_rates plumbing) apply
 * to every deployment mode, since OCR processing is not mode-specific.
 * Returns undefined (section omitted) when there is nothing to show.
 */
function usageItemsTable(p: ClientSafeProposal, result: ModeResult): RenderTable | undefined {
  const rows: (string | number)[][] = []
  const rate = result.saas_per_user_rate
  if (rate !== undefined) {
    rows.push(['Additional data principals beyond the included bundle', 'per DP per year', formatPerUserRate(rate)])
  }
  for (const u of p.usage_rates ?? []) {
    rows.push([u.label, u.unit, formatINR(u.unit_price_inr)])
  }
  if (rows.length === 0) return undefined
  return { title: 'Usage-Based Items (billed on actuals)', columns: ['Item', 'Unit', 'Rate'], rows }
}

/**
 * Numbers each core section 1..N as it's appended — dynamic, not hardcoded,
 * so the "Sizing Estimate" section(s) (always present for a single-mode
 * build: platform sizing for SaaS/Hybrid, the inline infra BOM for On-Prem —
 * see sizing.ts) never leave a numbering gap or force every other heading to
 * be re-literaled by hand.
 */
function numberedSections(entries: RenderSection[]): RenderSection[] {
  return entries.map((s, i) => ({ ...s, heading: `${i + 1}. ${s.heading}` }))
}

function buildSingleMode(p: ClientSafeProposal, asOfDate: string): ProposalRenderModel {
  const result = p.results[0]
  const listResult = p.list_results?.[0]
  const mode = result.mode
  const driver = mode === 'onprem' ? ONPREM_PRICE_DRIVER : SAAS_HYBRID_PRICE_DRIVER
  const title = 'Commercial Proposal'

  const sizingSections = buildSizingSection(p, result)
  const includedNote = includedDpNote(p)
  const usageTable = usageItemsTable(p, result)

  const core = numberedSections([
    { heading: 'What You Get — Consent Manager (7 modules)', bullets: whatYouGetBullets() },
    { heading: 'Commercial Summary (INR, exclusive of taxes)', table: commercialTable(p, result, listResult) },
    ...(usageTable ? [{ heading: 'Usage-Based Items (billed on actuals)', table: usageTable }] : []),
    { ...buildInclusionsExclusionsSection(p), heading: 'Inclusions & Exclusions' },
    { heading: 'Scope & Coverage', table: scopeTable(p) },
    ...sizingSections,
    {
      heading: 'What Drives Your Price',
      paragraphs: [driver, ...(includedNote ? [includedNote] : [])],
      ...(includedNote ? { bullets: [CONSENT_MODIFICATION_CAVEAT] } : {}),
    },
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
    return line.included ? blankIfZero(line[metric]) : 'On-Prem / Hybrid only'
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

  // Per-mode list-vs-negotiated tuple (worksheet overrides only ever apply
  // to the single deployment mode being edited, but the same
  // pricing_overrides map is applied uniformly to all three compare-mode
  // results by wizardLogic.buildRecord, so this reads identically here).
  const listFor = (mode: DeploymentMode): ModeResult | undefined => p.list_results?.find((r) => r.mode === mode)
  const tOnprem = totalRowInputs(p, onprem, listFor('onprem'))
  const tHybrid = totalRowInputs(p, hybrid, listFor('hybrid'))
  const tSaas = totalRowInputs(p, saas, listFor('saas'))
  const overridesOn = tOnprem.overrides || tHybrid.overrides || tSaas.overrides

  // discountTotalRows is generic over "one column per array entry" — reused
  // here with one column per MODE (On-Prem/Hybrid/SaaS) instead of one
  // column per year, so the exact same List/Adjustment/Negotiated (or
  // List/Discount/Net) three-row pattern renders in the compare table too.
  const compareTotalRows = (label: string, list: number[], net: number[]): (string | number)[][] =>
    discountTotalRows({
      label,
      years: list,
      netYears: net,
      discount_pct: p.inputs.discount_pct,
      discount_shown: p.discount_shown,
      overrides: overridesOn,
    })

  rows.push(
    ...compareTotalRows(
      'Total Year 1',
      [tOnprem.year1, tHybrid.year1, tSaas.year1],
      [tOnprem.netYear1, tHybrid.netYear1, tSaas.netYear1],
    ),
  )
  rows.push(
    ...compareTotalRows(
      'Total Annual',
      [tOnprem.recurring, tHybrid.recurring, tSaas.recurring],
      [tOnprem.netRecurring, tHybrid.netRecurring, tSaas.netRecurring],
    ),
  )
  rows.push(
    ...compareTotalRows(`${years}-Year TCO`, [tOnprem.tco, tHybrid.tco, tSaas.tco], [tOnprem.netTco, tHybrid.netTco, tSaas.netTco]),
  )

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
