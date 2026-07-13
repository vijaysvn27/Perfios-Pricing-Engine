// Persistent live price panel: renders Year 1 / Year 2+ / N-yr TCO plus the
// expandable "How this price is calculated" trace (§6 of the revamp design —
// no hidden math). Single-mode pricing comes in precomputed from
// ProposalWizard (`listResult`, the same price() output the Pricing
// Worksheet edits against — never priced twice); compare mode still runs
// priceAllModes here. Worksheet overrides (inputs.pricing_overrides) are
// layered on via applyPricingOverrides, so the panel always shows the
// NEGOTIATED totals with a muted "list ₹X" line when any cell was edited.
import { useMemo, useState } from 'react'
import { priceAllModes } from '../lib/engine2/engine2'
import type { DeploymentMode, ModeResult, RateCard, TraceStep } from '../lib/engine2/types'
import { formatINR } from '../lib/format'
import { fmtPct, netYearsOf } from '../lib/proposal/formats/shared'
import { applyPricingOverrides, hasOverrides, listVsNegotiated } from '../lib/proposal/pricingOverrides'
import { rateCardSourceChipLabel, type RateCardSource } from '../lib/rateCard/repo'
import type { ProposalInputs } from '../lib/proposal/proposalsRepo'
import { MODE_LABELS } from './wizardLogic'

interface Props {
  card: RateCard
  version: number
  source: RateCardSource
  inputs: ProposalInputs
  /** Single-mode LIST result, priced once in ProposalWizard (shared with the
   * Step-3 worksheet). Null in compare mode. */
  listResult: ModeResult | null
}

const MODES: DeploymentMode[] = ['onprem', 'hybrid', 'saas']

/**
 * Renders a trace step's result by its `kind` (added after a client meeting
 * exposed a DP bundle count rendering as "₹3,00,000" instead of a plain
 * count — 2026-07-13, CM Calculator call with Rohit): 'count' is a plain
 * grouped number of data principals, 'rate' a per-DP-per-year rupee rate,
 * 'usd' a monthly dollar figure; 'inr' (or no kind at all — most steps)
 * falls back to the existing ₹ Indian-grouped render.
 */
function formatTraceResult(step: TraceStep): string {
  switch (step.kind) {
    case 'count':
      return `${step.result.toLocaleString('en-IN')} DPs`
    case 'rate':
      return `₹${step.result.toLocaleString('en-IN')}/DP/yr`
    case 'usd':
      return `$${step.result.toLocaleString('en-IN')}/mo`
    default:
      return formatINR(step.result)
  }
}

function TraceList({ trace }: { trace: TraceStep[] }) {
  return (
    <ol className="mt-2 space-y-2">
      {trace.map((step, i) => (
        <li key={i} className="rounded-md bg-slate-50 px-2 py-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-700">{step.label}</span>
            <span className="shrink-0 text-xs tabular-nums text-perfios-blue">{formatTraceResult(step)}</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-400">{step.formula}</div>
        </li>
      ))}
    </ol>
  )
}

function BigNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-slate-800">{formatINR(value)}</span>
    </div>
  )
}

/**
 * Single-mode totals. `list` is the pre-worksheet engine result; `negotiated`
 * is applyPricingOverrides(list, overrides) when the AM edited any worksheet
 * cell, else null. With worksheet edits, negotiated totals lead and a muted
 * "list ₹X" line follows (via the shared listVsNegotiated helper — the same
 * numbers the formats' List/Adjustment/Negotiated rows use). Without edits,
 * the legacy discount_pct display is unchanged.
 */
