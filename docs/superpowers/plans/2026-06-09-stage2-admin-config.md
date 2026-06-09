# Stage 2 — Admin Config UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin UI to edit pricing config as a draft, preview it live with the Stage 1 engine, validate it, publish versioned snapshots, and roll back — calculator keeps reading only the live published version.

**Architecture:** The Stage 1 normalized tables ARE the draft working set; `config_versions` holds published snapshots. A single pure `buildSnapshot(draft)` feeds both the live preview and Publish (no drift). Publish/rollback/reset are atomic `security definer` RPCs. The Stage 1 engine math is untouched.

**Tech Stack:** React 19 + Vite + TS + Tailwind 4, Supabase (Postgres + RLS + RPC), Vitest. Hash routing (no new dependency).

**Execution note (no local Node):** test "run" steps execute in **CI on push** (and optionally Codespaces with the Node-20 devcontainer), not locally. Each task ends by pushing; CI is the gate.

---

## File Structure

**Database (applied via Supabase MCP; SQL kept in repo):**
- Create `supabase/migrations/0003_pricing_type.sql` — `pricing_type` enum + column + backfill.
- Create `supabase/migrations/0004_rpcs.sql` — `publish_snapshot`, `rollback_to_version`, `reset_draft_to_live`.
- Create `supabase/migrations/0005_admin_rls.sql` — permissive anon write RLS + read-all on `config_versions`.
- Create `supabase/migrations/0006_republish_v2.sql` — publish v2 snapshot carrying `pricing_type` (v1 left immutable).

**Engine types (additive only — no math change):**
- Modify `src/lib/engine/types.ts` — add `PricingType`, `ModuleDef.pricing_type`.
- Modify `src/lib/engine/index.ts` — export `PricingType`.
- Modify `src/lib/engine/__fixtures__/seedSnapshot.ts` — add `pricing_type` per module.

**Pure config lib (new, unit-tested):**
- Create `src/lib/config/types.ts` — `DraftState`, `ValidationError`.
- Create `src/lib/config/buildSnapshot.ts` (+ `.test.ts`).
- Create `src/lib/config/validateDraft.ts` (+ `.test.ts`).

**Data access (new):**
- Create `src/lib/config/draftRepo.ts` — Supabase CRUD + `loadDraft()`.
- Create `src/lib/config/versions.ts` — `listVersions/publish/rollback/resetDraftToLive`.

**UI (new):**
- Modify `src/App.tsx` — hash router.
- Create `src/admin/useDraft.ts` — load + debounced/blur autosave + reset.
- Create `src/admin/AdminApp.tsx` — shell + tabs + sticky panel.
- Create `src/admin/FieldsEditor.tsx`, `ModulesEditor.tsx`, `CmTiersEditor.tsx`, `SettingsEditor.tsx`, `VersionHistory.tsx`.
- Create `src/admin/PreviewPanel.tsx`, `ValidationPanel.tsx`.

**Infra:**
- Create `.devcontainer/devcontainer.json` — Node 20 for Codespaces previews.

---

## Task 1: Migration 0003 — pricing_type enum + column + backfill

**Files:** Create `supabase/migrations/0003_pricing_type.sql`

- [ ] **Step 1: Write the SQL**

```sql
create type pricing_type as enum ('composite', 'multiplier', 'tier');

alter table public.modules add column pricing_type pricing_type;

update public.modules set pricing_type = 'composite' where module_key in ('DSPM','DATA_FLOW','DAM');
update public.modules set pricing_type = 'multiplier' where module_key = 'ROPA_STANDALONE';
update public.modules set pricing_type = 'tier' where module_key = 'CM';

alter table public.modules alter column pricing_type set not null;
```

- [ ] **Step 2: Apply via MCP** `apply_migration(name='0003_pricing_type', query=<sql>)`. Expected: `{"success":true}`.
- [ ] **Step 3: Verify** `execute_sql("select module_key, pricing_type from public.modules order by module_key")`. Expected: CM=tier, DAM/DATA_FLOW/DSPM=composite, ROPA_STANDALONE=multiplier.
- [ ] **Step 4: Commit** `git add supabase/migrations/0003_pricing_type.sql && git commit -m "feat(db): add modules.pricing_type"`

---

## Task 2: Migration 0004 — RPCs

**Files:** Create `supabase/migrations/0004_rpcs.sql`

- [ ] **Step 1: Write the SQL**

