import type { RateCard, SaasInfraBasis, SaasTier } from '../../lib/engine2/types'
import { formatINR } from '../../lib/format'
import { card, inp, th, toNum } from '../styles'
import { basisSwitchPreview, tierDescription, type UpdateCard } from './helpers'

interface Props {
  saas: RateCard['saas_cm']
  /** Full card is needed for the D1 before/after preview (uses fx, SG&A, licence). */
  fullCard: RateCard
  update: UpdateCard
}

/** Sample deal size for the D1 basis-switch preview (a 25L DP deal, per spec §8). */
export const BASIS_PREVIEW_SAMPLE_DP = 2_500_000

const activeCol = 'bg-perfios-blue/10'

/** Group (b): SaaS CM tiers — both infra columns, basis switch with price preview, SaaS parameters. */
export default function SaasCmGroup({ saas, fullCard, update }: Props) {
  const patchTier = (index: number, patch: Partial<SaasTier>) =>
    update((c) => ({
      ...c,
      saas_cm: {
        ...c.saas_cm,
        tiers: c.saas_cm.tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)),
      },
    }))

  const patchSaas = (patch: Partial<Omit<RateCard['saas_cm'], 'tiers'>>) =>
    update((c) => ({ ...c, saas_cm: { ...c.saas_cm, ...patch } }))

  const basis = saas.infra_basis
  const preview = basisSwitchPreview(fullCard, BASIS_PREVIEW_SAMPLE_DP)
  const onpremActive = basis === 'onprem_ref'

  const basisRadio = (value: SaasInfraBasis, label: string, note: string) => (
    <label
      className={`flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-2 ${
        basis === value ? 'border-perfios-blue bg-perfios-blue/5' : 'border-slate-200'
      }`}
    >
      <input
        type="radio"
        name="saas-infra-basis"
        className="mt-0.5"
        checked={basis === value}
        onChange={() => patchSaas({ infra_basis: value })}
      />
      <span className="text-sm text-slate-700">
        {label}
        <span className="block text-xs text-slate-400">{note}</span>
      </span>
    </label>
  )

  return (
    <section className={card}>
      <h2 className="text-sm font-semibold text-perfios-blue">SaaS CM — Tiers</h2>
      <p className="mb-3 mt-1 text-xs text-slate-400">
        Tier is picked by the committed user base. Hosting infra converts to INR via FX and the SG&amp;A uplift; the
        highlighted column is the active infra basis.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>Tier</th>
              <th className={th}>User cap</th>
              <th className={`${th} ${onpremActive ? activeCol : ''}`}>Infra $/mo (on-prem ref){onpremActive ? ' — ACTIVE' : ''}</th>
              <th className={`${th} ${onpremActive ? '' : activeCol}`}>Infra $/mo (SaaS v3){onpremActive ? '' : ' — ACTIVE'}</th>
              <th className={th}>Overage ₹/user</th>
              <th className={th}>What this drives</th>
            </tr>
          </thead>
          <tbody>
            {saas.tiers.map((t, i) => (
              <tr key={t.tier_key} className="border-t border-slate-100 align-top">
                <td className="px-2 py-1.5 text-sm text-slate-700">{t.label}</td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={`${inp} w-28 text-right`}
                    value={t.user_cap}
                    onChange={(e) => patchTier(i, { user_cap: toNum(e.target.value) })}
                  />
                </td>
                <td className={`px-2 py-1.5 ${onpremActive ? activeCol : ''}`}>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={`${inp} w-24 text-right`}
                    value={t.infra_usd_mo_onprem_ref}
                    onChange={(e) => patchTier(i, { infra_usd_mo_onprem_ref: toNum(e.target.value) })}
                  />
                </td>
                <td className={`px-2 py-1.5 ${onpremActive ? '' : activeCol}`}>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={`${inp} w-24 text-right`}
                    value={t.infra_usd_mo_saas_v3}
                    onChange={(e) => patchTier(i, { infra_usd_mo_saas_v3: toNum(e.target.value) })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={`${inp} w-20 text-right`}
                    value={t.overage_inr_per_user}
                    onChange={(e) => patchTier(i, { overage_inr_per_user: toNum(e.target.value) })}
                  />
                </td>
                <td className="px-2 py-1.5 text-xs text-slate-500">{tierDescription(t.label)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          SaaS infra basis (D1) — which $/mo column prices hosting
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {basisRadio('onprem_ref', 'On-Prem Total (reviewed position)', 'The Olivia/Anil-reviewed commercial basis; current list prices.')}
          {basisRadio('saas_v3', 'SaaS v3 (lower cloud cost)', 'Reprices SaaS platform fees to the SaaS v3 sizing column.')}
        </div>
        <div className="mt-2 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">
            Price impact at a {preview.sample_dp_base.toLocaleString('en-IN')} DP deal ({preview.tier_label} tier):
          </span>{' '}
          platform fee {formatINR(preview.onprem_ref.platform_fee_inr_yr)}/yr on the on-prem-ref basis vs{' '}
          {formatINR(preview.saas_v3.platform_fee_inr_yr)}/yr on SaaS v3 ({preview.delta_inr_yr <= 0 ? '−' : '+'}
          {formatINR(Math.abs(preview.delta_inr_yr))} per year). Currently active:{' '}
          <span className="font-semibold">{onpremActive ? 'On-Prem Total' : 'SaaS v3'}</span> — switching takes effect
          only when you publish.
        </div>
      </div>

      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-700">
            FX (₹ per USD)
            <span className="block text-xs text-slate-400">Converts the tier&apos;s $/mo hosting cost to INR inside the platform fee.</span>
          </span>
          <input type="number" min={0} step={0.5} className={`${inp} w-24 text-right`} value={saas.fx_inr_per_usd}
            onChange={(e) => patchSaas({ fx_inr_per_usd: toNum(e.target.value) })} />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-700">
            SG&amp;A uplift %
            <span className="block text-xs text-slate-400">Markup applied on top of the converted hosting cost.</span>
          </span>
          <input type="number" min={0} max={1} step={0.01} className={`${inp} w-24 text-right`} value={saas.sgna_uplift_pct}
            onChange={(e) => patchSaas({ sgna_uplift_pct: toNum(e.target.value) })} />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-700">
            SaaS annual licence (₹)
            <span className="block text-xs text-slate-400">Fixed annual licence added to infra to form the platform fee. {formatINR(saas.annual_licence_inr)}.</span>
          </span>
          <input type="number" min={0} step={1} className={`${inp} w-36 text-right`} value={saas.annual_licence_inr}
            onChange={(e) => patchSaas({ annual_licence_inr: toNum(e.target.value) })} />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-700">
            Implementation % (one-time)
            <span className="block text-xs text-slate-400">One-time implementation charge on the licence, billed in Year 1 only.</span>
          </span>
          <input type="number" min={0} max={1} step={0.01} className={`${inp} w-24 text-right`} value={saas.implementation_pct}
            onChange={(e) => patchSaas({ implementation_pct: toNum(e.target.value) })} />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-700">
            Year-2 floor %
            <span className="block text-xs text-slate-400">Year 2+ never drops below this share of the Year-1 platform fee.</span>
          </span>
          <input type="number" min={0} max={1} step={0.01} className={`${inp} w-24 text-right`} value={saas.y2_floor_pct}
            onChange={(e) => patchSaas({ y2_floor_pct: toNum(e.target.value) })} />
        </label>
      </div>
    </section>
  )
}
