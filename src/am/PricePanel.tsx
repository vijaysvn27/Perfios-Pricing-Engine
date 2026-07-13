// Persistent live price panel: recomputes price() / priceAllModes() on every
// input change and renders Year 1 / Year 2+ / N-yr TCO plus the expandable
// "How this price is calculated" trace (§6 of the revamp design — no hidden
// math). All arithmetic stays in engine2; net Year-2+ uses the same rounding
// helper the format builders use.
import { useMemo, useState } from 'react'
import { price, priceAllModes } from '../lib/engine2/engine2'
import type { DeploymentMode, ModeResult, RateCard, TraceStep } from '../lib/engine2/types'
import { formatINR } from '../lib/format'
import { fmtPct, netYearsOf } from '../lib/proposal/formats/shared'
import { rateCardSourceChipLabel, type RateCardSource } from '../lib/rateCard/repo'
import type { ProposalInputs } from '../lib/proposal/proposalsRepo'
import { MODE_LABELS } from './wizardLogic'

interface Props {
  card: RateCard
  version: number
  source: RateCardSource
  inputs: ProposalInputs
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

function SingleModeTotals({ result, discountPct }: { result: ModeResult; discountPct: number }) {
  const years = result.total_years_inr.length
  const discounted = discountPct > 0
  const netRecurring = netYearsOf([result.total_recurring_inr], discountPct)[0]
  return (
    <div className="space-y-1.5">
      <BigNumber label="Year 1" value={discounted ? result.net_total_year1_inr : result.total_year1_inr} />
      <BigNumber label="Year 2+ (annual)" value={discounted ? netRecurring : result.total_recurring_inr} />
      <div className="border-t border-slate-100 pt-1.5">
        <BigNumber
          label={`${years}-yr TCO${discounted ? ' (net)' : ''}`}
          value={discounted ? result.net_total_tco_inr : result.total_tco_inr}
        />
      </div>
      {discounted && (
        <p className="text-xs text-slate-400">
          List TCO {formatINR(result.total_tco_inr)} less {fmtPct(discountPct)} discount.
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

export default function PricePanel({ card, version, source, inputs }: Props) {
  const [traceOpen, setTraceOpen] = useState(false)

  const compare = inputs.compare_all_modes
  const all = useMemo(() => (compare ? priceAllModes(card, inputs) : null), [compare, card, inputs])
  const single = useMemo(() => (compare ? null : price(card, inputs)), [compare, card, inputs])

  // The trace always follows the currently selected deployment mode, even in
  // compare view — that is the mode the AM is actively shaping.
  const traced = compare && all ? all[inputs.deployment_mode] : single
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
        single && <SingleModeTotals result={single} discountPct={inputs.discount_pct} />
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
