# Stage 2 — Admin Config UI with Draft, Validation, Publish, Versioning, Rollback

Date: 2026-06-09
Status: Approved design (pending spec review)

## Goal
Let the admin (Aakash) change all pricing logic through **forms only** — fields,
field→module tags, percentages, multipliers, settings toggles — edit them in a
**draft**, see a **live engine preview**, pass **validation**, **publish** a
versioned snapshot, and **roll back** to any prior version in one click. The
calculator continues to read only the latest **published** version. No free-text
formulas. No changes to the Stage 1 engine math. No auth yet.

## Non-goals (STOP list)
- No raw/free-text formula editing of any kind.
- No changes to the Stage 1 engine calculation logic (`src/lib/engine`).
- No authentication, roles, or partner instances.

## Core model: the draft IS the normalized tables
The Stage 1 normalized tables (`fields`, `modules`, `module_fields`, `cm_tiers`,
`settings`) are the **single shared draft / working set**. `config_versions`
holds the **published** history. The calculator only ever reads the live
`config_versions` snapshot, so editing the draft tables changes nothing live
until Publish. No new draft-storage tables are introduced.

```
Admin edits ──auto-save──> draft tables ──buildSnapshot()──> ConfigSnapshot
                                                  │
                          ┌───────────────────────┼───────────────────────┐
                          ▼                        ▼                        ▼
                  live engine preview        validateDraft()         Publish (RPC)
                  (Year 1 / Year 2)          (gate publish)          new live version
```

