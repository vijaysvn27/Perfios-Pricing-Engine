# DPDP Suite Proposal Builder — Revamp Design

Date: 2026-07-12
Status: Draft for review
Repo: Perfios-Pricing-Engine

## 1. Problem

The pricing engine works but fails its two audiences:

- **Admins** must operate seven tabs (Instances, Fields, Modules, CM Tiers,
  Questions, Settings, Versions) and understand an invisible glue model
  (fields tagged to modules, composite vs tier vs multiplier pricing types,
  shared deployment/AMC percentages in Settings). Setting a price requires
  understanding the engine's internals.
- **AMs** get a share link that opens a partner cost calculator, not a
  proposal tool. It cannot express deployment modes (On-Prem / Hybrid /
  SaaS), TCO horizons, comparisons, negotiation, or produce a client-ready
  document.

Meanwhile the real commercial logic lives in `Perfios_CM_Proposal_Builder.xlsx`
(Rate Card + Calculator + Client Proposal + Model Comparison), which encodes
rules the web engine cannot: SaaS = CM-only, Hybrid = CM-on-SaaS + estate
on-prem, Year-2 floor, overage, one-time vs recurring split. Two pricing
brains have diverged.

## 2. Goals

1. One pricing brain. The Excel CM Proposal Builder Rate Card is the seed
   source of truth; the web app becomes the living home of those rates.
2. Admin edits **numbers, never logic**, on a single Rate Card page, with the
   calculation made visible and explainable at every step.
3. AMs build client-ready proposals in a 4-step wizard: three deployment
   modes, three pricing presentation formats, full negotiation fields,
   Excel + PDF export.
4. Client-facing output NEVER mentions channel partners (Aurva, TechJockey,
   PwC, or any partner name). Channel is internal metadata only.

Non-goals: changing list prices (seed = current Rate Card values), replacing
the existing partner share-link calculator (it remains, unchanged, for the
partner-margin use case), building CPQ/approval workflows.

## 3. Decisions taken (with rationale)

- **D1 — SaaS infra basis.** The Consentick sizing workbook has two cost
  columns per tier: "On-Prem Total $/mo" (1347 / 1549 / 3671 / 4538 / 7543)
  and "SaaS v3 $/mo" (650 / 950 / 1980 / 3089 / 5385). The current Rate Card
  uses the On-Prem column for SaaS platform fees. **Default stays On-Prem
  Total** (it is the Olivia/Anil-reviewed commercial position; we do not
  silently reprice), but BOTH columns are stored and the basis is an explicit,
  labelled admin setting (`saas_infra_basis`), so the choice is conscious,
  visible, and reversible in one click. The admin page shows the price impact
  of switching before publish.
- **D2 — On-Prem hardware annexure: yes.** On-Prem deals carry no infra
  charge (client hosts). The proposal includes an auto-generated
  "Infrastructure You Provide" annexure from the Consentick tier BOM
  (node list, vCPU/RAM/storage, primary + cold DR). Annexure content is
  admin-editable data, seeded from the sizing workbook.
- **D3 — Outputs.** Excel workbook (client-ready, mirrors the current
  Client Proposal / Model Comparison sheets) and PDF (same content, print
  layout). The "Perfios format" is the primary client layout, taken from the
  Client Proposal sheet: What You Get / Commercial Summary / Scope &
  Coverage / What Drives Your Price / Payment Terms. Word export is deferred;
  PDF covers the document need.
- **D4 — Discount visibility.** Per-proposal AM toggle: "Show list price and
  discount" (default ON — list → discount → net is standard negotiation
  framing) or net-only. Internally, list, discount and net are always stored.
- **D5 — Channel.** Channel (Direct / Aurva / TechJockey / PwC) is captured on
  the deal for internal tracking and is excluded from every client-facing
  render path by construction (see §7 render contract).
- **D6 — Existing engine rules.** The repo rule "calculator never shows
  per-unit prices or margin" applies to the PARTNER link and stays enforced
  there. The AM proposal flow is internal-facing and MAY show line detail and
  discounts; this spec supersedes the old rule for the AM surface only.

## 4. Architecture overview

```
Supabase (Postgres + RLS)
  rate_cards (draft -> validate -> publish, versioned, rollback)  [replaces fields/modules/tags as the admin-facing model]
  proposals  (deal record: inputs + published rate_card version + outputs)
        |
  src/lib/engine2/   pure, deterministic, unit-tested
        price(rateCard, dealInputs) -> PriceResult { lines, years[], totals, trace }
        |
  Admin: RateCardPage (one page, grouped rates + live worked example + publish)
  AM:    ProposalWizard (Deal -> Scope -> Commercials -> Present & Export)
  Render: three format templates -> screen preview, .xlsx export, PDF export
```