```sql
-- Publish the client-built snapshot as a new live version. Atomic.
create or replace function public.publish_snapshot(p_snapshot jsonb, p_published_by text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_no integer;
begin
  select coalesce(max(version_no), 0) + 1 into v_no from public.config_versions;
  update public.config_versions set is_live = false where is_live;
  insert into public.config_versions (version_no, snapshot, published_by, is_live)
  values (v_no, p_snapshot, coalesce(nullif(p_published_by, ''), 'admin'), true);
  return v_no;
end $$;

-- Roll back: make a prior version live.
create or replace function public.rollback_to_version(p_version_no integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.config_versions where version_no = p_version_no) then
    raise exception 'version % does not exist', p_version_no;
  end if;
  update public.config_versions set is_live = false where is_live;
  update public.config_versions set is_live = true where version_no = p_version_no;
end $$;

-- Reset the draft tables to the current live snapshot (discard experimental edits).
create or replace function public.reset_draft_to_live()
returns void language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  select snapshot into s from public.config_versions where is_live limit 1;
  if s is null then raise exception 'no live version to reset from'; end if;

  delete from public.module_fields;
  delete from public.fields;
  delete from public.modules;
  delete from public.cm_tiers;

  insert into public.fields (field_key, label, unit_price_inr, frequency, active, sort_order)
  select x.field_key, x.label, x.unit_price_inr, x.frequency::frequency, x.active, x.sort_order
  from jsonb_to_recordset(s->'fields') as x(field_key text, label text, unit_price_inr int, frequency text, active boolean, sort_order int);

  insert into public.modules (module_key, label, kind, pricing_type, deployment_pct, amc_pct, multiplier, applies_multiplier, active)
  select x.module_key, x.label, x.kind::module_kind, x.pricing_type::pricing_type, x.deployment_pct, x.amc_pct, x.multiplier, x.applies_multiplier, x.active
  from jsonb_to_recordset(s->'modules') as x(module_key text, label text, kind text, pricing_type text, deployment_pct numeric, amc_pct numeric, multiplier numeric, applies_multiplier boolean, active boolean);

  insert into public.module_fields (module_id, field_id)
  select m.id, f.id
  from jsonb_to_recordset(s->'module_fields') as x(module_key text, field_key text)
  join public.modules m on m.module_key = x.module_key
  join public.fields f on f.field_key = x.field_key;

  insert into public.cm_tiers (tier_key, label, license_fee_inr, amc_pct, implementation_fee_inr)
  select x.tier_key, x.label, x.license_fee_inr, x.amc_pct, x.implementation_fee_inr
  from jsonb_to_recordset(s->'cm_tiers') as x(tier_key text, label text, license_fee_inr int, amc_pct numeric, implementation_fee_inr int);

  update public.settings set
    currency = s->'settings'->>'currency',
    deployment_pct = (s->'settings'->>'deployment_pct')::numeric,
    amc_pct = (s->'settings'->>'amc_pct')::numeric,
    y2_includes_deployment = (s->'settings'->>'y2_includes_deployment')::boolean,
    cm_model = (s->'settings'->>'cm_model')::cm_model,
    rounding = s->'settings'->>'rounding'
  where id = true;
end $$;

grant execute on function public.publish_snapshot(jsonb, text) to anon, authenticated;
grant execute on function public.rollback_to_version(integer) to anon, authenticated;
grant execute on function public.reset_draft_to_live() to anon, authenticated;
```

- [ ] **Step 2: Apply via MCP.** Expected `{"success":true}`.
- [ ] **Step 3: Commit** `git add supabase/migrations/0004_rpcs.sql && git commit -m "feat(db): publish/rollback/reset RPCs"`

---

## Task 3: Migration 0005 — admin RLS

**Files:** Create `supabase/migrations/0005_admin_rls.sql`

- [ ] **Step 1: Write the SQL** (permissive — accepted no-auth tradeoff; locked down in auth stage)

```sql
do $$
declare t text;
begin
  foreach t in array array['fields','modules','module_fields','cm_tiers','settings'] loop
    execute format('create policy "anon read %1$s" on public.%1$s for select to anon, authenticated using (true);', t);
    execute format('create policy "anon write %1$s" on public.%1$s for insert to anon, authenticated with check (true);', t);
    execute format('create policy "anon update %1$s" on public.%1$s for update to anon, authenticated using (true) with check (true);', t);
    execute format('create policy "anon delete %1$s" on public.%1$s for delete to anon, authenticated using (true);', t);
  end loop;
end $$;

-- Admin needs full version history (calculator's live-only policy stays for read of live).
create policy "anon read all config versions" on public.config_versions
  for select to anon, authenticated using (true);
```

