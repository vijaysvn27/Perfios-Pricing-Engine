# Stage 3 — Supabase Auth, Admin/Viewer RLS, Vercel Deploy

Date: 2026-06-09
Status: Approved design (pending spec review)
Branch: stacks on `stage-2-admin-config` (Stage 2 + this work merge together later)

## Goal
Add Supabase email/password auth with two roles (admin, viewer), lock all config
writes to admin via RLS (including in-function checks on the publish/rollback RPCs),
require login for the calculator, and prepare a Vercel deploy — without changing the
engine or pricing logic.

## Non-goals (STOP)
- No engine / pricing-logic changes.
- No margin features. No partner-specific instances.
- First URL is internal (Aakash) only — not distributed to external partners yet.
- **No automatic merge or deploy.** Build auth + RLS, apply to Supabase, push the
  branch, then STOP. Merge to `main` and deploy happen ONLY on the user's explicit
  go, AFTER they verify the auth+RLS matrix in Codespaces against real Supabase.

## Auth model
- **Email + password. Public signup OFF** (disabled in Supabase Auth settings —
  manual dashboard toggle, noted in rollout). Accounts are provisioned by the admin
  in the Supabase dashboard.
- **Login required for everything.** The calculator is the default screen after
  login. No anonymous access.

## Role storage
- New enum `user_role` = `admin | viewer`.
- New table `public.profiles (id uuid pk references auth.users on delete cascade,
  email text, role user_role not null default 'viewer', created_at timestamptz default now())`.
- Trigger `on auth.users after insert` → `handle_new_user()` (`security definer`)
  inserts a `profiles` row with role `viewer`.
- `public.is_admin() returns boolean` (`security definer`, `stable`, `set search_path
  = public`): `exists(select 1 from profiles where id = auth.uid() and role='admin')`.
  Being `security definer` means calling it inside the `profiles` RLS policy does NOT
  recurse (it reads the table as definer, bypassing RLS).
- `public.grant_admin(p_email text)` / `public.revoke_admin(p_email text)`
  (`security definer`) — set a user's role by email. Used to assign Aakash admin
  LATER (run via the Supabase SQL editor / MCP once his account exists). Restricted:
  not granted to anon/authenticated (callable only by the service role / SQL editor).

## RLS (migration set)
**profiles:** RLS on. `select to authenticated using (id = auth.uid() or is_admin())`.
No client insert/update/delete (role changes only via `grant_admin` / trigger, both
`security definer`).

**Remove** all Stage 2 permissive anon policies (the 20 anon insert/update/delete/select
on the 5 draft tables) and the anon read policies on `config_versions` (Stage 1
live-read + Stage 2 read-all).

**Draft tables** (`fields, modules, module_fields, cm_tiers, settings`):
- `select to authenticated using (is_admin())`
- `insert/update/delete to authenticated using (is_admin()) with check (is_admin())`
(The calculator never reads these — it reads only the published snapshot — so viewers
need no access here.)

**config_versions:**
- `select to authenticated using (is_live or is_admin())` — viewers read the live
  version (calculator); admin reads all (history).
- No client write policy; writes happen only through the RPCs.

## RPC lockdown (in-function admin checks — the recorded auth-stage task)
Recreate `publish_snapshot`, `rollback_to_version`, `reset_draft_to_live`,
`set_field_tag` with a guard at the top:
`if not public.is_admin() then raise exception 'admin only'; end if;`
Then `revoke execute ... from anon;` and `grant execute ... to authenticated;`. Because
they are `security definer`, the in-function check is the real boundary — table RLS
alone does not protect them.

## App changes (no engine/pricing changes)
- `src/lib/supabase.ts`: keep client (persisted session by default).
- `src/auth/useAuth.tsx`: an AuthProvider/context exposing `{ session, user, role,
  loading, signIn(email,password), signOut() }`. Loads the caller's role from
  `profiles` after sign-in.
- `src/auth/Login.tsx`: email + password form, error display, **no signup link**.
- `src/App.tsx`: while `loading` → spinner; no session → `Login`; logged in → top nav
  with **Calculator** (everyone) and **Admin** (only when `role==='admin'`), plus the
  signed-in email and a **Sign out** button. A viewer hitting `#/admin` is bounced to
  the calculator (route guard).
- Calculator + admin data calls now run under the user's JWT automatically; RLS does
  the enforcement server-side.

## Deploy to Vercel (DESIGNED NOW, EXECUTED ONLY ON EXPLICIT GO)
1. Merge `stage-2-admin-config` → `main` (after Codespaces verification + user go).
2. Import the GitHub repo to Vercel; framework Vite; build `npm run build`; output `dist`.
3. Env vars on Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key).
4. `vercel.json`: SPA fallback rewrite to `/` (harmless with hash routing; safe for
   any direct path).
5. Supabase Auth: disable public signups; set Site URL to the Vercel domain.
6. Production deploy from `main`; hand the URL to the user for the final smoke test.

## Verification
**In Codespaces against the REAL Supabase, BEFORE any deploy (user-run):**
- Provision a test **admin** and a test **viewer** in the Supabase dashboard; run
  `grant_admin('<admin-email>')`.
- Matrix:
  - **Anon (not logged in):** sees Login only; no data reads succeed.
  - **Viewer:** calculator works (reads live version); no Admin nav; direct `#/admin`
    bounces to calculator; any write/publish attempt is denied by RLS.
  - **Admin:** calculator + admin screens; can edit drafts, publish, rollback, reset.
- CI (cloud) covers typecheck + build + existing unit tests (engine/config unchanged).

**Final smoke test:** repeat admin + viewer login on the production URL after deploy.

## Migrations
- `0008_auth_roles.sql` — `user_role` enum, `profiles`, trigger, `is_admin()`,
  `grant_admin`/`revoke_admin`.
- `0009_rls_lockdown.sql` — drop anon policies; add role-based policies on the 5 draft
  tables, `config_versions`, and `profiles`.
- `0010_rpc_admin_checks.sql` — recreate the 4 RPCs with `is_admin()` guard; revoke
  anon execute, grant authenticated.

## Risks
- **Self-lockout / testability:** after lockdown, the admin UI requires an admin
  login. The user must create accounts in the dashboard (signup is off) and
  `grant_admin` the admin before testing. Documented in Verification.
- **Single shared Supabase project:** the lockdown applies to the same project the
  calculator reads. Intended — that's what the user verifies against.
- **Signup-off enforcement** is a Supabase dashboard setting (no MCP tool); listed as
  a manual rollout step.