The existing engine, public calculator, and partner links are untouched; the
new engine2 + rate card model live alongside and power admin + AM surfaces.
(The old admin tabs are retired once the Rate Card page reaches parity.)

## 5. Rate card data model

One published JSON snapshot per version (same draft/publish/rollback
machinery as today, reused):

```ts
interface RateCard {
  onprem_cm: {
    slabs: { slab_key: string; label: string; dp_cap: number; annual_licence_inr: number }[]
    deployment_pct: number      // 0.18 one-time, of licence
    support_pct: number         // 0.30 of licence, annual from Year 1
  }
  saas_cm: {
    tiers: { tier_key: string; user_cap: number;
             infra_usd_mo_onprem_ref: number;   // Consentick "On-Prem Total" column
             infra_usd_mo_saas_v3: number;      // Consentick "SaaS v3" column
             overage_inr_per_user: number }[]
    infra_basis: 'onprem_ref' | 'saas_v3'       // D1, default 'onprem_ref'
    fx_inr_per_usd: number                      // 83
    sgna_uplift_pct: number                     // 0.20
    annual_licence_inr: number                  // 15_00_000
    implementation_pct: number                  // 0.15 of licence, one-time
    y2_floor_pct: number                        // 0.30 of Year-1 platform fee
  }
  estate: {
    rates: { rate_key: string; label: string; unit: string;
             unit_price_inr: number; provisional: boolean;
             bucket: 'shared' | 'dspm' | 'dam' | 'endpoint' }[]
    deployment_pct: number      // 0.18 one-time, of base
    amc_pct: number             // 0.12 of base, annual on top of recurring base
  }
  modules: { module_key: string; label: string; description: string }[]  // CM 7-module copy etc.
  annexures: {
    onprem_bom: { tier_key: string; rows: BomRow[] }[]   // seeded from Consentick sheets
  }
  copy: { payment_terms: string[]; validity_days: number; excel_hero: string }
}
```

Money is integer INR (paise not needed at these magnitudes; whole rupees,
consistent with the existing money.ts approach). All USD inputs convert
inside the engine via `fx_inr_per_usd`.

Seed values: every number above comes from the Excel Rate Card sheet, plus
both Consentick Summary columns, plus the CM Modules sheet copy. Endpoint
rate keeps its `provisional: true` flag and renders a "Provisional" chip in
admin.

## 6. Engine2 — pricing rules (exact Excel parity)

Inputs:

```ts
interface DealInputs {
  deployment_mode: 'onprem' | 'hybrid' | 'saas'
  compare_all_modes: boolean
  dp_base_y1: number
  dp_base_y2: number
  modules: { dspm: boolean; dam: boolean; endpoint: boolean }   // ignored for SaaS
  estate_quantities: Record<string, number>
  tco_years: 1 | 2 | 3 | 4 | 5
  discount: { mode: 'none' | 'pct_total' | 'pct_per_component'; values: ... }
  show_discount: boolean
}
```

Rules (each encoded as data-driven steps, mirroring Calculator sheet rows
D61–D102 exactly):

- **On-Prem CM**: slab licence L by `dp_base_y1` vs `dp_cap` (first slab whose
  cap >= base). Year 1 = L + 0.18·L (one-time deployment) + 0.30·L (support).
  Year 2+ = 0.30·L. One-time portion = L + 0.18·L.
- **SaaS / Hybrid CM**: tier by committed base. Infra INR/yr =
  `infra_usd_mo(basis) × 12 × fx × (1 + sgna)`. Platform fee = annual licence
  + infra. Year 1 = platform fee + 0.15 × licence (one-time implementation).
  Overage (Y2+) = max(0, dp_base_y2 − dp_base_y1) × overage rate.
  Year 2+ = max(platform fee + overage, y2_floor_pct × Year-1 platform fee).
- **Estate (On-Prem / Hybrid only; SaaS = CM-only)**: shared-bucket base
  (databases, cloud connectors, accounts, on-prem connectors, on-prem DCs)
  is counted ONCE — attributed to DSPM if selected, else to DAM.
  DSPM-specific bucket: GDrive/OneDrive users, VMs, SharePoint sites.
  DAM-specific: DAM datasets. Endpoint: devices.
  Per selected module: Year 1 = base × (1 + deployment_pct + amc_pct);
  Year 2+ = base × (1 + amc_pct). One-time portion = base × deployment_pct.
