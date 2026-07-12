import type { EstateBucket, EstateRate, RateCard } from '../../lib/engine2/types'
import { formatINR } from '../../lib/format'
import { card, inp, th, toNum } from '../styles'
import { estateRateDescription, type UpdateCard } from './helpers'

interface Props {
  estate: RateCard['estate']
  update: UpdateCard
}

const bucketChip: Record<EstateBucket, string> = {
  shared: 'bg-slate-100 text-slate-600',
  dspm: 'bg-blue-100 text-blue-700',
  dam: 'bg-emerald-100 text-emerald-700',
  endpoint: 'bg-purple-100 text-purple-700',
}

const bucketLabel: Record<EstateBucket, string> = {
  shared: 'Shared',
  dspm: 'DSPM',
  dam: 'DAM',
  endpoint: 'Endpoint',
}

/** Group (c): Estate rates (DSPM / DAM / Endpoint) + deployment % + AMC %. */
export default function EstateGroup({ estate, update }: Props) {
  const patchRate = (index: number, patch: Partial<EstateRate>) =>
    update((c) => ({
      ...c,
      estate: {
        ...c.estate,
        rates: c.estate.rates.map((rt, i) => (i === index ? { ...rt, ...patch } : rt)),
      },
    }))

  const patchPct = (patch: Partial<Pick<RateCard['estate'], 'deployment_pct' | 'amc_pct'>>) =>
    update((c) => ({ ...c, estate: { ...c.estate, ...patch } }))

  return (
    <section className={card}>
      <h2 className="text-sm font-semibold text-perfios-blue">Estate Rates (DSPM / DAM / Endpoint)</h2>
      <p className="mb-3 mt-1 text-xs text-slate-400">
        Unit rates × quantities build each module&apos;s base. The shared bucket is charged once — to DSPM when
        selected, otherwise to DAM. Estate never applies to SaaS deals (CM-only).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>Rate</th>
              <th className={th}>Unit</th>
              <th className={th}>Price (₹)</th>
              <th className={th}>Bucket</th>
              <th className={th}>What this drives</th>
            </tr>
          </thead>
          <tbody>
            {estate.rates.map((rt, i) => (
              <tr key={rt.rate_key} className="border-t border-slate-100 align-top">
                <td className="px-2 py-1.5 text-sm text-slate-700">{rt.label}</td>
                <td className="px-2 py-1.5 text-xs text-slate-500">{rt.unit}</td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={`${inp} w-28 text-right`}
                    value={rt.unit_price_inr}
                    onChange={(e) => patchRate(i, { unit_price_inr: toNum(e.target.value) })}
                  />
                  <span className="mt-0.5 block text-right text-xs text-slate-400">{formatINR(rt.unit_price_inr)}</span>
                </td>
                <td className="px-2 py-1.5">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${bucketChip[rt.bucket]}`}>
                    {bucketLabel[rt.bucket]}
                  </span>
                  {rt.provisional && (
                    <span className="ml-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Provisional
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-xs text-slate-500">{estateRateDescription(rt.rate_key, rt.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-700">
            Deployment % (one-time)
            <span className="block text-xs text-slate-400">One-time deployment charge on each module&apos;s base, billed in Year 1 only.</span>
          </span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            className={`${inp} w-24 text-right`}
            value={estate.deployment_pct}
            onChange={(e) => patchPct({ deployment_pct: toNum(e.target.value) })}
          />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-700">
            AMC % (annual)
            <span className="block text-xs text-slate-400">Annual maintenance on each module&apos;s base, on top of the recurring base.</span>
          </span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            className={`${inp} w-24 text-right`}
            value={estate.amc_pct}
            onChange={(e) => patchPct({ amc_pct: toNum(e.target.value) })}
          />
        </label>
      </div>
    </section>
  )
}
