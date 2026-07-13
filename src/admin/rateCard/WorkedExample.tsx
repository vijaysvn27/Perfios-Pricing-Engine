import { useMemo, useState } from 'react'
import { price } from '../../lib/engine2/engine2'
import type { DealInputs, DeploymentMode, RateCard, TraceStep } from '../../lib/engine2/types'
import { formatINR } from '../../lib/format'
import { card, inp, toNum } from '../styles'
import { buildSampleDeal } from './helpers'

interface Props {
  /** The CURRENT draft — every rate edit recomputes this rail immediately. */
  draft: RateCard
}

const QTY_INPUTS: { key: string; label: string }[] = [
  { key: 'database', label: 'Databases' },
  { key: 'cloud_connector', label: 'Cloud connectors' },
  { key: 'gdrive_user', label: 'GDrive/OneDrive users' },
  { key: 'dam_dataset', label: 'DAM datasets' },
  { key: 'endpoint_device', label: 'Endpoint devices' },
]

// ---------------------------------------------------------------------------
// Trace rendering (2026-07-13, after a client meeting exposed a DP bundle
// count rendering as "₹3,00,000"): every TraceStep now carries a `kind` that
// says how to render `result` — a plain rupee amount is the exception, not
// the rule, once counts/rates/USD figures are in the same trace.
// ---------------------------------------------------------------------------

const indianGroup = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

function renderStepResult(step: TraceStep): string {
  switch (step.kind) {
    case 'count':
      return `${indianGroup.format(step.result)} DPs`
    case 'rate':
      return `₹${indianGroup.format(step.result)}/DP/yr`
    case 'usd':
      return `$${indianGroup.format(step.result)}/mo`
    case 'inr':
    default:
      return formatINR(step.result)
  }
}

// ---------------------------------------------------------------------------
// Grouping (owner: "The working example is all wrong. Correct it, make it
// simple and easier to understand") — the raw trace is a flat list of ~10
// calculation steps; grouped under three small headings it reads as a story:
// what you pay now, what recurs, and the background numbers that produced it.
// ---------------------------------------------------------------------------

type TraceGroup = 'year1' | 'year2' | 'reference'

const GROUP_TITLE: Record<TraceGroup, string> = {
  year1: 'Year 1',
  year2: 'Year 2 onwards',
  reference: 'Reference',
}

/** "Which bracket does this deal fall into" steps — background context, not a cost line. */
const REFERENCE_LABELS = new Set([
  'CM slab',
  'SaaS tier',
  'Included DP bundle',
  'Overage rate (billed on actuals, beyond the bundle)',
])

function classifyStep(label: string): TraceGroup {
  if (REFERENCE_LABELS.has(label)) return 'reference'
  if (label.includes('Year 2+') || label === 'CM support (annual, from Year 1)') return 'year2'
  if (
    label.includes('Year 1') ||
    label.includes('licence') ||
    label.includes('deployment') ||
    label.includes('infra') ||
    label.includes('platform') ||
    label.includes('implementation')
  ) {
    return 'year1'
  }
  return 'reference' // estate shared/DSPM/DAM/Endpoint bases, discount, rate overrides — background context
}

function groupSteps(trace: TraceStep[]): Record<TraceGroup, TraceStep[]> {
  const groups: Record<TraceGroup, TraceStep[]> = { year1: [], year2: [], reference: [] }
  for (const step of trace) groups[classifyStep(step.label)].push(step)
  return groups
}

