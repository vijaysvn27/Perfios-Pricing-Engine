// "Sizing Estimate" section (Honda "DSPM DAM Sizing" pattern): a transparent
// count x rate breakdown for selected estate modules, plus SaaS/Hybrid
// platform sizing (committed base, tier, per-user rate, Year-2+ rule) and,
// for On-Prem, a pointer to the "Infrastructure You Provide" annexure. Shown
// only when there is something to size: an estate module is selected, or the
// deployment mode itself carries a transparent per-user rate (SaaS/Hybrid).
// CM-only On-Prem has nothing new to add here (its infra is already covered
// by the BOM annexure, without a sizing narrative), so the section is absent.
import type { ClientSafeProposal } from '../clientSafe'
import { BOM_NOTES } from '../bomData'
import type { DeploymentMode, ModeResult, TraceStep } from '../../engine2/types'
import { findLine, formatPerUserRate, includedDpNote, year2RuleNote } from './shared'
import type { RenderSection, RenderTable } from './types'

// The consent governance bridge sits on the client's premises in EVERY
// hosted mode — including SaaS. Source: Olivia, Vi documentation call
// 2026-07-07: "even in SaaS the consent bridge will always be a part of
// their premise, because the consent bridge is the one that talks to data;
// without that bridge, even with SaaS you will not be able to maintain the
// governance." Do not "simplify" SaaS to zero client footprint.
function hostingFootprint(mode: DeploymentMode): string {
  return mode === 'hybrid'
    ? 'Perfios-hosted, India region; the consent governance bridge and the data-security components run on your premises.'
    : 'Perfios-hosted, India region; a lightweight consent governance bridge runs on your premises to enforce consent against your systems.'
}

function anyEstateModuleSelected(p: ClientSafeProposal): boolean {
  const { dspm, dam, endpoint } = p.inputs.modules
  return dspm || dam || endpoint
}

/** Whether the "Sizing Estimate" section has anything to show: a selected
 * estate module, or a deployment mode (SaaS/Hybrid) with a transparent
 * per-user platform rate to publish. */
export function showSizingEstimate(p: ClientSafeProposal): boolean {
  return anyEstateModuleSelected(p) || p.inputs.deployment_mode !== 'onprem'
}

/** "Estate Considered" table: one row per sizing line (already filtered to
 * non-zero quantities of selected modules — see wizardLogic.buildSizingLines),
 * plus a Subtotal row. Count is rendered as a plain grouped string (not a
 * number) so the generic table renderers — which currency-format every
 * numeric cell — don't stamp a rupee symbol on a unit count. */
function estateConsideredTable(p: ClientSafeProposal): RenderTable | undefined {
  const lines = p.sizing_lines ?? []
  if (lines.length === 0) return undefined
  const rows: (string | number)[][] = lines.map((l) => [
    l.label,
    l.qty.toLocaleString('en-IN'),
    l.unit_rate_inr,
    l.annual_inr,
  ])
  const subtotal = lines.reduce((sum, l) => sum + l.annual_inr, 0)
  rows.push(['Subtotal', '', '', subtotal])
  return { title: 'Estate Considered', columns: ['Driver', 'Count', 'Unit Rate (₹)', 'Annual (₹)'], rows }
}

/** Extracts the matched SaaS/Hybrid tier label out of the trace's "SaaS
 * tier" step (engine2 always pushes this for saas/hybrid pricing), the same
 * way shared.ts's year2RuleNote reads its floor percentage out of the trace
 * rather than re-deriving it. */
function tierLabel(trace: TraceStep[]): string | undefined {
  const step = trace.find((s) => s.label === 'SaaS tier')
  return step?.formula.match(/→ tier (.+?) \(/)?.[1]
}

function platformSizingParagraphs(p: ClientSafeProposal, result: ModeResult): string[] {
  const tier = tierLabel(result.trace)
  const perUserRate = result.saas_per_user_rate
  const includedNote = includedDpNote(p)
  return [
    `Committed base: ${p.inputs.dp_base_y1.toLocaleString('en-IN')} data principals${tier ? ` (${tier} tier)` : ''}`,
    hostingFootprint(p.inputs.deployment_mode),
    ...(includedNote ? [includedNote] : []),
    ...(perUserRate !== undefined ? [`Per-user rate: ${formatPerUserRate(perUserRate)} per user per year`] : []),
    year2RuleNote(result.trace),
  ]
}

function onPremPointerParagraph(): string {
  return `See the "Infrastructure You Provide" annexure for the full on-prem hardware sizing. ${BOM_NOTES}`
}

/** Build the "Sizing Estimate" section, or undefined when there's nothing to
 * size (CM-only On-Prem). `result` is the single priced mode this format is
 * rendering for (single-mode Perfios format only — compare mode's three
 * simultaneous modes have no one deployment_mode to key the platform-sizing
 * / on-prem-pointer branch off, so it does not get this section). */
export function buildSizingSection(p: ClientSafeProposal, result: ModeResult): RenderSection | undefined {
  if (!showSizingEstimate(p)) return undefined
  // findLine asserts the CM line exists; called for its side effect of
  // failing loudly if a future mode ever ships a result without one.
  findLine(result, 'cm')
  const mode = p.inputs.deployment_mode
  const table = estateConsideredTable(p)
  const paragraphs: string[] = []
  if (mode === 'saas' || mode === 'hybrid') paragraphs.push(...platformSizingParagraphs(p, result))
  if (mode === 'onprem') paragraphs.push(onPremPointerParagraph())

  return {
    heading: 'Sizing Estimate',
    ...(table ? { table } : {}),
    ...(paragraphs.length > 0 ? { paragraphs } : {}),
  }
}
