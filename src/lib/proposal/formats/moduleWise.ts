// "Commercial Summary — Module-wise": the pricing-engine-style layout — one
// row per included component (CM, DSPM, DAM, Endpoint), Year 1..Year N
// columns + N-Year TCO, a TOTAL row, and a one-time-vs-recurring note.
import type { ClientSafeProposal } from '../clientSafe'
import { narrativeSections } from '../narrative'
import { buildCover } from './cover'
import { buildInclusionsExclusionsSection } from './inclusions'
import { blankIfZero, discountTotalRows, formatINR, netYearsOf } from './shared'
import type { ProposalRenderModel, RenderSection, RenderTable } from './types'

const TITLE = 'Commercial Summary — Module-wise'

const ATTRIBUTION_TITLE = 'Where Each Capability Is Priced'

/** Scope note for the DSPM/DAM/Endpoint rows — dynamic, mirrors the "in scope
 * / add-on" logic inclusions.ts uses for exclusion bullets: SaaS is CM-only,
 * so every estate module reads as not-in-scope there regardless of toggles. */
function scopeNote(p: ClientSafeProposal, key: 'dspm' | 'dam' | 'endpoint'): string {
  const inScope = p.inputs.deployment_mode !== 'saas' && p.inputs.modules[key]
  return inScope ? 'In current scope.' : 'Not in current scope — available as an add-on.'
}

/** DPIA can only run fully automated when DSPM or DAM feeds it discovery
 * data (owner feedback: "DPIA cannot be delivered standalone in CM-only
 * deals") — mirrors inclusions.ts's dpiaAutomated rule. */
function dpiaNote(p: ClientSafeProposal): string {
  const automated = p.inputs.deployment_mode !== 'saas' && (p.inputs.modules.dspm || p.inputs.modules.dam)
  return automated
    ? 'Bundled — DPIA delivered in full (DSPM/DAM discovery feeds the assessment).'
    : 'Bundled — questionnaire-based DPIA only; full automated DPIA requires DSPM/DAM in scope.'
}

/**
 * "Where Each Capability Is Priced" — answers the module-based pricing
 * question an AM gets from clients ("what does ROPA/DPAR cost?"): every named
 * capability, which line item it's actually priced under, and — for the
 * estate modules — whether it's in scope for this deal. The 7 CM capabilities
 * and the RoPA/lineage row are static (bundling never changes by deal); the
 * DSPM/DAM/Endpoint rows always render, with the Notes column reflecting
 * `inputs.modules` for this specific deal.
 */
function buildAttributionSection(p: ClientSafeProposal): RenderSection {
  const rows: (string | number)[][] = [
    ['Consent Notice & Templates', 'Consent Manager', 'Bundled, all 7 modules in one price.'],
    ['Data Principal Rights Portal (DPAR)', 'Consent Manager', 'Bundled.'],
    ['Cookie Consent Manager', 'Consent Manager', 'Bundled.'],
    ['Consent Governance (Consent Bridge)', 'Consent Manager', 'Bundled.'],
    ['Consent Breach Module', 'Consent Manager', 'Bundled.'],
    ['Vendor / Third-Party Module', 'Consent Manager', 'Bundled.'],
    ['Data Privacy Risk Assessment (DPIA)', 'Consent Manager', dpiaNote(p)],
    ['Data lineage & automated RoPA', 'DSPM / DAM', 'Delivered with those modules; no standalone charge.'],
    ['DSPM (discovery & classification)', 'Priced line — per-unit estate rates', scopeNote(p, 'dspm')],
    ['DAM (database activity monitoring)', 'Priced line — per-unit estate rates', scopeNote(p, 'dam')],
    ['Endpoint Discovery / DLP', 'Priced line — per-device', scopeNote(p, 'endpoint')],
  ]
  const table: RenderTable = { title: ATTRIBUTION_TITLE, columns: ['Capability', 'Priced Under', 'Notes'], rows }
  return { heading: ATTRIBUTION_TITLE, table }
}

export function build(p: ClientSafeProposal, asOfDate: string): ProposalRenderModel {
  const result = p.results[0]
  const years = result.total_years_inr.length
  const d = p.inputs.discount_pct

  const columns = ['Component', ...Array.from({ length: years }, (_, i) => `Year ${i + 1}`), `${years}-Year TCO`]

  // Dynamic only: zero-value rows for unselected modules never render —
  // `included` is false for every component the AM didn't select (engine2
  // sets it from the computed base, so this can never drift from scope).
  const rows: (string | number)[][] = result.lines
    .filter((l) => l.included)
    .map((l) => [l.label, ...l.years_inr.map(blankIfZero), blankIfZero(l.tco_inr)])

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

  const table: RenderTable = { title: TITLE, columns, rows }

  const note = `Of the Year 1 total, ${formatINR(result.total_one_time_inr)} is one-time (licence/implementation + deployment), paid once. Everything else recurs annually.`

  return {
    title: TITLE,
    subtitle: `Prepared for ${p.customer_name} — valid ${p.validity_days} days`,
    cover: buildCover(p, asOfDate, TITLE),
    sections: [
      ...narrativeSections(p),
      { heading: TITLE, table, paragraphs: [note] },
      buildAttributionSection(p),
      buildInclusionsExclusionsSection(p),
    ],
  }
}