function SingleModeTotals({
  list,
  negotiated,
  discountPct,
}: {
  list: ModeResult
  negotiated: ModeResult | null
  discountPct: number
}) {
  const years = list.total_years_inr.length
  if (negotiated) {
    const lvn = listVsNegotiated(list, negotiated)
    return (
      <div className="space-y-1.5">
        <BigNumber label="Year 1" value={lvn.negotiated_y1} />
        <BigNumber label="Year 2+ (annual)" value={negotiated.total_recurring_inr} />
        <div className="border-t border-slate-100 pt-1.5">
          <BigNumber label={`${years}-yr TCO (negotiated)`} value={lvn.negotiated_tco} />
        </div>
        <p className="text-xs text-slate-400">
          List TCO {formatINR(lvn.list_tco)} · list Year 1 {formatINR(lvn.list_y1)} — worksheet-negotiated pricing.
        </p>
      </div>
    )
  }
  const discounted = discountPct > 0
  const netRecurring = netYearsOf([list.total_recurring_inr], discountPct)[0]
  return (
    <div className="space-y-1.5">
      <BigNumber label="Year 1" value={discounted ? list.net_total_year1_inr : list.total_year1_inr} />
      <BigNumber label="Year 2+ (annual)" value={discounted ? netRecurring : list.total_recurring_inr} />
      <div className="border-t border-slate-100 pt-1.5">
        <BigNumber
          label={`${years}-yr TCO${discounted ? ' (net)' : ''}`}
          value={discounted ? list.net_total_tco_inr : list.total_tco_inr}
        />
      </div>
      {discounted && (
        <p className="text-xs text-slate-400">
          List TCO {formatINR(list.total_tco_inr)} less {fmtPct(discountPct)} discount.
        </p>
      )}
    </div>
  )
}

function CompareTotals({ all, discountPct }: { all: Record<DeploymentMode, ModeResult>; discountPct: number }) {
  const discounted = discountPct > 0
  const years = all.onprem.total_years_inr.length
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-slate-400">
          <th className="py-1 font-medium">Mode</th>
          <th className="py-1 text-right font-medium">Year 1</th>
          <th className="py-1 text-right font-medium">{`${years}-yr TCO${discounted ? ' (net)' : ''}`}</th>
        </tr>
      </thead>
      <tbody>
        {MODES.map((m) => {
          const r = all[m]
          return (
            <tr key={m} className="border-t border-slate-100">
              <td className="py-1 text-slate-600">{MODE_LABELS[m]}</td>
              <td className="py-1 text-right tabular-nums text-slate-800">
                {formatINR(discounted ? r.net_total_year1_inr : r.total_year1_inr)}
              </td>
              <td className="py-1 text-right tabular-nums font-semibold text-slate-800">
                {formatINR(discounted ? r.net_total_tco_inr : r.total_tco_inr)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function PricePanel({ card, version, source, inputs, listResult }: Props) {
  const [traceOpen, setTraceOpen] = useState(false)

  const compare = inputs.compare_all_modes
  const all = useMemo(() => (compare ? priceAllModes(card, inputs) : null), [compare, card, inputs])
  // Single-mode LIST result arrives precomputed (ProposalWizard prices once
  // for both this panel and the Step-3 worksheet); the negotiated view is
  // layered on top only when a worksheet cell was actually edited.
  const single = compare ? null : listResult
  const negotiated = useMemo(
    () => (single && hasOverrides(inputs.pricing_overrides) ? applyPricingOverrides(single, inputs.pricing_overrides) : null),
    [single, inputs.pricing_overrides],
  )

  // The trace always follows the currently selected deployment mode, even in
  // compare view — that is the mode the AM is actively shaping. With
  // worksheet edits, the negotiated trace is shown: it carries one
  // "Negotiated price" step per edited cell on top of the engine's steps.
  const traced = compare && all ? all[inputs.deployment_mode] : (negotiated ?? single)
  const sourceChipLabel = rateCardSourceChipLabel(source)

  return (
    <aside className="sticky top-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-perfios-blue">Live price</h3>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            rate card v{version}
          </span>
          {sourceChipLabel && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                source === 'seed' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
              }`}
            >
              {sourceChipLabel}
            </span>
          )}
        </div>
      </div>

      {compare && all ? (
        <CompareTotals all={all} discountPct={inputs.discount_pct} />
      ) : (
        single && <SingleModeTotals list={single} negotiated={negotiated} discountPct={inputs.discount_pct} />
      )}

      {traced && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <button
            type="button"
            onClick={() => setTraceOpen((o) => !o)}
            className="flex w-full items-center justify-between text-left text-xs font-medium text-perfios-blue hover:underline"
          >
            <span>How this price is calculated{compare ? ` (${MODE_LABELS[inputs.deployment_mode]})` : ''}</span>
            <span aria-hidden="true">{traceOpen ? '−' : '+'}</span>
          </button>
          {traceOpen && <TraceList trace={traced.trace} />}
        </div>
      )}
    </aside>
  )
}
