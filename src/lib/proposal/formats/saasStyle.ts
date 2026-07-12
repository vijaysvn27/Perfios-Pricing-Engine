// "SaaS-style": subscription framing — platform fee / implementation /
// committed base / overage up front, then what's included, then an annual
// cost table (no TCO column; this format is about the recurring rhythm, not
// a lump-sum horizon).
import type { ClientSafeProposal } from '../clientSafe'
import { discountTotalRows, findLine, formatINR, netYearsOf, overageNote, traceValue, whatYouGetBullets } from './shared'
import type { ProposalRenderModel, RenderTable } from './types'

const TITLE = 'Your Subscription'

export function build(p: ClientSafeProposal): ProposalRenderModel {
  const result = p.results[0]
  const cm = findLine(result, 'cm')
  const years = result.total_years_inr.length
  const d = p.inputs.discount_pct

  // "Platform fee (annual)" and "Implementation (one-time)" are only pushed
  // to the trace for SaaS/hybrid CM pricing; on-prem falls back to the CM
  // line's own recurring/one-time figures so the section still renders.
  const platformFee = traceValue(result.trace, 'Platform fee (annual)') ?? cm.recurring_inr
  const implementation = traceValue(result.trace, 'Implementation (one-time)') ?? cm.one_time_inr

  const subscriptionParagraphs = [
    `Platform fee: ${formatINR(platformFee)} / year`,
    `Implementation (one-time): ${formatINR(implementation)}`,
    `Committed base: ${p.inputs.dp_base_y1.toLocaleString('en-IN')} data principals`,
    overageNote(result.trace, p.inputs.dp_base_y1, p.inputs.dp_base_y2),
  ]

  const columns = ['Component', ...Array.from({ length: years }, (_, i) => `Year ${i + 1}`)]
  const rows: (string | number)[][] = result.lines.filter((l) => l.included).map((l) => [l.label, ...l.years_inr])
  const netYears = netYearsOf(result.total_years_inr, d)
  rows.push(
    ...discountTotalRows({
      label: 'TOTAL',
      years: result.total_years_inr,
      netYears,
      discount_pct: d,
      discount_shown: p.discount_shown,
    }),
  )
  const table: RenderTable = { title: `Annual Cost Over ${years} Years`, columns, rows }

  return {
    title: TITLE,
    subtitle: `Prepared for ${p.customer_name} — valid ${p.validity_days} days`,
    sections: [
      { heading: 'Your Subscription', paragraphs: subscriptionParagraphs },
      { heading: "What's Included", bullets: whatYouGetBullets() },
      { heading: `Annual Cost Over ${years} Years`, table },
    ],
  }
}
