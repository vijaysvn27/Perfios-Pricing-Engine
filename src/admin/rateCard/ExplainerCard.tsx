import { card } from '../styles'

/**
 * Group (d): plain-language "How the calculation works" — one short explainer
 * per deployment mode, matching spec §6. Parameters themselves live inside
 * the three rate groups above (not duplicated here).
 */
export default function ExplainerCard() {
  return (
    <section className={card}>
      <h2 className="mb-3 text-sm font-semibold text-perfios-blue">How the calculation works</h2>
      <div className="space-y-3 text-sm text-slate-600">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">On-Prem</h3>
          <p className="mt-1">
            The DP base picks a slab, and that slab&apos;s annual licence is the anchor. Year 1 is the licence plus
            one-time deployment (deployment %) plus annual support (support %). From Year 2 the client pays only the
            support percentage of the licence, and there is no infra charge because the client hosts.
          </p>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">SaaS / Hybrid</h3>
          <p className="mt-1">
            The committed user base picks a tier, whose monthly hosting cost converts to an annual INR figure via FX
            and the SG&amp;A uplift, and adds to the SaaS licence to form the platform fee. Year 1 is the platform fee
            plus a one-time implementation charge on the licence. Year 2+ is the platform fee plus any overage for
            users beyond the commitment, never less than the Year-2 floor percentage of the Year-1 platform fee.
          </p>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Estate (On-Prem / Hybrid only)</h3>
          <p className="mt-1">
            Each selected module&apos;s base is its unit rates times the client&apos;s quantities, with the shared
            bucket counted once — under DSPM if selected, otherwise under DAM. Year 1 is the base plus one-time
            deployment plus AMC; Year 2+ is the base plus AMC. SaaS deals are CM-only, so estate modules never apply
            there.
          </p>
        </div>
      </div>
    </section>
  )
}
