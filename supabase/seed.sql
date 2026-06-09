-- Perfios Pricing Engine — Stage 1 seed (the editable rate card + config).
-- Idempotent: safe to re-run. Builds config_versions v1 as the live snapshot.

begin;

-- 1. Rate-card fields ------------------------------------------------------
insert into public.fields (field_key, label, unit_price_inr, frequency, sort_order) values
  ('db',               'Databases (SQL/Oracle/S3/file/BLOB)', 1000,   'recurring', 10),
  ('cloud_connector',  'AWS/Azure cloud connector',           400000, 'recurring', 20),
  ('account',          'Account / subscription',              100000, 'recurring', 30),
  ('onprem_connector', 'On-prem connector',                   900000, 'recurring', 40),
  ('data_centre',      'On-prem data centre',                 300000, 'recurring', 50),
  ('gdrive_user',      'GDrive/OneDrive user',                800,    'recurring', 60),
  ('vm',               'Virtual machine',                     7000,   'recurring', 70),
  ('sharepoint_site',  'SharePoint site',                     12000,  'recurring', 80),
  ('dam_dataset',      'DAM structured dataset',              150000, 'recurring', 90)
on conflict (field_key) do update set
  label = excluded.label,
  unit_price_inr = excluded.unit_price_inr,
  frequency = excluded.frequency,
  sort_order = excluded.sort_order,
  active = true;

-- 2. Modules ---------------------------------------------------------------
insert into public.modules (module_key, label, kind, multiplier, applies_multiplier) values
  ('DSPM',            'DSPM',                          'composite', null, false),
  ('DATA_FLOW',       'Data Flow (incl. ROPA)',        'composite', null, false),
  ('DAM',             'DAM',                           'composite', null, false),
  ('ROPA_STANDALONE', 'ROPA only (SaaS gap analysis)', 'saas',      0.7,  true),
  ('CM',              'Consent Manager',               'saas',      null, false)
on conflict (module_key) do update set
  label = excluded.label,
  kind = excluded.kind,
  multiplier = excluded.multiplier,
  applies_multiplier = excluded.applies_multiplier,
  active = true;

-- 3. Module -> field tags --------------------------------------------------
--    Shared platform tagged to every composite module + ROPA so the union rule
--    counts it exactly once. DSPM/DataFlow/DAM/ROPA each add their own fields.
delete from public.module_fields;
insert into public.module_fields (module_id, field_id)
select m.id, f.id
from public.modules m
join public.fields f on (
     (m.module_key in ('DSPM','DATA_FLOW','DAM','ROPA_STANDALONE')
        and f.field_key in ('db','cloud_connector','account','onprem_connector','data_centre'))
  or (m.module_key = 'DSPM'            and f.field_key in ('gdrive_user','sharepoint_site'))
  or (m.module_key = 'DATA_FLOW'       and f.field_key = 'vm')
  or (m.module_key = 'ROPA_STANDALONE' and f.field_key = 'vm')
  or (m.module_key = 'DAM'             and f.field_key = 'dam_dataset')
);

-- 4. Consent Manager tiers -------------------------------------------------
insert into public.cm_tiers (tier_key, label, license_fee_inr, amc_pct, implementation_fee_inr) values
  ('small', 'Small', 2000000,  0.30, 0),
  ('mid',   'Mid',   3000000,  0.30, 0),
  ('large', 'Large', 5000000,  0.30, 0),
  ('group', 'Group', 85000000, 0.30, 0)
on conflict (tier_key) do update set
  label = excluded.label,
  license_fee_inr = excluded.license_fee_inr,
  amc_pct = excluded.amc_pct,
  implementation_fee_inr = excluded.implementation_fee_inr;

-- 5. Global settings (singleton) ------------------------------------------
insert into public.settings (id, currency, deployment_pct, amc_pct, y2_includes_deployment, cm_model, rounding)
values (true, 'INR', 0.18, 0.12, false, 'perpetual', 'half_up')
on conflict (id) do update set
  currency = excluded.currency,
  deployment_pct = excluded.deployment_pct,
  amc_pct = excluded.amc_pct,
  y2_includes_deployment = excluded.y2_includes_deployment,
  cm_model = excluded.cm_model,
  rounding = excluded.rounding;

-- 6. Version 1 live snapshot ----------------------------------------------
--    Serialise the current config into the exact shape the engine consumes.
insert into public.config_versions (version_no, snapshot, published_by, is_live)
select
  1,
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
        'deployment_pct', m.deployment_pct, 'amc_pct', m.amc_pct, 'multiplier', m.multiplier,
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
        'rounding', s.rounding
      ) from public.settings s where s.id = true
    )
  ),
  'seed',
  true
on conflict (version_no) do update set snapshot = excluded.snapshot, is_live = true;

commit;