- [ ] **Step 2: Apply via MCP.** Expected `{"success":true}`.
- [ ] **Step 3: Verify advisors** `get_advisors(type='security')` — the prior `rls_enabled_no_policy` INFOs should clear for these tables.
- [ ] **Step 4: Commit** `git add supabase/migrations/0005_admin_rls.sql && git commit -m "feat(db): permissive anon RLS for draft editing (auth stage will lock down)"`

---

## Task 4: Engine types — add pricing_type (additive)

**Files:** Modify `src/lib/engine/types.ts`, `src/lib/engine/index.ts`, `src/lib/engine/__fixtures__/seedSnapshot.ts`

- [ ] **Step 1: Add type + field** in `types.ts`: add `export type PricingType = 'composite' | 'multiplier' | 'tier'` and add `pricing_type: PricingType` to `ModuleDef` (place after `kind`).
- [ ] **Step 2: Export** add `PricingType` to the `export type { ... }` block in `index.ts`.
- [ ] **Step 3: Fixture** in `seedSnapshot.ts` add `pricing_type` to each module: DSPM/DATA_FLOW/DAM `'composite'`, ROPA_STANDALONE `'multiplier'`, CM `'tier'`.
- [ ] **Step 4: Push; CI runs engine tests.** Expected: Stage 1 engine tests still PASS (math unchanged; field is ignored by engine).
- [ ] **Step 5: Commit** `git commit -am "feat(engine): add additive ModuleDef.pricing_type (math unchanged)"`

---

## Task 5: `buildSnapshot` (pure) + parity test

**Files:** Create `src/lib/config/types.ts`, `src/lib/config/buildSnapshot.ts`, `src/lib/config/buildSnapshot.test.ts`

- [ ] **Step 1: Draft types** in `src/lib/config/types.ts`:

```ts
import type { CmTier, FieldDef, ModuleDef, ModuleFieldTag, Settings } from '../engine'

export interface DraftState {
  fields: FieldDef[]
  modules: ModuleDef[]
  module_fields: ModuleFieldTag[]
  cm_tiers: CmTier[]
  settings: Settings
}

export interface ValidationError {
  code: string
  message: string
  entityType: 'field' | 'module' | 'module_field' | 'cm_tier' | 'settings'
  entityKey: string
}
```

- [ ] **Step 2: Write failing test** `buildSnapshot.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildSnapshot } from './buildSnapshot'
import { seedSnapshot } from '../engine/__fixtures__/seedSnapshot'
import type { DraftState } from './types'

describe('buildSnapshot', () => {
  it('reproduces the seed snapshot from equivalent draft state (parity)', () => {
    const draft: DraftState = {
      fields: seedSnapshot.fields,
      modules: seedSnapshot.modules,
      module_fields: seedSnapshot.module_fields,
      cm_tiers: seedSnapshot.cm_tiers,
      settings: seedSnapshot.settings,
    }
    expect(buildSnapshot(draft)).toEqual(seedSnapshot)
  })

  it('emits pricing_type on every module', () => {
    const draft: DraftState = {
      fields: seedSnapshot.fields, modules: seedSnapshot.modules,
      module_fields: seedSnapshot.module_fields, cm_tiers: seedSnapshot.cm_tiers,
      settings: seedSnapshot.settings,
    }
    for (const m of buildSnapshot(draft).modules) expect(m.pricing_type).toBeTruthy()
  })
})
```

- [ ] **Step 3: Implement** `buildSnapshot.ts` — normalize ordering so output is deterministic:

```ts
import type { ConfigSnapshot } from '../engine'
import type { DraftState } from './types'

/** Assemble a deterministic ConfigSnapshot from draft state. Used for BOTH the
 *  live preview and Publish, so what you preview is exactly what you publish. */
export function buildSnapshot(draft: DraftState): ConfigSnapshot {
  const fields = [...draft.fields].sort((a, b) => a.sort_order - b.sort_order || a.field_key.localeCompare(b.field_key))
  const modules = [...draft.modules].sort((a, b) => a.module_key.localeCompare(b.module_key))
  const fieldOrder = new Map(fields.map((f, i) => [f.field_key, i]))
  const module_fields = [...draft.module_fields].sort(
    (a, b) => a.module_key.localeCompare(b.module_key) ||
      (fieldOrder.get(a.field_key) ?? 0) - (fieldOrder.get(b.field_key) ?? 0),
  )
  const cm_tiers = [...draft.cm_tiers].sort((a, b) => a.license_fee_inr - b.license_fee_inr)
  return { fields, modules, module_fields, cm_tiers, settings: draft.settings }
}
```

