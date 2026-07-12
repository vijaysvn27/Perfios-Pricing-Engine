# Implementation Plan — DPDP Suite Proposal Builder

Spec: `docs/superpowers/specs/2026-07-12-proposal-builder-revamp-design.md`
Each task lists files + verification. Stages ship independently.

## Stage 1 — engine2 + rate card + parity tests  ✅ (committed cf4db8c)

- [x] `src/lib/engine2/types.ts` — RateCard, DealInputs, ModeResult, TraceStep
- [x] `src/lib/engine2/seed.ts` — RATE_CARD_SEED verbatim from Excel Rate Card
      + both Consentick infra columns (D1)
- [x] `src/lib/engine2/engine2.ts` — `price()` / `priceAllModes()` with trace
- [x] `src/lib/engine2/engine2.test.ts` — golden Excel parity fixtures
- [ ] Run `npx vitest run src/lib/engine2` green (blocked on Node install at
      commit time — MUST pass before Stage 2 starts)
- [ ] `npm run typecheck` green

## Stage 2 — rate card persistence + admin page

1. Migration `0026_rate_cards.sql`: `rate_cards(id, instance_id, status
   draft|published, version, snapshot jsonb, created_by, created_at)` +
   RLS admin-only write, published readable by `am` role. Seed row from
   RATE_CARD_SEED.
2. `src/lib/rateCard/repo.ts` — loadDraft/saveDraft/publish/rollback/listVersions
   (reuse the version-guard pattern from `config/versions.ts`).
3. `src/lib/rateCard/validate.ts` — caps strictly increasing, pcts in [0,1],
   fx > 0, no empty groups. Unit tests.
4. `src/admin/RateCardPage.tsx` — four groups (On-Prem slabs / SaaS tiers /
   Estate rates / Parameters); both infra columns visible, active basis
   highlighted, one-click basis switch with before/after preview on a sample
   deal; right rail = live trace worked example (calls `price()` on every
   edit); publish bar with validation + version history.
5. Feature flag `VITE_RATECARD_ADMIN=1` switches AdminApp between old tabs
   and the new page.
   Verify: edit a slab price → trace updates; publish → new version; rollback
   restores; old tabs untouched with flag off.

## Stage 3 — AM wizard + proposals

1. Migration `0027_proposals.sql`: `proposals(id, name, customer, channel,
   inputs jsonb, rate_card_version, totals jsonb, created_by, updated_at)`;
   `am` role in auth allowlist; RLS: am/admin read-write own instance rows.
2. `src/am/ProposalWizard.tsx` — 4 steps (Deal / Scope / Commercials /
   Present) + persistent live price panel with "How this price is calculated"
   trace accordion. Channel field labelled "Internal — never shown to client".
   Scope questions worded 1:1 with the finalized DPDP Pricing Questionnaire.
3. `src/lib/proposal/clientSafe.ts` — `toClientSafe(proposal): ClientSafeProposal`
   (channel/internal fields absent at type level) + partner-name blocklist
   test (Aurva, TechJockey, Tech Jockey, PwC) over every render output.
4. Routes: `/#/proposals` (list), `/#/proposals/:id` (wizard). Admin sees all.
   Verify: create → save → reopen → duplicate → reprice-against-new-version
   shows old vs new diff.

## Stage 4 — presentation formats + exports

1. `src/lib/proposal/formats/` — three pure render-model builders:
   `moduleWise.ts`, `saasStyle.ts`, `perfiosFormat.ts` (Client Proposal
   layout; compare mode → Model Comparison layout). Snapshot tests.
2. `src/lib/proposal/excelExport.ts` — client workbook (Proposal sheet,
   Comparison sheet, BOM annexure sheet) following existing `excel.ts`
   library choice; INR Indian grouping; no channel strings (blocklist test
   runs over generated cells).
3. `src/lib/proposal/bom.ts` — Consentick tier → "Infrastructure You
   Provide" annexure rows (data lives in rate card `annexures.onprem_bom`,
   seeded from the sizing workbook; admin-editable later).
4. PDF via print CSS on the preview route (`react-to-print` or plain
   `window.print` with `@media print` styles).
   Verify: export all 3 formats × 3 modes; open xlsx; grep exports for
   blocklist; On-Prem export contains annexure, SaaS export does not.

## Stage 5 — polish

- Questionnaire xlsx upload → prefill Scope step (reuse `questionnaire.ts`
  parse path).
- Quote-event log entries for proposal create/export (reuse
  `logQuoteEvent`).
- FX staleness warning (>90 days unedited).
- Remove feature flag; retire old admin tabs; update README + CLAUDE.md
  (AM surface may show line detail — supersedes rule 1 for AM only).

## Standing rules

- All math in engine2 only; UI and exports never do arithmetic.
- Every stage: vitest + typecheck green before commit.
- Excel parity fixtures are regression gates — never edit expected values
  without a rate-card change that justifies it.
