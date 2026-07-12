# Project: Perfios Pricing Engine (partner-facing, config-driven)

## What this is
A configurable pricing calculator for Perfios data-privacy and Consent Manager modules.
An admin (Aakash) defines the pricing logic through the UI (no code, no formula typing).
A user picks modules, answers a short quantity questionnaire, and gets a Year 1 and Year 2
base cost. The tool outputs BASE COST ONLY. No margin, ever. Partners add margin outside the tool.

## Stack (fixed)
- React 19 + Vite + TypeScript + Tailwind 4
- Supabase (Postgres + Auth + Row Level Security) as the only backend. Do not use Firestore.
- Deploy target: Vercel (later stage, not now)

## Non-negotiable product rules
1. The calculator NEVER shows: per-unit prices, the sum of per-unit lines, or any margin.
   It shows only the final Year 1 and Year 2 numbers per the published config.
2. All pricing logic is DATA in Supabase, not hardcoded. Changing a rate, adding a field,
   or re-tagging a module is a row edit through the admin UI, never a code change.
3. There is NO free-text formula box anywhere. Logic changes happen only through bounded
   building blocks (unit rate, field-to-module tagging, percentage, multiplier, frequency).
   This is the core safety requirement: the admin must never be able to break the engine.
4. Admin edits happen in a DRAFT. A draft must pass validation, then be PUBLISHED to go live.
   The calculator always reads the latest PUBLISHED version. Every publish is versioned and
   one-click reversible (rollback).

## Addendum — DPDP Suite Proposal Builder (2026-07-12)

The rules above still govern the **partner-facing calculator** (share links,
`#/c/:token`) unchanged: never per-unit prices, never margin, DATA not code,
draft → publish → rollback. The addendum below is scoped to the new,
internal, authenticated **AM proposal surface** only.

1. The AM proposal wizard (`#/proposals`, `src/am/`) is internal-facing and
   MAY show line-item detail, list price, discount, and negotiation fields —
   this supersedes rule 1 for that surface only. The partner calculator is
   untouched.
2. **Channel is internal-only, always.** The deal's channel (Direct / Aurva /
   TechJockey / PwC) must NEVER appear in anything a client sees or receives
   — on-screen client preview, Excel export, or printed PDF. This is enforced
   structurally, not by convention: client render paths only ever receive a
   `ClientSafeProposal` (from `toClientSafe()`), whose type has no channel or
   internal-notes field, plus a `scanForBlocklist()` string scan (terms:
   Aurva, TechJockey, Tech Jockey, PwC) that every export path must assert
   empty before writing. Both live in `src/lib/proposal/clientSafe.ts`
   (`CLIENT_BLOCKLIST`). Keep this invariant — type-level exclusion first,
   blocklist scan as the backstop — when editing that file or any export path.
3. **All pricing math lives in `src/lib/engine2` only** (the Proposal
   Builder's pricing brain — `price()` / `priceAllModes()`, with a full
   calculation `trace`). UI and export code never do arithmetic; it only
   renders `engine2` output. This mirrors the original engine rule 2/3 above,
   restated for the new module.
4. The Excel-parity golden fixtures in `src/lib/engine2/engine2.test.ts` are
   regression gates: never edit an expected value without a rate-card change
   that actually justifies it.

**Environment note:** the dev machine cannot execute Node (endpoint
security). Verification happens in GitHub Actions — full build/test logs are
published to the `ci-logs` branch (readable via `git fetch`, since plain git
transport works even though `api.github.com` does not) — and in Vercel
deploys.

## Engineering standards
- Typed throughout. The pricing engine is a pure, deterministic, unit-tested function:
  same config plus same inputs always returns the same numbers.
- Pricing math lives in ONE module (lib/engine). UI never does arithmetic.
- Currency stored as integer paise or rupees (no floats for money). Format Indian style (1,00,000).
- After each stage, write tests for the engine and run them before reporting done.

## Thinking guidance
- Use deep reasoning (ultrathink) for the data model and the combination engine.
- Default effort for CRUD screens and styling.