- [ ] **Step 4: Push; CI runs `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `git add src/lib/config && git commit -m "feat(config): pure buildSnapshot with seed parity test"`

---

## Task 6: `validateDraft` (pure) + tests

**Files:** Create `src/lib/config/validateDraft.ts`, `src/lib/config/validateDraft.test.ts`

- [ ] **Step 1: Write failing tests** covering each rule:

```ts
import { describe, expect, it } from 'vitest'
import { validateDraft } from './validateDraft'
import { seedSnapshot } from '../engine/__fixtures__/seedSnapshot'
import type { DraftState } from './types'

const base = (): DraftState => ({
  fields: structuredClone(seedSnapshot.fields),
  modules: structuredClone(seedSnapshot.modules),
  module_fields: structuredClone(seedSnapshot.module_fields),
  cm_tiers: structuredClone(seedSnapshot.cm_tiers),
  settings: structuredClone(seedSnapshot.settings),
})

describe('validateDraft', () => {
  it('passes for the seed draft', () => {
    expect(validateDraft(base())).toEqual([])
  })

  it('flags a composite module with zero fields', () => {
    const d = base()
    d.module_fields = d.module_fields.filter((t) => t.module_key !== 'DSPM')
    expect(validateDraft(d).some((e) => e.code === 'module_no_fields' && e.entityKey === 'DSPM')).toBe(true)
  })

  it('exempts tier modules (CM) from the zero-fields rule', () => {
    // CM has no tags in seed and must NOT be flagged.
    expect(validateDraft(base()).some((e) => e.code === 'module_no_fields' && e.entityKey === 'CM')).toBe(false)
  })

  it('flags a tag pointing to an inactive field', () => {
    const d = base()
    d.fields = d.fields.map((f) => (f.field_key === 'vm' ? { ...f, active: false } : f))
    expect(validateDraft(d).some((e) => e.code === 'tag_inactive_field')).toBe(true)
  })

  it('flags a negative percentage', () => {
    const d = base()
    d.settings = { ...d.settings, amc_pct: -0.1 }
    expect(validateDraft(d).some((e) => e.code === 'pct_negative')).toBe(true)
  })

  it('flags a cm_tier missing a license fee', () => {
    const d = base()
    d.cm_tiers = d.cm_tiers.map((t) => (t.tier_key === 'mid' ? { ...t, license_fee_inr: NaN } : t))
    expect(validateDraft(d).some((e) => e.code === 'cm_tier_no_license')).toBe(true)
  })

  it('flags a multiplier module with no multiplier', () => {
    const d = base()
    d.modules = d.modules.map((m) => (m.module_key === 'ROPA_STANDALONE' ? { ...m, multiplier: null } : m))
    expect(validateDraft(d).some((e) => e.code === 'multiplier_missing')).toBe(true)
  })
})
```

- [ ] **Step 2: Implement** `validateDraft.ts`:

```ts
import type { DraftState, ValidationError } from './types'

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function validateDraft(d: DraftState): ValidationError[] {
  const errs: ValidationError[] = []
  const activeFieldKeys = new Set(d.fields.filter((f) => f.active).map((f) => f.field_key))
  const allFieldKeys = new Set(d.fields.map((f) => f.field_key))

  // Rule 5: integrity — unique non-empty field keys, integer prices >= 0
  const seenF = new Set<string>()
  for (const f of d.fields) {
    if (!f.field_key) errs.push({ code: 'field_key_empty', message: 'Field key is empty.', entityType: 'field', entityKey: f.field_key })
    if (seenF.has(f.field_key)) errs.push({ code: 'field_key_dup', message: `Duplicate field key "${f.field_key}".`, entityType: 'field', entityKey: f.field_key })
    seenF.add(f.field_key)
    if (!num(f.unit_price_inr) || f.unit_price_inr < 0 || !Number.isInteger(f.unit_price_inr))
      errs.push({ code: 'unit_price_invalid', message: `Unit price for "${f.field_key}" must be an integer >= 0.`, entityType: 'field', entityKey: f.field_key })
  }

  // Rule 1: field-priced modules (composite | multiplier) need >= 1 active tagged field. tier exempt.
  for (const m of d.modules) {
    if (!m.active) continue
    if (m.pricing_type === 'tier') continue
    const tagged = d.module_fields.filter((t) => t.module_key === m.module_key && activeFieldKeys.has(t.field_key))
    if (tagged.length === 0)
      errs.push({ code: 'module_no_fields', message: `Module "${m.module_key}" has no active fields.`, entityType: 'module', entityKey: m.module_key })
    // Rule 3b: multiplier-type needs a numeric multiplier >= 0
    if (m.pricing_type === 'multiplier' && (!num(m.multiplier) || (m.multiplier as number) < 0))
      errs.push({ code: 'multiplier_missing', message: `Module "${m.module_key}" needs a multiplier >= 0.`, entityType: 'module', entityKey: m.module_key })
  }

  // Rule 2: tags reference existing + active fields
  for (const t of d.module_fields) {
    if (!allFieldKeys.has(t.field_key))
      errs.push({ code: 'tag_missing_field', message: `Tag on "${t.module_key}" references missing field "${t.field_key}".`, entityType: 'module_field', entityKey: `${t.module_key}:${t.field_key}` })
    else if (!activeFieldKeys.has(t.field_key))
      errs.push({ code: 'tag_inactive_field', message: `Tag on "${t.module_key}" references inactive field "${t.field_key}".`, entityType: 'module_field', entityKey: `${t.module_key}:${t.field_key}` })
  }

  // Rule 3a: settings percentages numeric & >= 0
  for (const k of ['deployment_pct', 'amc_pct'] as const) {
    const v = d.settings[k]
    if (!num(v) || v < 0) errs.push({ code: 'pct_negative', message: `Settings ${k} must be a number >= 0.`, entityType: 'settings', entityKey: k })
  }

  // Rule 3c + 4: cm_tier amc >= 0 and license present
  for (const t of d.cm_tiers) {
    if (!num(t.amc_pct) || t.amc_pct < 0) errs.push({ code: 'pct_negative', message: `CM tier "${t.tier_key}" amc % must be >= 0.`, entityType: 'cm_tier', entityKey: t.tier_key })
    if (!num(t.license_fee_inr) || t.license_fee_inr < 0) errs.push({ code: 'cm_tier_no_license', message: `CM tier "${t.tier_key}" needs a license fee >= 0.`, entityType: 'cm_tier', entityKey: t.tier_key })
  }

  return errs
}
```

- [ ] **Step 3: Push; CI runs tests.** Expected: PASS.
- [ ] **Step 4: Commit** `git commit -am "feat(config): validateDraft with rule coverage tests"`

---

## Task 7: Migration 0006 — republish v2 (immutable v1)

**Files:** Create `supabase/migrations/0006_republish_v2.sql`

- [ ] **Step 1: Write the SQL** — build a fresh snapshot (now carrying `pricing_type`) from the tables and publish as v2; leave v1 untouched.

```sql
select public.publish_snapshot(
  jsonb_build_object(
    'fields', (select coalesce(jsonb_agg(jsonb_build_object('field_key', f.field_key, 'label', f.label, 'unit_price_inr', f.unit_price_inr, 'frequency', f.frequency::text, 'active', f.active, 'sort_order', f.sort_order) order by f.sort_order), '[]'::jsonb) from public.fields f),
    'modules', (select coalesce(jsonb_agg(jsonb_build_object('module_key', m.module_key, 'label', m.label, 'kind', m.kind::text, 'pricing_type', m.pricing_type::text, 'deployment_pct', m.deployment_pct, 'amc_pct', m.amc_pct, 'multiplier', m.multiplier, 'applies_multiplier', m.applies_multiplier, 'active', m.active) order by m.module_key), '[]'::jsonb) from public.modules m),
    'module_fields', (select coalesce(jsonb_agg(jsonb_build_object('module_key', m.module_key, 'field_key', f.field_key) order by m.module_key, f.sort_order), '[]'::jsonb) from public.module_fields mf join public.modules m on m.id = mf.module_id join public.fields f on f.id = mf.field_id),
    'cm_tiers', (select coalesce(jsonb_agg(jsonb_build_object('tier_key', t.tier_key, 'label', t.label, 'license_fee_inr', t.license_fee_inr, 'amc_pct', t.amc_pct, 'implementation_fee_inr', t.implementation_fee_inr) order by t.license_fee_inr), '[]'::jsonb) from public.cm_tiers t),
    'settings', (select jsonb_build_object('currency', s.currency, 'deployment_pct', s.deployment_pct, 'amc_pct', s.amc_pct, 'y2_includes_deployment', s.y2_includes_deployment, 'cm_model', s.cm_model::text, 'rounding', s.rounding) from public.settings s where s.id = true)
  ),
  'stage2-migration'
);
```

- [ ] **Step 2: Apply via MCP `execute_sql`** (calls the RPC). Expected: returns `2`.
- [ ] **Step 3: Verify** `execute_sql("select version_no, is_live, jsonb_path_exists(snapshot, '$.modules[*].pricing_type') as has_pt from public.config_versions order by version_no")`. Expected: v1 is_live=false, v2 is_live=true with `has_pt=true`.
- [ ] **Step 4: Commit** `git add supabase/migrations/0006_republish_v2.sql && git commit -m "feat(db): republish v2 carrying pricing_type (v1 immutable)"`

---

## Task 8: Data access — `draftRepo` + `versions`

**Files:** Create `src/lib/config/draftRepo.ts`, `src/lib/config/versions.ts`

- [ ] **Step 1: `draftRepo.ts`** — typed reads/writes for the 5 draft tables:

```ts
import { supabase } from '../supabase'
import type { CmTier, FieldDef, ModuleDef, ModuleFieldTag, Settings } from '../engine'
import type { DraftState } from './types'