## Single source of truth: one pure `buildSnapshot`
`src/lib/config/buildSnapshot.ts` — a pure function
`buildSnapshot(draft) -> ConfigSnapshot` (the engine's existing input type). It is
used for BOTH the live preview AND what gets published (the client sends that exact
JSON to the publish RPC). "What you preview is what you publish." Unit-tested to
reproduce the Stage 1 seed snapshot. There is no second SQL snapshot builder, so
nothing can drift.

## Schema change (migration `0003`)
Add an explicit pricing classifier so behavior generalizes beyond the `CM` key.

- `modules.pricing_type` — new enum `pricing_type` = `composite | multiplier | tier`.
  Backfill the `modules` table: DSPM/DATA_FLOW/DAM = `composite`,
  ROPA_STANDALONE = `multiplier`, CM = `tier`. `not null`.
- `ConfigSnapshot.ModuleDef` gains `pricing_type` (additive; **the engine ignores
  it** — math unchanged). Validation and the admin UI use it.
- `modules.deployment_pct` and `modules.amc_pct` remain in the schema as
  **nullable / reserved** but are **never edited in the UI** — see Modules tab.
- The existing **v1 snapshot is left immutable**. Migration `0003`, after adding
  and backfilling `pricing_type`, **publishes a NEW version (v2)** built from the
  updated tables (carrying `pricing_type`) and sets v2 live. v1 stays untouched as
  history. The calculator does not depend on `pricing_type`, so this is safe.

## RPCs (migration `0003`, `security definer`, granted to anon for now)
Versioning stays atomic and server-side; the engine is not involved.
- `publish_snapshot(p_snapshot jsonb, p_published_by text) returns int` —
  `v_no = max(version_no)+1`; set all `is_live=false`; insert new row `is_live=true`;
  return `v_no`.
- `rollback_to_version(p_version_no int) returns void` — set all `is_live=false`,
  then set the chosen version `is_live=true`.
- `reset_draft_to_live() returns void` — overwrite the draft tables with the
  contents of the current live snapshot (discards experimental draft edits).
  Atomic: replace `fields/modules/module_fields/cm_tiers/settings` from the live
  `config_versions.snapshot`.

> SECURITY (accepted tradeoff, no auth yet): these RPCs are `execute`-granted to
> anon and the draft tables get permissive anon write RLS. Recorded as the first
> auth-stage task — table RLS **and** the RPC grants must both be gated to an admin
> role then. The calculator only reads published versions, so end users are never
> affected by drafts.

## RLS (migration `0003`)
- `fields, modules, module_fields, cm_tiers, settings`: permissive anon
  `select/insert/update/delete` (draft editing).
- `config_versions`: anon may `select` ALL versions (history). Writes only via RPCs.

## Validation (`src/lib/config/validateDraft.ts`, pure, unit-tested)
Runs on the draft `ConfigSnapshot`; Publish is disabled while any error exists.
1. Every **field-priced** module (`pricing_type` in `composite | multiplier`) has
   ≥ 1 active tagged field. `pricing_type = tier` is **exempt** (tier-based, no
   fields). Keyed on `pricing_type`, NOT on `module_key`.
2. No `module_fields` tag references a missing or inactive field.
3. All percentages and multipliers are numeric and ≥ 0 (settings deployment/amc,
   any module overrides, each `cm_tiers.amc_pct`; a `multiplier`-type module has a
   numeric multiplier ≥ 0).
4. Every `cm_tier` has a license fee (present, numeric, ≥ 0).
5. Integrity: non-empty unique `field_key`/`module_key`/`tier_key`; integer unit
   prices ≥ 0.
Each error: `{ code, message, entityType, entityKey }`.

## UI (forms only; hash routing, no new dependency)
- Routes: `#/` = calculator (unchanged), `#/admin` = admin.
- Admin layout: tabs (**Fields · Modules · CM Tiers · Settings · Versions**) +
  a sticky right panel (**Preview + Validation + Publish**).
- **Fields**: add / edit / deactivate — key, label, unit price (int), frequency
  (dropdown), sort order.
- **Modules**: edit label and `pricing_type`; tag/untag fields via checkboxes
  (this is how "what DSPM includes" changes). For `multiplier`-type modules, edit
  the multiplier. **Per-module `deployment_pct`/`amc_pct` are NOT shown** — the
  engine applies a single global deployment%/amc% from Settings to the combined
  composite base (Stage 1 D1) and ignores per-module overrides, so editing them
  would silently have no effect. Deployment/amc % are edited only in Settings. The
  visible inputs adapt to `pricing_type` (tier modules show no field tags;
  multiplier modules show the multiplier).
- **CM Tiers**: license fee, amc %, implementation fee.
- **Settings**: `y2_includes_deployment` toggle, `cm_model` dropdown,
  deployment/amc %, rounding, currency.
- **Preview**: choose a sample selection → live Year 1 / Year 2 from the engine on
  the draft snapshot (admin-only; expandable breakdown is acceptable here).
- **Versions**: list (version no, published_by, published_at, LIVE flag) +
  one-click **Rollback**.
- **Reset draft to live**: button that calls `reset_draft_to_live()` after a
  confirm, discarding draft edits.

### Auto-save behavior (refinement)
Edits commit **on blur / debounced (~500 ms)**, never on every keystroke. A value
is validated as well-formed (numeric/integer where required) before it is written,
so partial or `NaN` values are never persisted. The DB is not hammered.

`published_by` is a free-text name field on the Publish dialog (default `admin`)
since there is no auth yet.

## Data access (`src/lib/config/`)
- `draftRepo.ts` — typed Supabase CRUD for the five draft tables + `loadDraft()`
  (reads all five into draft state).
- `versions.ts` — `listVersions()`, `publish(snapshot, publishedBy)`,
  `rollback(versionNo)`, `resetDraftToLive()` (RPC wrappers).
- `buildSnapshot.ts`, `validateDraft.ts` — pure, tested.

## Devcontainer (so previews actually run)
Add `.devcontainer/devcontainer.json` pinning **Node 20** (fixes the Node-16 build
failure seen in Codespaces) so the admin + calculator can be previewed in the cloud.

## Testing / verification
CI (cloud) verifies what is automatable:
- `buildSnapshot` unit tests (draft → snapshot). Parity is like-for-like: the seed
  snapshot fixture it asserts against is updated to include `pricing_type` on every
  module, since `buildSnapshot` now emits it.
- `validateDraft` unit tests: zero-field composite fails; `tier` module with zero
  fields passes (exemption); negative pct fails; missing cm license fails; dangling
  tag fails; valid draft passes.
- Stage 1 engine tests still green (engine untouched).
- typecheck + production build.

Not auto-verifiable (needs a real run via Codespaces/Vercel; called out explicitly):
interactive CRUD persistence, publish/rollback/reset round-trips, preview
reactivity, auto-save-on-blur.

## Risks
- **Security (accepted):** anon can write drafts and invoke publish/rollback until
  the auth stage. Recorded in memory.
- **Builder parity:** `buildSnapshot` must reproduce the exact snapshot shape the
  engine expects; covered by a test asserting equality with the Stage 1 seed
  snapshot.
- **pricing_type / engine routing redundancy:** the engine still routes via its
  Stage 1 logic; `pricing_type` is additive. A future refactor could unify them,
  out of scope now.
