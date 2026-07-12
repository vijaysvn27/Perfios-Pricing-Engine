import type { OnPremSlab, RateCard } from '../../lib/engine2/types'
import { formatINR } from '../../lib/format'
import { card, inp, th, toNum } from '../styles'
import { slabDescription, type UpdateCard } from './helpers'

interface Props {
  cm: RateCard['onprem_cm']
  update: UpdateCard
}

/** Group (a): On-Prem CM DP slabs + deployment % + support %. */
export default function OnPremCmGroup({ cm, update }: Props) {
  const patchSlab = (index: number, patch: Partial<OnPremSlab>) =>
    update((c) => ({
      ...c,
      onprem_cm: {
        ...c.onprem_cm,
        slabs: c.onprem_cm.slabs.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      },
    }))

  const patchPct = (patch: Partial<Pick<RateCard['onprem_cm'], 'deployment_pct' | 'support_pct'>>) =>
    update((c) => ({ ...c, onprem_cm: { ...c.onprem_cm, ...patch } }))

  return (
    <section className={card}>
      <h2 className="text-sm font-semibold text-perfios-blue">On-Prem CM — DP Slabs</h2>
      <p className="mb-3 mt-1 text-xs text-slate-400">
        Licence is picked by the Year-1 data-principal base: the first slab whose cap covers the base applies.
      </p>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Slab</th>
            <th className={th}>DP cap</th>
            <th className={th}>Annual licence (₹)</th>
            <th className={th}>What this drives</th>
          </tr>
        </thead>
        <tbody>
          {cm.slabs.map((s, i) => (
            <tr key={s.slab_key} className="border-t border-slate-100 align-top">
              <td className="px-2 py-1.5">
                <input
                  className={`${inp} w-24`}
                  value={s.label}
                  onChange={(e) => patchSlab(i, { label: e.target.value })}
                />
              </td>
              <td className="px-2 py-1.5">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={`${inp} w-32 text-right`}
                  value={s.dp_cap}
                  onChange={(e) => patchSlab(i, { dp_cap: toNum(e.target.value) })}
                />
              </td>
              <td className="px-2 py-1.5">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={`${inp} w-36 text-right`}
                  value={s.annual_licence_inr}
                  onChange={(e) => patchSlab(i, { annual_licence_inr: toNum(e.target.value) })}
                />
                <span className="mt-0.5 block text-right text-xs text-slate-400">{formatINR(s.annual_licence_inr)}</span>
              </td>
              <td className="px-2 py-1.5 text-xs text-slate-500">{slabDescription(s.label)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-700">
            Deployment % (one-time)
            <span className="block text-xs text-slate-400">One-time deployment charge on top of the licence, billed in Year 1 only.</span>
          </span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            className={`${inp} w-24 text-right`}
            value={cm.deployment_pct}
            onChange={(e) => patchPct({ deployment_pct: toNum(e.target.value) })}
          />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-700">
            Support % (annual)
            <span className="block text-xs text-slate-400">Annual support on the licence, from Year 1; it is the whole Year-2+ price.</span>
          </span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            className={`${inp} w-24 text-right`}
            value={cm.support_pct}
            onChange={(e) => patchPct({ support_pct: toNum(e.target.value) })}
          />
        </label>
      </div>
    </section>
  )
}
