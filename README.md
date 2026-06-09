# Perfios Pricing Engine

Config-driven, base-cost-only pricing calculator. See [CLAUDE.md](CLAUDE.md) for product rules.

## Stage 1 (this commit)
Supabase schema + seed + deterministic pricing engine + engine tests + a minimal
calculator that reads the live published config. No admin UI, no auth, no deploy.

## Stack
React 19 · Vite · TypeScript · Tailwind 4 · Supabase (Postgres + RLS) · Vitest.

## Setup
1. Install Node.js 20+ (includes npm).
2. `npm install`
3. Copy `.env.example` to `.env` and fill in your Supabase URL + publishable key
   (already filled for the provisioned project).
4. Apply the database:
   - migrations in `supabase/migrations/` (schema + RLS), then `supabase/seed.sql`.
   - For the provisioned project these are already applied.

## Commands
- `npm test` — run the engine unit tests (Vitest).
- `npm run typecheck` — TypeScript project check.
- `npm run dev` — start the calculator locally.
- `npm run build` — typecheck + production build.

## Layout
- `src/lib/engine/` — pure, deterministic pricing engine (the only place math lives).
- `src/lib/supabase.ts` — loads the live config snapshot.
- `src/components/Calculator.tsx` — minimal calculator UI (shows Year 1 / Year 2 only).
- `supabase/migrations/`, `supabase/seed.sql` — schema, RLS, and seed/rate card.

All rates and rules are DATA in Supabase. No pricing values are hardcoded in app code.
