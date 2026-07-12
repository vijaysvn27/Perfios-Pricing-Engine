# Perfios Pricing Engine

Config-driven, base-cost-only pricing calculator — now extended into the
DPDP Suite Proposal Builder. See [CLAUDE.md](CLAUDE.md) for product rules.

## Stage 1 (this commit)
Supabase schema + seed + deterministic pricing engine + engine tests + a minimal
calculator that reads the live published config. No admin UI, no auth, no deploy.

## Proposal Builder

Two new surfaces on top of the original partner calculator, sharing one
pricing brain (`src/lib/engine2`):

- **Admin → Rate Card tab** — single-page rate editing (On-Prem CM slabs,
  SaaS CM tiers, Estate rates, Parameters) with a live worked-example
  calculation trace in the right rail, draft validation, and publish /
  one-click rollback. Added as an additional admin tab alongside the
  existing Fields / Modules / CM Tiers / Questions / Settings tabs.
- **`#/proposals`** — the AM proposal wizard: **Deal → Scope → Commercials →
  Present & Export**, with a persistent live price panel and an expandable
  "How this price is calculated" trace. Three client-facing presentation
  formats — **Module-wise**, **SaaS-style**, **Perfios format** (the
  Client Proposal / Model Comparison layout) — plus **Excel** and
  **print-to-PDF** export. On-Prem and Hybrid deals append an auto-generated
  "Infrastructure You Provide" hardware annexure. A per-proposal **compare
  mode** prices all three deployment modes (On-Prem / Hybrid / SaaS)
  side by side.

Channel (Direct / Aurva / TechJockey / PwC) and other internal fields are
captured for AM tracking only and are structurally excluded from every
client-facing render, export, and print path — see `CLAUDE.md` for the
enforcement mechanism.

> **Before rate-card edits or proposals persist server-side, apply
> `supabase/migrations/0026_rate_cards.sql`.** Until then, the Rate Card
> tab runs read-only from the built-in seed rate card
> (`src/lib/engine2/seed.ts`) and proposals fall back to saving in the
> browser's `localStorage` (with a banner indicating local-only storage).

## Stack
React 19 · Vite · TypeScript · Tailwind 4 · Supabase (Postgres + RLS) · Vitest.
**Node 22+ is required** (`@supabase/realtime-js` needs native WebSocket at
import time, which Node 20 lacks — test suites import the Supabase client).

## Setup
1. Install Node.js 22+ (includes npm).
2. `npm install`
3. Copy `.env.example` to `.env` and fill in your Supabase URL + publishable key
   (already filled for the provisioned project).
4. Apply the database:
   - migrations in `supabase/migrations/` (schema + RLS), then `supabase/seed.sql`.
   - For the provisioned project these are already applied, **except**
     `0026_rate_cards.sql` — see the Proposal Builder callout above.

## Commands
- `npm test` — run the engine unit tests (Vitest).
- `npm run typecheck` — TypeScript project check.
- `npm run dev` — start the calculator locally.
- `npm run build` — typecheck + production build.

## CI / verification

The dev machine cannot execute Node (endpoint security) and cannot reach
`api.github.com`, but plain git transport works. `.github/workflows/ci.yml`
runs `npm install`, `npm test`, and `npm run build` on every push, then
publishes the full combined log as `ci-build.log` to an orphan **`ci-logs`**
branch (force-pushed each run) so the dev machine can `git fetch` and read
build/test output without running Node locally. Deploys are verified on
Vercel. Current status: 173/173 tests green.

## Layout
- `src/lib/engine/` — original pure, deterministic pricing engine (partner calculator).
- `src/lib/engine2/` — pricing brain for the Proposal Builder: `price()` /
  `priceAllModes()` over the rate-card data model, with a full calculation
  `trace` returned alongside every number. Excel-parity golden fixtures live
  in `engine2.test.ts` (see CLAUDE.md — these are regression gates).
- `src/lib/rateCard/` — rate-card persistence (draft/publish/rollback,
  Supabase-backed with seed/localStorage fallback) and validation.
- `src/lib/proposal/` — client-safety (`clientSafe.ts`), the three
  presentation-format builders (`formats/`), Excel export, and the
  On-Prem hardware BOM annexure data.
- `src/am/` — the AM proposal wizard (`ProposalsApp.tsx`, `ProposalWizard.tsx`,
  step components, live `PricePanel`).
- `src/lib/supabase.ts` — loads the live config snapshot.
- `src/components/Calculator.tsx` — minimal calculator UI (shows Year 1 / Year 2 only).
- `supabase/migrations/`, `supabase/seed.sql` — schema, RLS, and seed/rate card.

All rates and rules are DATA in Supabase. No pricing values are hardcoded in app code.
