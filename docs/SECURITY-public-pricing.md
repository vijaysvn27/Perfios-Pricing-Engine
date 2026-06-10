# Public pricing — security model (Stage 4 / Option B)

The no-login partner calculator (`#/c/<token>`) is priced **server-side**. The
rate card (per-unit prices, licence/AMC fees, rate-bearing settings) **never
reaches the browser**.

## Token
- `instances.share_token` is 128-bit random (`encode(gen_random_bytes(16),'hex')`),
  unguessable and non-enumerable.
- `regenerate_token` issues a new token; the old link immediately returns nothing.
- Only an **active** instance with a **live** published version serves anything.

## Server functions and grants

| Function | Returns | Granted to | Notes |
|---|---|---|---|
| `get_published_config(token)` | **Full snapshot incl. `unit_price`** | **`service_role` ONLY** | anon=false, authenticated=false, security_definer=true (verified). Called only by the Edge Function. No `is_admin()` body check — that would break the service-role caller. |
| `get_public_form(token)` | Price-**stripped** form (module/field/tier *labels*, tags, export copy) | anon, authenticated, service_role | No `unit_price`, no fees, no deployment/amc %, no `cm_model`. |
| `hit_rate_limit(bucket,max,window)` | bool (allowed) | `service_role` ONLY | Fixed-window counter in `public.rate_limits`. |
| `publish_snapshot` / `rollback_to_version` / `reset_draft_to_live` / `set_field_tag` / `clone_instance` / `rename_instance` / `regenerate_token` | — | `authenticated` (anon revoked) | All guarded by `is_admin()` in the body. |

`config_versions` and the draft tables (`fields`/`modules`/`module_fields`/
`cm_tiers`/`settings`) and `instances` are **admin-only** via RLS. There is **no
anon read** of any rate-bearing data.

## `price-instance` Edge Function (public, `verify_jwt=false`)
- Reads the snapshot **only server-side** via the service-role `get_published_config`.
- Runs the **same** engine (`src/lib/engine`) + `buildClientBreakdown`
  (`src/lib/breakdown`) — bundled from the canonical source (only `.ts` import
  extensions differ), not a re-implementation.
- Validates selections: module/field/tier keys must exist in the snapshot;
  quantities must be numeric ≥ 0; unknown keys ignored.
- Returns **only** `{ year1, year2, breakdown }` (client-safe bucket lines). Never
  the snapshot, never `breakdown_for_admin_only`, never per-unit data.
- **Rate limited**: 60 requests / 60s per client IP (`hit_rate_limit`).
- Errors are generic (`not available`, `invalid request`, `rate limit exceeded`) —
  no rates in any error/debug output.

## Verified (live)
- `price-instance` valid token → results only; **no `unit_price`**, no admin breakdown.
- Invalid / regenerated / inactive token → **404**, empty.
- `get_public_form` (anon) → no `unit_price` / `license_fee` / `deployment_pct`.
- `get_published_config` (anon, authenticated) → **blocked** (401 / no privilege).
- `hit_rate_limit` → blocks past the limit.

## Follow-ups
- Delete the decommissioned `engine-poc` Edge Function from the dashboard.
- The admin Preview panel still runs the engine client-side on the admin's own
  draft (rates they manage) — that is intentional and admin-only.
