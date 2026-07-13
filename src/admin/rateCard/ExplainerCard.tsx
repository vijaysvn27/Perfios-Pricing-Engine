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
            The DP base picks a tier, whose monthly hosting cost converts to an annual INR figure via FX and the
            SG&amp;A uplift, and adds to the SaaS licence to form the platform fee. The platform fee includes the
            tier&apos;s DP bundle (&quot;Included DPs&quot;) — covering all consent actions (grant, revocation,
            modification, deletion, cookie consent). DPs beyond the bundle are overage, billed on actuals at
            ceil(platform fee ÷ tier cap) — whole rupees per DP. Year 1 = implementation (one-time, on the licence)
            + platform fee + overage on the declared Year-1 base beyond the bundle. Year 2 onwards = the Year-2
            renewal percentage of the platform fee + overage on actual Year-2 DPs beyond the bundle (2026-07-13
            bundled-DP renewal model, owner direction, confirmed on the CM Calculator call with Rohit; the old
            per-tier overage rate column is retained for history only and is no longer read).
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
