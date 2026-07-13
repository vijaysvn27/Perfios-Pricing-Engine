// "SaaS-style": subscription framing — committed base / per-user rate /
// Year-1 total / the Year-2+ rule up front, then what's included, then an
// annual cost table (no TCO column; this format is about the recurring
// rhythm, not a lump-sum horizon). Per-user methodology decided on the Vi -
// Documentation leadership call, 2026-07-07 (Olivia Mukhopadhyay).
import type { ClientSafeProposal } from '../clientSafe'
import { narrativeSections } from '../narrative'
import { buildCover } from './cover'
import { buildInclusionsExclusionsSection } from './inclusions'
import {
  CONSENT_MODIFICATION_CAVEAT,
  discountTotalRows,
  findLine,
  formatINR,
  formatPerUserRate,
  includedDpNote,
  netYearsOf,
  traceValue,
  whatYouGetBullets,
  year2RuleNote,
} from './shared'
import type { ProposalRenderModel, RenderTable } from './types'

const TITLE = 'Your Subscription'

export function build(p: ClientSafeProposal, asOfDate: string): ProposalRenderModel {
  const result = p.results[0]
  const cm = findLine(result, 'cm')
  const years = result.total_years_inr.length
  const d = p.inputs.discount_pct

  // "Platform fee (annual)" and "Implementation (one-time)" are only pushed
  // to the trace for SaaS/hybrid CM pricing; on-prem falls back to the CM
  // line's own recurring/one-time figures so the section still renders.
  const platformFee = traceValue(result.trace, 'Platform fee (annual)') ?? cm.recurring_inr
  const implementation = traceValue(result.trace, 'Implementation (one-time)') ?? cm.one_time_inr
  const perUserRate = result.saas_per_user_rate
  const includedNote = includedDpNote(p)

  const subscriptionParagraphs = [
    `Committed base: ${p.inputs.dp_base_y1.toLocaleString('en-IN')} data principals`,
    ...(perUserRate !== undefined ? [`Per-user rate: ${formatPerUserRate(perUserRate)} per user per year`] : []),
    `Platform fee (annual): ${formatINR(platformFee)}`,
    `Implementation (one-time): ${formatINR(implementation)}`,
    `Year 1 total: ${formatINR(cm.year1_inr)}`,
    year2RuleNote(result.trace),
  ]

  const columns = ['Component', ...Array.from({ length: years }, (_, i) => `Year ${i + 1}`)]
  // Dynamic only: only included component lines render (see moduleWise.ts).
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
    cover: buildCover(p, asOfDate, TITLE),
    sections: [
      ...narrativeSections(p),
      {
        heading: 'Your Subscription',
        paragraphs: subscriptionParagraphs,
        ...(perUserRate !== undefined
          ? { bullets: [...(includedNote ? [includedNote] : []), CONSENT_MODIFICATION_CAVEAT] }
          : {}),
      },
      { heading: "What's Included", bullets: whatYouGetBullets() },
      { heading: `Annual Cost Over ${years} Years`, table },
      buildInclusionsExclusionsSection(p),
    ],
  }
}
