import type { RateCard, SaasTier } from '../../lib/engine2/types'
import { formatINR } from '../../lib/format'
import { card, inp, th, toNum } from '../styles'
import PctInput from './PctInput'
import { SAAS_PRICING_EXPLAINER, saasVsOnPremYear1, tierDerivedRate, type UpdateCard } from './helpers'

interface Props {
  saas: RateCard['saas_cm']
  /** Full card is needed for the derived ₹/DP column and the SaaS-vs-On-Prem comparison (uses fx, SG&A, licence, on-prem slabs). */
  fullCard: RateCard
  update: UpdateCard
}

/**
 * Group (b): SaaS CM tiers — lean table (owner: remove clutter). SaaS pricing
 * always runs on the saas_v3 infra column: the on-prem-ref reference column,
 * the basis radio/switch, the Included DPs column and the "what this drives"
 * column are gone from admin (bundle sizes remain data — they surface in the
 * proposal, not here). infra_basis is hard-coerced to 'saas_v3' on every load
 * (src/lib/rateCard/repo.ts normalizeRateCard) — the basis choice is abolished.
 */
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

  return (
    <section className={card}>
      <h2 className="text-sm font-semibold text-perfios-blue">SaaS CM — Tiers</h2>
      <p className="mb-3 mt-1 text-xs text-slate-400">
        SaaS pricing runs on the SaaS infra column. Each tier includes a DP bundle (shown in proposals); DPs beyond it
        are billed on actuals at the derived ₹/DP rate.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>Tier</th>
              <th className={th}>User cap</th>
              <th className={th}>Infra $/mo (SaaS)</th>
              <th className={th}>₹/DP (derived)</th>
            </tr>
          </thead>
          <tbody>
            {saas.tiers.map((t, i) => {
              const derived = tierDerivedRate(fullCard, t)
              return (
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
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className={`${inp} w-24 text-right`}
                      value={t.infra_usd_mo_saas_v3}
                      onChange={(e) => patchTier(i, { infra_usd_mo_saas_v3: toNum(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-sm text-slate-700">
                    ₹{derived.rate_inr_per_dp.toFixed(2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">{SAAS_PRICING_EXPLAINER}</p>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          SaaS vs On-Prem — Year 1
        </p>
        <p className="mb-2 text-xs text-slate-400">
          For a client sized exactly at each tier&apos;s cap: SaaS Year 1 (implementation + platform fee — the quote
          is overage-free) vs. On-Prem Year 1 for the slab that covers the same DP count. A flagged row means SaaS is
          not undercutting On-Prem at that size — tune the licence / infra.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Tier (at cap)</th>
                <th className={th}>SaaS Year 1</th>
                <th className={th}>On-Prem Year 1</th>
                <th className={th}>On-Prem slab</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {saasVsOnPremYear1(fullCard).map((row) => (
                <tr key={row.tier_key} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 text-sm text-slate-700">{row.tier_label}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-sm text-slate-700">
                    {formatINR(row.saas_year1_at_cap_inr)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-sm text-slate-700">
                    {formatINR(row.onprem_year1_inr)}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-slate-500">{row.onprem_slab_label}</td>
                  <td className="px-2 py-1.5">
                    {row.saas_gte_onprem ? (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        SaaS ≥ On-Prem — tune the licence / infra
                      </span>
                    ) : (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        SaaS below On-Prem
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <PctInput value={saas.sgna_uplift_pct} onChange={(fraction) => patchSaas({ sgna_uplift_pct: fraction })} />
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
          <PctInput value={saas.implementation_pct} onChange={(fraction) => patchSaas({ implementation_pct: fraction })} />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-700">
            Year-2 renewal %
            <span className="block text-xs text-slate-400">Year 2+ = this share of the Year-1 platform fee. Overage beyond the bundle is billed on actuals, outside the quote.</span>
          </span>
          <PctInput value={saas.y2_floor_pct} onChange={(fraction) => patchSaas({ y2_floor_pct: fraction })} />
        </label>
      </div>
    </section>
  )
}