- **Discount**: applied to computed list lines producing net lines; both kept.
- **Totals**: per-component per-year matrix (Y1..tco_years), one-time vs
  recurring split, N-year TCO, and (in compare mode) the same for all three
  modes at once.

### The trace (calculation transparency — core requirement)

`price()` returns, alongside the numbers, a `trace: TraceStep[]` where every
step is `{ label, formula_in_words, inputs: {name: value}, result }` — e.g.
"CM licence: base 25,00,000 ≤ Mid cap 25,00,000 → slab Mid → ₹30,00,000",
"Deployment (one-time): 18% × ₹30,00,000 = ₹5,40,000". The trace renders:

- in the **admin** Rate Card page as a live worked example (admin picks a
  sample DP base and sees every step recompute as they edit rates), and
- in the **AM** wizard as an expandable "How this price is calculated" panel.

No hidden math: if a number appears on a proposal, its trace path exists.

### Testing

Golden parity fixtures taken from the Excel Calculator with known inputs:
e.g. On-Prem, 25L base → Y1 ₹44,40,000 / Y2+ ₹9,00,000 / 3-yr TCO
₹62,40,000, one-time ₹35,40,000; SaaS same base → Y1 ₹61,12,579 / Y2+
₹58,87,579 (floor & overage cases each get fixtures, including
dp_base_y2 > committed and the y2-floor-binding case). Engine ships only
when all parity fixtures pass. Property tests: slab/tier boundary values
(exactly at cap, cap+1), zero quantities, SaaS excludes estate.

### Amendment (2026-07-12): SaaS per-user methodology

Source: "Vi - Documentation" leadership call, 2026-07-07 (Olivia
Mukhopadhyay). Decided model, effective immediately, superseding the SaaS/
Hybrid Year-2+ rule in §6 above:

- **Kept unchanged**: annual licence, one-time implementation (15% of
  licence), infra by committed-base tier (`infra_usd_mo × 12 × fx ×
  (1 + sgna_uplift_pct)`), and Platform (annual) = licence + round(infra).
  Year 1 = implementation + platform — numerically identical to today.
- **New — per-user derivation**: `per_user_rate = platform / dp_base_y1`
  (the committed base), kept unrounded internally and rendered to clients
  as "₹X.XX per user per year".
- **New — Year 2+ rule**: `max(round(y2_floor_pct × platform),
  round(dp_base_y2 × per_user_rate))`. This REPLACES "platform fee +
  overage above committed" entirely. Pricing now follows usage in both
  directions: a growing user base bills more at the same rate, and a
  shrinking one bills less, floored at `y2_floor_pct` (30% in the seed
  card) of the Year-1 platform fee — a floor that is now actually
  reachable (previously the overage formula could only add to the
  platform fee, never subtract).
- **Superseded**: the per-tier `overage_inr_per_user` rate card column.
  The field is kept on `SaasTier` and in the seed for history/rollback,
  but `priceCmSaas` no longer reads it — the trace's `Overage (Year 2+)`
  step is replaced by `Per-user rate`, `Year 2+ usage`, and
  `Year 2+ (with N% floor)`.
- **Client caveat (mandatory on every SaaS/Hybrid proposal)**: data
  principals who modify, renew, or revoke consent in a later year are not
  counted as new users — they remain covered under the committed base.
  Only net-new data principals count toward the user count used in the
  Year 2+ calculation.
- **Worked example (seed 25L tier)**: committed 2,500,000; infra
  4,387,579; platform 5,887,579; per-user rate 2.3550316. Y1 unchanged at
  6,112,579. Y2 at committed base stays 5,887,579 (round(2,500,000 ×
  2.3550316) reproduces platform exactly). Y2 growth to 3,000,000 users
  now bills 7,065,095 (replacing the old overage-based 7,387,579). Y2
  shrink to 500,000 users bills the floor, 1,766,274 (round(500,000 ×
  2.3550316) = 1,177,516 is below the floor) — the first fixture where the
  floor actually binds.

## 7. AM Proposal Wizard

Four steps, one live price panel (with trace toggle) alongside:

1. **Deal** — customer name, channel (Direct / Aurva / TechJockey / PwC —
   field labelled "Internal — never shown to client"), validity days,
   proposal owner.
2. **Scope** — deployment mode or "Compare all three"; DP base Y1/Y2; module
   toggles (disabled with explanation when SaaS); estate quantities (only the
   buckets for selected modules are shown). Question wording matches the
   finalized DPDP Pricing Questionnaire 1:1 (same 15 items), so a filled
   questionnaire transcribes directly. (Upload-to-prefill from the
   questionnaire xlsx is a later enhancement, noted not promised.)
