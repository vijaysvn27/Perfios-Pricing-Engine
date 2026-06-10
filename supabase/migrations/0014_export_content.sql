-- Stage: configurable export copy.
-- 1) Admin baseline hero + terms live in settings (versioned/publishable).
-- 2) Per-user saved defaults live in user_export_prefs (own-row RLS).
-- 3) Republish a new live version carrying the new settings fields.

alter table public.settings
  add column if not exists excel_hero text not null default
    'Estimated base cost for the selected data-privacy and Consent Manager modules. Year 1 includes one-time setup; Year 2 is the recurring annual cost.',
  add column if not exists excel_terms text not null default
    E'All figures are base cost in Indian Rupees, exclusive of applicable taxes (e.g. GST).\nYear 1 includes one-time deployment and implementation; Year 2 onward is the recurring annual cost.\nThis estimate is indicative and valid for 30 days from the date above.\nFinal pricing is subject to a formal agreement.';

-- Per-user saved hero/terms defaults (personal prefs, not pricing config).
create table public.user_export_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  hero       text,
  terms      text,
  updated_at timestamptz not null default now()
);
alter table public.user_export_prefs enable row level security;

grant select, insert, update, delete on public.user_export_prefs to authenticated;

create policy "own export prefs select" on public.user_export_prefs
  for select to authenticated using (user_id = auth.uid());
create policy "own export prefs insert" on public.user_export_prefs
  for insert to authenticated with check (user_id = auth.uid());
create policy "own export prefs update" on public.user_export_prefs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Republish a new live version so the calculator's live config carries excel_hero/excel_terms.
-- Done with a direct insert (the publish_snapshot RPC's is_admin() guard would reject a
-- migration that runs without an authenticated user).
update public.config_versions set is_live = false where is_live;
insert into public.config_versions (version_no, snapshot, published_by, is_live)
values (
  (select coalesce(max(version_no), 0) + 1 from public.config_versions),
  jsonb_build_object(
    'fields', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'field_key', f.field_key, 'label', f.label, 'unit_price_inr', f.unit_price_inr,
        'frequency', f.frequency::text, 'active', f.active, 'sort_order', f.sort_order
      ) order by f.sort_order), '[]'::jsonb) from public.fields f
    ),
    'modules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'module_key', m.module_key, 'label', m.label, 'kind', m.kind::text,
        'pricing_type', m.pricing_type::text, 'deployment_pct', m.deployment_pct,
        'amc_pct', m.amc_pct, 'multiplier', m.multiplier,
        'applies_multiplier', m.applies_multiplier, 'active', m.active
      ) order by m.module_key), '[]'::jsonb) from public.modules m
    ),
    'module_fields', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'module_key', m.module_key, 'field_key', f.field_key
      ) order by m.module_key, f.sort_order), '[]'::jsonb)
      from public.module_fields mf
      join public.modules m on m.id = mf.module_id
      join public.fields  f on f.id = mf.field_id
    ),
    'cm_tiers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tier_key', t.tier_key, 'label', t.label, 'license_fee_inr', t.license_fee_inr,
        'amc_pct', t.amc_pct, 'implementation_fee_inr', t.implementation_fee_inr
      ) order by t.license_fee_inr), '[]'::jsonb) from public.cm_tiers t
    ),
    'settings', (
      select jsonb_build_object(
        'currency', s.currency, 'deployment_pct', s.deployment_pct, 'amc_pct', s.amc_pct,
        'y2_includes_deployment', s.y2_includes_deployment, 'cm_model', s.cm_model::text,
        'rounding', s.rounding, 'excel_hero', s.excel_hero, 'excel_terms', s.excel_terms
      ) from public.settings s where s.id = true
    )
  ),
  'export-content-migration',
  true
);
