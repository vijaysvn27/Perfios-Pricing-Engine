import { useMemo, useState } from 'react'
import { price } from '../../lib/engine2/engine2'
import type { DealInputs, DeploymentMode, RateCard } from '../../lib/engine2/types'
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

/** Right rail: live worked example — price() on the draft, trace rendered step by step. */
export default function WorkedExample({ draft }: Props) {
  const [dpBase, setDpBase] = useState(2_500_000)
  const [mode, setMode] = useState<DeploymentMode>('onprem')
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

      <ol className="mt-3 space-y-2 border-t border-slate-100 pt-3">
        {result.trace.map((step, i) => (
          <li key={`${i}-${step.label}`} className="text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-slate-700">
                {i + 1}. {step.label}
              </span>
              <span className="whitespace-nowrap font-mono text-slate-700">{formatINR(step.result)}</span>
            </div>
            <p className="text-slate-400">{step.formula}</p>
          </li>
        ))}
      </ol>

      <dl className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
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
        <div className="flex justify-between border-t border-slate-100 pt-1">
          <dt className="font-semibold text-perfios-blue">{tcoYears}-year TCO</dt>
          <dd className="font-semibold text-perfios-blue">{formatINR(result.total_tco_inr)}</dd>
        </div>
      </dl>
    </div>
  )
}
