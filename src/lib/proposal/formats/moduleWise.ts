// "Commercial Summary — Module-wise": the pricing-engine-style layout — one
// row per included component (CM, DSPM, DAM, Endpoint), Year 1..Year N
// columns + N-Year TCO, a TOTAL row, and a one-time-vs-recurring note.
import type { ClientSafeProposal } from '../clientSafe'
import { narrativeSections } from '../narrative'
import { buildCover } from './cover'
import { buildInclusionsExclusionsSection } from './inclusions'
import { discountTotalRows, formatINR, netYearsOf } from './shared'
import type { ProposalRenderModel, RenderTable } from './types'

const TITLE = 'Commercial Summary — Module-wise'

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

  const table: RenderTable = { title: TITLE, columns, rows }

  const note = `Of the Year 1 total, ${formatINR(result.total_one_time_inr)} is one-time (licence/implementation + deployment), paid once. Everything else recurs annually.`

  return {
    title: TITLE,
    subtitle: `Prepared for ${p.customer_name} — valid ${p.validity_days} days`,
    cover: buildCover(p, asOfDate, TITLE),
    sections: [
      ...narrativeSections(p),
      { heading: TITLE, table, paragraphs: [note] },
      buildInclusionsExclusionsSection(p),
    ],
  }
}
