// "Sizing Estimate" section (Honda "DSPM DAM Sizing" pattern): a transparent
// count x rate breakdown for selected estate modules, plus SaaS/Hybrid
// platform sizing (committed base, tier, per-user rate, Year-2+ rule) and,
// for On-Prem, the ACTUAL "Infrastructure You Provide" BOM inline (owner
// feedback 2026-07-13: infra sizing must appear IN the proposal body, not
// just be pointed at via an annexure). Hybrid keeps its estate infra as a
// standing TBD, confirmed with the data-security partner during
// implementation — the Consentick BOM is the CM On-Prem BOM, and in Hybrid
// the CM is Perfios-hosted, so that BOM does not apply there.
import type { ClientSafeProposal } from '../clientSafe'
import { BOM_NOTES, bomForDpBase } from '../bomData'
import type { BomRow } from '../bomData'
import type { DeploymentMode, ModeResult, TraceStep } from '../../engine2/types'
import { blankIfZero, findLine, formatINR, formatPerUserRate, traceValue, year2RuleNote } from './shared'
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
    blankIfZero(l.unit_rate_inr),
    blankIfZero(l.annual_inr),
  ])
  const subtotal = lines.reduce((sum, l) => sum + l.annual_inr, 0)
  rows.push(['Subtotal', '', '', blankIfZero(subtotal)])
  return { title: 'Estate Considered', columns: ['Driver', 'Count', 'Unit Rate (₹)', 'Annual (₹)'], rows }
}

/** Extracts the matched SaaS/Hybrid tier label out of the trace's "SaaS
 * tier" step (engine2 always pushes this for saas/hybrid pricing) rather
 * than re-deriving it. */
function tierLabel(trace: TraceStep[]): string | undefined {
  const step = trace.find((s) => s.label === 'SaaS tier')
  return step?.formula.match(/→ tier (.+?) \(/)?.[1]
}

function platformSizingParagraphs(p: ClientSafeProposal, result: ModeResult): string[] {
  const tier = tierLabel(result.trace)
  const perUserRate = result.saas_per_user_rate
  const included = result.saas_included_dp
  const dpY1 = p.inputs.dp_base_y1
  const y1Overage = traceValue(result.trace, 'Year 1 overage')
  const paragraphs = [
    `Your Year-1 base: ${dpY1.toLocaleString('en-IN')} data principals${tier ? ` (${tier} tier)` : ''}`,
    ...(included !== undefined
      ? [`Included DP bundle: ${included.toLocaleString('en-IN')} data principals in the Year-1 platform fee.`]
      : []),
    hostingFootprint(p.inputs.deployment_mode),
    ...(perUserRate !== undefined ? [`Per-user rate: ${formatPerUserRate(perUserRate)} per user per year`] : []),
    ...(y1Overage !== undefined && y1Overage > 0 && included !== undefined && perUserRate !== undefined
      ? [
          `Year-1 overage: ${(dpY1 - included).toLocaleString('en-IN')} data principals beyond the bundle × ` +
            `${formatPerUserRate(perUserRate)} = ${formatINR(y1Overage)}.`,
        ]
      : []),
    year2RuleNote(result.trace),
  ]
  if (p.inputs.deployment_mode === 'hybrid') {
    paragraphs.push(
      'On-premise footprint for the data-security components (DSPM/DAM) is confirmed with our data security ' +
        'partner during implementation planning.',
    )
  }
  return paragraphs
}

/** BOM_NOTES (DR strategy, RPO/RTO, traffic-model assumption) plus the
 * standing "figures are reference architecture" caveat — accompanies the
 * On-Prem BOM tables inline in the proposal body. */
function onPremSizingParagraphs(): string[] {
  return [
    BOM_NOTES,
    'Final sizing is confirmed during implementation planning; figures are the reference architecture for your ' +
      'committed data-principal base.',
  ]
}

/** One BOM table section — Nodes/vCPU/RAM rendered as strings (not numbers)
 * so the generic table renderers don't currency-format a hardware count the
 * same way estateConsideredTable's Count column avoids it. */
function bomTableSection(heading: string, rows: BomRow[]): RenderSection {
  const table: RenderTable = {
    title: heading,
    columns: ['Component', 'Nodes', 'vCPU/node', 'RAM GB/node', 'Storage/node'],
    rows: rows.map((r) => [r.component, String(r.nodes), String(r.vcpu), String(r.ram_gb), r.storage]),
  }
  return { heading, table }
}

/** The two On-Prem BOM annexure sections — "Primary Site" and "Cold DR
 * Site" — sized off the tier matching the deal's committed Year-1 base
 * (bomForDpBase, same "first cap that fits" rule engine2 uses for pricing). */
function onPremBomSections(p: ClientSafeProposal): RenderSection[] {
  const rows = bomForDpBase(p.inputs.dp_base_y1)
  const primary = rows.filter((r) => r.site === 'primary')
  const dr = rows.filter((r) => r.site === 'dr')
  return [bomTableSection('Primary Site — Infrastructure You Provide', primary), bomTableSection('Cold DR Site', dr)]
}

/**
 * Build the "Sizing Estimate" section(s): the transparent sizing narrative
 * (SaaS/Hybrid platform sizing, or the On-Prem BOM caveat) and Estate
 * Considered table, always as the first entry — followed, for pure On-Prem
 * deals only, by the two "Infrastructure You Provide" BOM tables (Primary
 * Site, Cold DR Site) inline in the proposal body. Hybrid never gets the CM
 * On-Prem BOM (its CM is Perfios-hosted); its estate infra is called out as
 * a standing TBD confirmed with the data-security partner during
 * implementation. `result` is the single priced mode this format is
 * rendering for (single-mode Perfios format only — compare mode's three
 * simultaneous modes have no one deployment_mode to key this off, so it
 * does not get this section).
 */
export function buildSizingSection(p: ClientSafeProposal, result: ModeResult): RenderSection[] {
  // findLine asserts the CM line exists; called for its side effect of
  // failing loudly if a future mode ever ships a result without one.
  findLine(result, 'cm')
  const mode = p.inputs.deployment_mode
  const table = estateConsideredTable(p)
  const paragraphs: string[] = []
  if (mode === 'saas' || mode === 'hybrid') paragraphs.push(...platformSizingParagraphs(p, result))
  if (mode === 'onprem') paragraphs.push(...onPremSizingParagraphs())

  const mainSection: RenderSection = {
    heading: 'Sizing Estimate',
    ...(table ? { table } : {}),
    ...(paragraphs.length > 0 ? { paragraphs } : {}),
  }

  return mode === 'onprem' ? [mainSection, ...onPremBomSections(p)] : [mainSection]
}