export async function loadDraft(): Promise<DraftState> {
  const [fields, modules, mf, tiers, settings] = await Promise.all([
    supabase.from('fields').select('field_key,label,unit_price_inr,frequency,active,sort_order'),
    supabase.from('modules').select('module_key,label,kind,pricing_type,deployment_pct,amc_pct,multiplier,applies_multiplier,active'),
    supabase.from('module_fields').select('modules(module_key),fields(field_key)'),
    supabase.from('cm_tiers').select('tier_key,label,license_fee_inr,amc_pct,implementation_fee_inr'),
    supabase.from('settings').select('currency,deployment_pct,amc_pct,y2_includes_deployment,cm_model,rounding').eq('id', true).single(),
  ])
  const err = fields.error || modules.error || mf.error || tiers.error || settings.error
  if (err) throw new Error(`loadDraft failed: ${err.message}`)
  const module_fields: ModuleFieldTag[] = (mf.data ?? []).map((r: any) => ({ module_key: r.modules.module_key, field_key: r.fields.field_key }))
  return {
    fields: fields.data as FieldDef[],
    modules: modules.data as ModuleDef[],
    module_fields,
    cm_tiers: tiers.data as CmTier[],
    settings: settings.data as Settings,
  }
}

export async function upsertField(f: FieldDef) {
  const { error } = await supabase.from('fields').upsert(f, { onConflict: 'field_key' })
  if (error) throw new Error(error.message)
}
export async function upsertModule(m: ModuleDef) {
  const { error } = await supabase.from('modules').upsert(m, { onConflict: 'module_key' })
  if (error) throw new Error(error.message)
}
export async function upsertTier(t: CmTier) {
  const { error } = await supabase.from('cm_tiers').upsert(t, { onConflict: 'tier_key' })
  if (error) throw new Error(error.message)
}
export async function saveSettings(s: Settings) {
  const { error } = await supabase.from('settings').update(s).eq('id', true)
  if (error) throw new Error(error.message)
}
export async function setFieldTag(moduleKey: string, fieldKey: string, on: boolean) {
  const { error } = await supabase.rpc('set_field_tag', { p_module_key: moduleKey, p_field_key: fieldKey, p_on: on })
  if (error) throw new Error(error.message)
}
```

  Add a small `set_field_tag(p_module_key, p_field_key, p_on)` RPC (in Task 2's migration or a follow-up) that inserts/deletes the `module_fields` row by keys, so the client never handles UUIDs.

- [ ] **Step 2: `versions.ts`** — RPC wrappers:

```ts
import { supabase } from '../supabase'
import type { ConfigSnapshot } from '../engine'

