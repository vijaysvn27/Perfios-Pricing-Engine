# Implementation Plan — DPDP Suite Proposal Builder

Spec: `docs/superpowers/specs/2026-07-12-proposal-builder-revamp-design.md`
Each task lists files + verification. Stages ship independently.

## Stage 1 — engine2 + rate card + parity tests  ✅ (committed cf4db8c)

- [x] `src/lib/engine2/types.ts` — RateCard, DealInputs, ModeResult, TraceStep
- [x] `src/lib/engine2/seed.ts` — RATE_CARD_SEED verbatim from Excel Rate Card
      + both Consentick infra columns (D1)
- [x] `src/lib/engine2/engine2.ts` — `price()` / `priceAllModes()` with trace
- [x] `src/lib/engine2/engine2.test.ts` — golden Excel parity fixtures
- [x] `npx vitest run` green — 74/74 (21 new + 53 existing), verified 2026-07-12
- [x] `npm run typecheck` green — verified 2026-07-12

## Stage 2 — rate card persistence + admin page  ✅ shipped

1. [x] Migration `0026_rate_cards.sql`: `rate_cards(id, instance_id, status
   draft|published, version, snapshot jsonb, created_by, created_at)` +
   RLS admin-only write, published readable by any authenticated user —
   note: implemented as "any authenticated session" rather than a distinct
   `am` role (no separate role was added; see Stage 3 note). Seed row comes
   from `RATE_CARD_SEED` via the read-only fallback path, not a seed insert.
2. [x] `src/lib/rateCard/repo.ts` — `loadDraft`/`saveDraft`/`publishDraft`/
   `rollback`/`listVersions`, plus `isMissingTable` graceful-degradation
   (falls back to `RATE_CARD_SEED`, `persisted: false`, instead of throwing
   when the table isn't migrated yet).
3. [x] `src/lib/rateCard/validate.ts` — caps strictly increasing, pcts in
   [0,1], fx > 0, no empty groups. Unit tests in `validate.test.ts`.
4. [x] `src/admin/RateCardPage.tsx` (+ `src/admin/rateCard/` helpers) — four
   groups (On-Prem slabs / SaaS tiers / Estate rates / Parameters); both
   infra columns visible with active basis highlighted and a one-click
   basis switch; right rail = live trace worked example (calls `price()`
   on every edit); publish bar with validation + version history/rollback.
5. [x] No feature flag — additive tab instead. "Rate Card" was added as a
   new tab alongside the existing Fields / Modules / CM Tiers / Questions /
   Settings / Versions tabs (all left in place, untouched) rather than
   gating a replacement behind `VITE_RATECARD_ADMIN`.
   Verify: edit a slab price → trace updates; publish → new version;
   rollback restores; old tabs untouched — all hold.

## Stage 3 — AM wizard + proposals  ✅ shipped

1. [x] No separate `0027_proposals.sql` — the `proposals` table was added
   directly in `0026_rate_cards.sql` alongside `rate_cards`. No distinct
   `am` auth role either: `useAuth` only knows `admin`/`viewer`/`null`, and
   any authenticated (non-admin) user can reach `#/proposals`; RLS on
   `proposals` is owner-or-admin (`created_by = auth.uid() or is_admin()`)
   rather than a role-based policy.
2. [x] `src/am/ProposalWizard.tsx` — 4 steps (Deal / Scope / Commercials /
   Present) + persistent live price panel (`PricePanel.tsx`) with "How this
   price is calculated" trace accordion. Channel field labelled "Internal —
   never shown to client". Scope questions worded 1:1 with the finalized
   DPDP Pricing Questionnaire.
3. [x] `src/lib/proposal/clientSafe.ts` — `toClientSafe(proposal):
   ClientSafeProposal` (channel/internal fields absent at type level) +
   `CLIENT_BLOCKLIST`/`scanForBlocklist` partner-name scan (Aurva,
   TechJockey, Tech Jockey, PwC), asserted empty in `clientSafe.test.ts`
   and re-run over every export payload.
4. [x] Routes: `#/proposals` (list), wizard is in-view (not a separate
   `:id` route — `ProposalsApp` swaps list/wizard views internally). Admin
   and any authenticated user can reach it via nav.
   Note: create → save → reopen → duplicate all work; repricing against a
   newer rate-card version happens automatically on every save (silently
   updates `rate_card_version` to the currently loaded published version) —
   there is no "old vs new" diff view. Not built; not currently planned.

## Stage 4 — presentation formats + exports  ✅ shipped

1. [x] `src/lib/proposal/formats/` — three pure render-model builders:
   `moduleWise.ts`, `saasStyle.ts`, `perfiosFormat.ts` (Client Proposal
   layout; compare mode → Model Comparison layout), assembled via
   `formats/index.ts`. Snapshot tests in `formats.test.ts`.
2. [x] `src/lib/proposal/excelExport.ts` — client workbook via `exceljs`;
   INR Indian grouping; `scanForBlocklist` runs over the render model and
   BOM before any cell is written, throwing on a hit rather than exporting.
3. [x] `src/lib/proposal/bomData.ts` (named `bomData.ts`, not `bom.ts`) —
   Consentick tier → "Infrastructure You Provide" annexure rows, keyed off
   DP base via `bomForDpBase`/`tierKeyForDpBase`; data is static seed data
   today, not yet wired into rate card `annexures.onprem_bom` for
   admin-editing (still hardcoded in the module, per the spec's "admin
   editable later" note).
4. [x] PDF via plain `window.print()` + `@media print` CSS scoped to a
   `.print-root` wrapper (no `react-to-print` dependency added).
   Verify: all 3 formats × 3 modes render; xlsx export blocked and flagged
   if blocklist terms are present; On-Prem/Hybrid export includes the BOM
   annexure, SaaS export does not — all hold.

## Deferred (Stage 5 — not shipped)

- [ ] Questionnaire xlsx upload → prefill Scope step (reuse
  `questionnaire.ts` parse path). No upload/prefill code exists yet in
  `src/am/steps/Step2Scope.tsx`.
- [ ] Quote-event log entries for proposal create/export (reuse
  `logQuoteEvent`). Proposal save/export paths do not call it.
- [ ] FX staleness warning (>90 days since `fx_inr_per_usd` last edited).
  Not implemented — no last-edited timestamp is tracked per rate.
- [ ] Retire old admin tabs (Fields/Modules/CM Tiers/Questions/Settings) now
  that Rate Card has shipped — currently both live side by side
  indefinitely; no feature flag to remove since none was added (see Stage
  2 note).

## Standing rules

- All math in engine2 only; UI and exports never do arithmetic.
- Every stage: vitest + typecheck green before commit.
- Excel parity fixtures are regression gates — never edit expected values
  without a rate-card change that justifies it.