/** Right rail: live worked example — price() on the draft, trace grouped and rendered by kind. */
export default function WorkedExample({ draft }: Props) {
  // Default sample: the owner's canonical demo case (5,00,000 DP base, SaaS, 3-year TCO).
  const [dpBase, setDpBase] = useState(500_000)
  const [mode, setMode] = useState<DeploymentMode>('saas')
  const [dspm, setDspm] = useState(false)
  const [dam, setDam] = useState(false)
  const [endpoint, setEndpoint] = useState(false)
  const [tcoYears, setTcoYears] = useState<DealInputs['tco_years']>(3)
  const [quantities, setQuantities] = useState<Record<string, number>>({
    database: 50,
    cloud_connector: 4,
    gdrive_user: 2000,
    dam_dataset: 2,
    endpoint_device: 500,
  })

  const result = useMemo(
    () =>
      price(
        draft,
        buildSampleDeal({ dp_base: dpBase, deployment_mode: mode, dspm, dam, endpoint, quantities, tco_years: tcoYears }),
      ),
    [draft, dpBase, mode, dspm, dam, endpoint, quantities, tcoYears],
  )

  const isSaas = mode === 'saas'
  const estateOn = !isSaas && (dspm || dam || endpoint)
  const grouped = useMemo(() => groupSteps(result.trace), [result.trace])

  return (
    <div className={card}>
      <h2 className="text-sm font-semibold text-perfios-blue">Worked example</h2>
      <p className="mb-3 mt-1 text-xs text-slate-400">
        Live trace of price() against the current draft — recomputes on every rate edit.
      </p>

      <div className="space-y-2">
        <label className="flex items-center justify-between gap-2 text-xs text-slate-500">
          Sample DP base
          <input
            type="number"
            min={0}
            step={100000}
            className={`${inp} w-32 text-right`}
            value={dpBase}
            onChange={(e) => setDpBase(toNum(e.target.value))}
          />
        </label>
        <label className="flex items-center justify-between gap-2 text-xs text-slate-500">
          Deployment mode
          <select className={inp} value={mode} onChange={(e) => setMode(e.target.value as DeploymentMode)}>
            <option value="onprem">On-Prem</option>
            <option value="hybrid">Hybrid</option>
            <option value="saas">SaaS</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2 text-xs text-slate-500">
          TCO years
          <select
            className={inp}
            value={tcoYears}
            onChange={(e) => setTcoYears(Number(e.target.value) as DealInputs['tco_years'])}
          >
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-3 pt-1 text-xs text-slate-600">
          <label className={`flex items-center gap-1 ${isSaas ? 'opacity-40' : ''}`}>
            <input type="checkbox" checked={dspm} disabled={isSaas} onChange={(e) => setDspm(e.target.checked)} /> DSPM
          </label>
          <label className={`flex items-center gap-1 ${isSaas ? 'opacity-40' : ''}`}>
            <input type="checkbox" checked={dam} disabled={isSaas} onChange={(e) => setDam(e.target.checked)} /> DAM
          </label>
          <label className={`flex items-center gap-1 ${isSaas ? 'opacity-40' : ''}`}>
            <input type="checkbox" checked={endpoint} disabled={isSaas} onChange={(e) => setEndpoint(e.target.checked)} /> Endpoint
          </label>
        </div>
        {isSaas && <p className="text-xs text-amber-600">SaaS is CM-only — estate modules do not apply.</p>}

        {estateOn && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-100 pt-2">
            {QTY_INPUTS.map((q) => (
              <label key={q.key} className="flex items-center justify-between gap-1 text-xs text-slate-500">
                {q.label}
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={`${inp} w-16 text-right`}
                  value={quantities[q.key] ?? 0}
                  onChange={(e) => setQuantities((prev) => ({ ...prev, [q.key]: toNum(e.target.value) }))}
                />
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-4 border-t border-slate-100 pt-3">
        {(['year1', 'year2', 'reference'] as const).map((group) => {
          const steps = grouped[group]
          if (steps.length === 0) return null
          return (
            <div key={group}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{GROUP_TITLE[group]}</h3>
              <ol className="mt-1 space-y-2">
                {steps.map((step, i) => (
                  <li key={`${group}-${i}-${step.label}`} className="text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-slate-700">{step.label}</span>
                      <span className="whitespace-nowrap font-mono text-slate-700">{renderStepResult(step)}</span>
                    </div>
                    <p className="text-slate-400">{step.formula}</p>
                  </li>
                ))}
              </ol>
            </div>
          )
        })}
      </div>

      <dl className="mt-4 space-y-1.5 rounded-md border border-perfios-blue/20 bg-perfios-blue/5 p-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">One-time</dt>
          <dd className="font-medium text-slate-700">{formatINR(result.total_one_time_inr)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Year 1</dt>
          <dd className="font-medium text-slate-700">{formatINR(result.total_year1_inr)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Year 2+</dt>
          <dd className="font-medium text-slate-700">{formatINR(result.total_recurring_inr)}</dd>
        </div>
        <div className="flex justify-between border-t border-perfios-blue/20 pt-1.5">
          <dt className="text-base font-semibold text-perfios-blue">{tcoYears}-year TCO</dt>
          <dd className="text-base font-semibold text-perfios-blue">{formatINR(result.total_tco_inr)}</dd>
        </div>
      </dl>
    </div>
  )
}