3. **Commercials** — TCO years (1–5), discount (none / % on total / % per
   component), show-discount toggle, payment-terms text (prefilled from rate
   card copy, editable), special terms free text.
4. **Present & Export** — pick format:
   - **(a) Module-wise** — one line per module (CM, DSPM, DAM, Endpoint),
     Y1..Yn columns + TCO; the pricing-engine style.
   - **(b) SaaS-style** — platform fee + implementation + overage framing,
     subscription language, annual view.
   - **(c) Perfios format** — the Client Proposal layout: 1. What You Get
     (7 CM modules), 2. Commercial Summary, 3. Scope & Coverage,
     4. What Drives Your Price, 5. Payment Terms. In compare mode this
     renders the Model Comparison layout (Option A/B/C side by side +
     recommendation line).
   Preview on screen, then export .xlsx and/or .pdf. On-Prem (and Hybrid
   estate) proposals append the "Infrastructure You Provide" annexure from
   the matched Consentick tier.

**Render contract (D5):** the client-facing render functions receive a
`ClientSafeProposal` type from which channel and internal fields are absent
at the type level — exclusion by construction, not by template discipline.
A unit test asserts no client render output ever contains the strings
"Aurva", "TechJockey", "Tech Jockey", or "PwC" (partner-name blocklist kept
in one place, admin-extendable).

Proposals persist (inputs + rate-card version + rendered totals) so an AM can
reopen, duplicate, or re-export a deal; repricing against a newer rate card
is an explicit action showing old vs new.

AM access: authenticated role (`am`) alongside existing `admin`; existing
partner token links remain public and unchanged.

## 8. Admin Rate Card page

Single page replacing Fields/Modules/CM Tiers/Settings/Questions tabs
(Instances and Versions remain, simplified):

- Four groups mirroring the Excel Rate Card: **On-Prem CM slabs**, **SaaS CM
  tiers**, **Estate rates**, **Parameters**. Each rate: label, value, unit,
  one-line plain-language "what this drives" description, provisional flag.
- The SaaS tier group shows BOTH infra columns with the active basis
  highlighted and a one-click basis switch (D1) with before/after price
  preview for a sample deal.
- Right rail: the live worked example (trace) recomputing on every edit.
- Publish bar: draft state, validation (caps strictly increasing, all
  percentages in [0,1], no gaps), Publish, and version history with one-click
  rollback — the same guarantees as today, one button instead of a tab-hop.

## 9. Exports

- **Excel** (SheetJS or exceljs in-browser, following the existing
  `excel.ts` export path): Client Proposal sheet, Model Comparison sheet
  (compare mode), optional annexure sheet. Perfios styling, INR Indian-digit
  grouping, no formulas required (values are engine output; the workbook is
  a document, not a model).
- **PDF**: print-optimized HTML of the same preview rendered via the
  browser print pipeline (react-to-print / print CSS) — no server needed.
- Both exports run entirely client-side from the previewed proposal, so what
  the AM sees is exactly what the client receives.

## 10. Build stages

1. **Rate card model + engine2 + parity tests.** Schema, seed migration from
   the Excel values (both Consentick columns), pure engine with trace, golden
   fixtures green. (Largest correctness risk; do first.)
2. **Admin Rate Card page** with live trace, validation, publish/rollback;
   retire old tabs behind a feature flag until parity confirmed.
3. **AM wizard + proposals persistence** with live price panel and the three
   on-screen formats, compare mode, negotiation fields.
4. **Exports + annexure**: xlsx + PDF, BOM annexure, partner-name blocklist
   test.
5. **Polish**: questionnaire-prefill upload, discount analytics on the
   quote-event log, retire the feature flag.

Each stage lands with tests and is independently shippable.

## 11. Risks / open items

- The Consentick sizing workbook has internal inconsistencies (10L→25L TPS
  discontinuity, 100L Bridge compute < 50L, 25L DR Redis > primary). Pricing
  is unaffected (it keys off tier totals), but the BOM annexure inherits
  them; flag for a one-time review with the sizing owner before annexures go
  to clients.
- Aurva estate infra sizing remains TBD-until-partner-confirms per standing
  policy; estate proposals carry the existing "infrastructure sizing
  confirmed with our data security partner" note automatically.
- FX (₹83/USD) is a manual admin rate; consider a staleness warning
  (> 90 days since last edit) rather than any auto-update.
- If SaaS list prices must ever move to the SaaS v3 basis, D1 makes it a
  one-click, versioned, rollback-able change — but it is a commercial call,
  not a technical one.