export interface VersionRow { version_no: number; published_by: string | null; published_at: string; is_live: boolean }

export async function listVersions(): Promise<VersionRow[]> {
  const { data, error } = await supabase.from('config_versions').select('version_no,published_by,published_at,is_live').order('version_no', { ascending: false })
  if (error) throw new Error(error.message)
  return data as VersionRow[]
}
export async function publish(snapshot: ConfigSnapshot, publishedBy: string): Promise<number> {
  const { data, error } = await supabase.rpc('publish_snapshot', { p_snapshot: snapshot, p_published_by: publishedBy })
  if (error) throw new Error(error.message)
  return data as number
}
export async function rollback(versionNo: number): Promise<void> {
  const { error } = await supabase.rpc('rollback_to_version', { p_version_no: versionNo })
  if (error) throw new Error(error.message)
}
export async function resetDraftToLive(): Promise<void> {
  const { error } = await supabase.rpc('reset_draft_to_live')
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 3: Add `set_field_tag` RPC** to a migration `0007_set_field_tag.sql`:

```sql
create or replace function public.set_field_tag(p_module_key text, p_field_key text, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m_id uuid; f_id uuid;
begin
  select id into m_id from public.modules where module_key = p_module_key;
  select id into f_id from public.fields where field_key = p_field_key;
  if m_id is null or f_id is null then raise exception 'unknown module/field'; end if;
  if p_on then
    insert into public.module_fields(module_id, field_id) values (m_id, f_id) on conflict do nothing;
  else
    delete from public.module_fields where module_id = m_id and field_id = f_id;
  end if;
end $$;
grant execute on function public.set_field_tag(text, text, boolean) to anon, authenticated;
```

  Apply via MCP.

- [ ] **Step 4: Push; CI typecheck/build.** Expected PASS. **Commit** `git add src/lib/config supabase/migrations/0007_set_field_tag.sql && git commit -m "feat(config): draft repo + version RPC wrappers + set_field_tag"`

---

## Task 9: Hash router

**Files:** Modify `src/App.tsx`

- [ ] **Step 1: Implement** a minimal hash router (no dependency):

```tsx
import { useEffect, useState } from 'react'
import Calculator from './components/Calculator'
import AdminApp from './admin/AdminApp'

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const isAdmin = hash.startsWith('#/admin')
  return (
    <div>
      <nav className="flex gap-4 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <a href="#/" className={isAdmin ? 'text-slate-500' : 'font-semibold text-perfios-blue'}>Calculator</a>
        <a href="#/admin" className={isAdmin ? 'font-semibold text-perfios-blue' : 'text-slate-500'}>Admin</a>
      </nav>
      {isAdmin ? <AdminApp /> : <Calculator />}
    </div>
  )
}
```

- [ ] **Step 2: Commit** `git commit -am "feat(ui): hash routing for calculator vs admin"`

---

## Task 10: `useDraft` hook (load + debounced/blur autosave + reset)

**Files:** Create `src/admin/useDraft.ts`

- [ ] **Step 1: Implement** — holds draft state, exposes mutators that update state immediately and persist on a 500ms debounce (callers also call `flush` on blur), plus `reset()`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'   // NOTE: useCallback (fixed in impl)
import type { DraftState } from '../lib/config/types'
import { loadDraft, saveSettings, upsertField, upsertModule, upsertTier, setFieldTag } from '../lib/config/draftRepo'
import { resetDraftToLive } from '../lib/config/versions'
import type { CmTier, FieldDef, ModuleDef, Settings } from '../lib/engine'

// Implementation detail: a generic debounce keyed by entity id; persist functions
// above are called on debounce-fire and on explicit flush(). State updates are
// synchronous so preview/validation are instant; the DB write is debounced.
```

  Hook surface: `{ draft, loading, error, saveField(f), saveModule(m), saveTier(t), updateSettings(patch), toggleTag(moduleKey,fieldKey,on), reload(), reset(), flush() }`. Persisted writes are validated well-formed (numbers parsed; integers enforced) before being sent. (Full implementation written during execution; this hook is UI glue with no pure-logic branch worth a unit test — covered by typecheck/build + manual run.)

- [ ] **Step 2: Commit** after AdminApp wires it (Task 11).

---

## Task 11: Admin shell + Preview + Validation + Publish panel

**Files:** Create `src/admin/AdminApp.tsx`, `src/admin/PreviewPanel.tsx`, `src/admin/ValidationPanel.tsx`

- [ ] **Step 1: `AdminApp.tsx`** — uses `useDraft`; tab state for Fields/Modules/CM Tiers/Settings/Versions; right column renders `PreviewPanel` + `ValidationPanel`. Computes `snapshot = buildSnapshot(draft)` and `errors = validateDraft(draft)` on each render (cheap, pure).
- [ ] **Step 2: `PreviewPanel.tsx`** — sample-selection controls (module checkboxes + a few quantity inputs + CM tier); runs `calculatePricing(snapshot, sample)`; shows Year 1 / Year 2 (admin may expand breakdown). Brand colors.
- [ ] **Step 3: `ValidationPanel.tsx`** — lists `errors`; renders a Publish form (name input → `publish(snapshot, name)`), **disabled when `errors.length > 0`**; on success calls `reload()` and shows the new version number.
- [ ] **Step 4: Commit** `git add src/admin && git commit -m "feat(admin): shell, live preview, validation + publish"`

---

## Task 12: Tab editors (Fields, Modules, CM Tiers, Settings)

**Files:** Create `src/admin/FieldsEditor.tsx`, `ModulesEditor.tsx`, `CmTiersEditor.tsx`, `SettingsEditor.tsx`

- [ ] **Step 1: `FieldsEditor`** — table; add/edit/deactivate (key, label, unit price int, frequency `<select>`, sort order, active checkbox); commits via `saveField` on blur.
- [ ] **Step 2: `ModulesEditor`** — per module: label, `pricing_type` `<select>`; **field-tag checkboxes** (toggle via `toggleTag`); for `multiplier`-type show multiplier input. **No deployment_pct / amc_pct inputs** (engine ignores them; edit in Settings). Commits on blur.
- [ ] **Step 3: `CmTiersEditor`** — per tier: license fee, amc %, implementation fee; commits on blur.
- [ ] **Step 4: `SettingsEditor`** — `y2_includes_deployment` toggle, `cm_model` `<select>`, deployment %, amc %, rounding `<select>`, currency. The ONLY place deployment/amc % are edited.
- [ ] **Step 5: Commit** `git add src/admin && git commit -m "feat(admin): fields/modules/cm-tiers/settings editors (forms only)"`

---

## Task 13: Version history + rollback + reset draft

**Files:** Create `src/admin/VersionHistory.tsx`

- [ ] **Step 1: Implement** — `listVersions()` table (version no, published_by, published_at, LIVE badge); each non-live row has a **Make live (rollback)** button → `rollback(n)` then `reload()`. A **Reset draft to live** button (with confirm) → `resetDraftToLive()` then `reload()` the draft.
- [ ] **Step 2: Commit** `git add src/admin && git commit -m "feat(admin): version history, rollback, reset draft"`

---

## Task 14: Devcontainer (Node 20)

**Files:** Create `.devcontainer/devcontainer.json`

- [ ] **Step 1: Write**

```json
{
  "name": "perfios-pricing-engine",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:20",
  "postCreateCommand": "npm install",
  "forwardPorts": [5173]
}
```

- [ ] **Step 2: Commit** `git add .devcontainer && git commit -m "chore: Node 20 devcontainer for Codespaces preview"`

---

## Task 15: Verify + push + report

- [ ] **Step 1: Push all** `git push`.
- [ ] **Step 2: Confirm CI green** on the Actions tab (npm install → vitest → build). New tests: buildSnapshot parity, validateDraft rules; Stage 1 engine tests unchanged.
- [ ] **Step 3: Run security advisors** `get_advisors(type='security')` — confirm only intended notices remain.
- [ ] **Step 4: Report** repo + Actions URL + a manual test script for Codespaces/Vercel (edit a field → preview updates → publish v3 → calculator reflects it → rollback to v2).

---

## Self-Review

- **Spec coverage:** draft model (Task 5/8), pricing_type (1,4), validation incl. tier exemption (6), publish/rollback/reset RPCs (2), v2 republish immutable (7), permissive RLS (3), Modules tab without per-module pct (12), auto-save on blur/debounce + reset button (10,13), preview (11), version history (13), devcontainer (14), parity test with pricing_type (5). All covered.
- **Placeholder scan:** `useDraft` (Task 10) is described at interface level, not full code — it is UI glue with no pure branch; flagged as written-during-execution and covered by typecheck/build + manual run. All pure-logic and SQL tasks have complete code.
- **Type consistency:** `DraftState`, `ValidationError`, `VersionRow`, `buildSnapshot`, `validateDraft`, RPC names (`publish_snapshot`, `rollback_to_version`, `reset_draft_to_live`, `set_field_tag`) used consistently across tasks. `useCallback` import typo noted to fix in impl.
