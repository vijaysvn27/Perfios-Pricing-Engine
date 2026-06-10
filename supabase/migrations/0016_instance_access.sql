-- Stage 4 Step 2: per-instance constraints, instance-scoped RPCs, instance
-- management RPCs, and the server-side-only published-config reader.
-- Pairs with the Step 3 data-layer changes.

-- 1. Per-instance uniqueness ------------------------------------------------
alter table public.fields  drop constraint if exists fields_field_key_key;
alter table public.fields  add  constraint fields_instance_field_key unique (instance_id, field_key);

alter table public.modules drop constraint if exists modules_module_key_key;
alter table public.modules add  constraint modules_instance_module_key unique (instance_id, module_key);

alter table public.cm_tiers drop constraint if exists cm_tiers_tier_key_key;
alter table public.cm_tiers add  constraint cm_tiers_instance_tier_key unique (instance_id, tier_key);

alter table public.config_versions drop constraint if exists config_versions_version_no_key;
drop index if exists public.one_live_config_version;
alter table public.config_versions add constraint config_versions_instance_version_key unique (instance_id, version_no);
create unique index one_live_per_instance on public.config_versions (instance_id) where is_live;

-- 2. settings becomes one row PER INSTANCE ---------------------------------
alter table public.settings drop constraint if exists settings_singleton;
alter table public.settings drop constraint if exists settings_pkey;
alter table public.settings add  primary key (instance_id);
alter table public.settings drop column if exists id;

-- 3. Instance-scope the existing RPCs (drop old signatures, recreate) -------
drop function if exists public.publish_snapshot(jsonb, text);
drop function if exists public.rollback_to_version(integer);
drop function if exists public.reset_draft_to_live();
drop function if exists public.set_field_tag(text, text, boolean);

create function public.publish_snapshot(p_instance uuid, p_snapshot jsonb, p_published_by text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_no integer;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select coalesce(max(version_no), 0) + 1 into v_no from public.config_versions where instance_id = p_instance;
  update public.config_versions set is_live = false where instance_id = p_instance and is_live;
  insert into public.config_versions (instance_id, version_no, snapshot, published_by, is_live)
  values (p_instance, v_no, p_snapshot, coalesce(nullif(p_published_by, ''), 'admin'), true);
  return v_no;
end $$;

create function public.rollback_to_version(p_instance uuid, p_version_no integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if not exists (select 1 from public.config_versions where instance_id = p_instance and version_no = p_version_no) then
    raise exception 'version % does not exist', p_version_no;
  end if;
  update public.config_versions set is_live = false where instance_id = p_instance and is_live;
  update public.config_versions set is_live = true where instance_id = p_instance and version_no = p_version_no;
end $$;

create function public.reset_draft_to_live(p_instance uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select snapshot into s from public.config_versions where instance_id = p_instance and is_live limit 1;
  if s is null then raise exception 'no live version to reset from'; end if;

  delete from public.module_fields where instance_id = p_instance;
  delete from public.fields where instance_id = p_instance;
  delete from public.modules where instance_id = p_instance;
  delete from public.cm_tiers where instance_id = p_instance;

  insert into public.fields (instance_id, field_key, label, unit_price_inr, frequency, active, sort_order)
  select p_instance, x.field_key, x.label, x.unit_price_inr, x.frequency::frequency, x.active, x.sort_order
  from jsonb_to_recordset(s->'fields')
    as x(field_key text, label text, unit_price_inr int, frequency text, active boolean, sort_order int);

  insert into public.modules (instance_id, module_key, label, kind, pricing_type, deployment_pct, amc_pct, multiplier, applies_multiplier, active)
  select p_instance, x.module_key, x.label, x.kind::module_kind, x.pricing_type::pricing_type, x.deployment_pct, x.amc_pct, x.multiplier, x.applies_multiplier, x.active
  from jsonb_to_recordset(s->'modules')
    as x(module_key text, label text, kind text, pricing_type text, deployment_pct numeric, amc_pct numeric, multiplier numeric, applies_multiplier boolean, active boolean);

  insert into public.module_fields (instance_id, module_id, field_id)
  select p_instance, m.id, f.id
  from jsonb_to_recordset(s->'module_fields') as x(module_key text, field_key text)
  join public.modules m on m.instance_id = p_instance and m.module_key = x.module_key
  join public.fields  f on f.instance_id = p_instance and f.field_key  = x.field_key;

  insert into public.cm_tiers (instance_id, tier_key, label, license_fee_inr, amc_pct, implementation_fee_inr)
  select p_instance, x.tier_key, x.label, x.license_fee_inr, x.amc_pct, x.implementation_fee_inr
  from jsonb_to_recordset(s->'cm_tiers')
    as x(tier_key text, label text, license_fee_inr int, amc_pct numeric, implementation_fee_inr int);

  update public.settings set
    currency = s->'settings'->>'currency',
    deployment_pct = (s->'settings'->>'deployment_pct')::numeric,
    amc_pct = (s->'settings'->>'amc_pct')::numeric,
    y2_includes_deployment = (s->'settings'->>'y2_includes_deployment')::boolean,
    cm_model = (s->'settings'->>'cm_model')::cm_model,
    rounding = s->'settings'->>'rounding',
    excel_hero = s->'settings'->>'excel_hero',
    excel_terms = s->'settings'->>'excel_terms'
  where instance_id = p_instance;
end $$;

create function public.set_field_tag(p_instance uuid, p_module_key text, p_field_key text, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m_id uuid; f_id uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select id into m_id from public.modules where instance_id = p_instance and module_key = p_module_key;
  select id into f_id from public.fields  where instance_id = p_instance and field_key  = p_field_key;
  if m_id is null or f_id is null then raise exception 'unknown module/field'; end if;
  if p_on then
    insert into public.module_fields(instance_id, module_id, field_id) values (p_instance, m_id, f_id) on conflict do nothing;
  else
    delete from public.module_fields where module_id = m_id and field_id = f_id;
  end if;
end $$;

-- 4. Instance management RPCs (admin only) ---------------------------------
create function public.clone_instance(p_source uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  insert into public.instances (name, is_template, active, created_by, share_token)
  values (p_name, false, true, coalesce((select email from public.profiles where id = auth.uid()), 'admin'),
          encode(extensions.gen_random_bytes(16), 'hex'))
  returning id into new_id;

  insert into public.fields (instance_id, field_key, label, unit_price_inr, frequency, active, sort_order)
  select new_id, field_key, label, unit_price_inr, frequency, active, sort_order from public.fields where instance_id = p_source;

  insert into public.modules (instance_id, module_key, label, kind, pricing_type, deployment_pct, amc_pct, multiplier, applies_multiplier, active)
  select new_id, module_key, label, kind, pricing_type, deployment_pct, amc_pct, multiplier, applies_multiplier, active from public.modules where instance_id = p_source;

  insert into public.cm_tiers (instance_id, tier_key, label, license_fee_inr, amc_pct, implementation_fee_inr)
  select new_id, tier_key, label, license_fee_inr, amc_pct, implementation_fee_inr from public.cm_tiers where instance_id = p_source;

  insert into public.settings (instance_id, currency, deployment_pct, amc_pct, y2_includes_deployment, cm_model, rounding, excel_hero, excel_terms)
  select new_id, currency, deployment_pct, amc_pct, y2_includes_deployment, cm_model, rounding, excel_hero, excel_terms from public.settings where instance_id = p_source;

  insert into public.module_fields (instance_id, module_id, field_id)
  select new_id, nm.id, nf.id
  from public.module_fields mf
  join public.modules om on om.id = mf.module_id
  join public.fields  ofd on ofd.id = mf.field_id
  join public.modules nm on nm.instance_id = new_id and nm.module_key = om.module_key
  join public.fields  nf on nf.instance_id = new_id and nf.field_key  = ofd.field_key
  where mf.instance_id = p_source;

  return new_id;
end $$;

create function public.rename_instance(p_instance uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.instances set name = p_name where id = p_instance;
end $$;

create function public.regenerate_token(p_instance uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare tok text;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.instances set share_token = encode(extensions.gen_random_bytes(16), 'hex')
  where id = p_instance returning share_token into tok;
  return tok;
end $$;

-- 5. Server-side-only published config reader (Edge Function uses this) -----
--    Returns the FULL snapshot incl. unit_price -> NEVER granted to anon.
create function public.get_published_config(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  select cv.snapshot into s
  from public.config_versions cv
  join public.instances i on i.id = cv.instance_id
  where i.share_token = p_token and i.active and cv.is_live
  limit 1;
  return s;
end $$;

-- 6. Grants ----------------------------------------------------------------
-- Admin-guarded RPCs: authenticated only (anon/public revoked).
revoke execute on function public.publish_snapshot(uuid, jsonb, text) from public;
revoke execute on function public.rollback_to_version(uuid, integer) from public;
revoke execute on function public.reset_draft_to_live(uuid) from public;
revoke execute on function public.set_field_tag(uuid, text, text, boolean) from public;
revoke execute on function public.clone_instance(uuid, text) from public;
revoke execute on function public.rename_instance(uuid, text) from public;
revoke execute on function public.regenerate_token(uuid) from public;
grant execute on function public.publish_snapshot(uuid, jsonb, text) to authenticated;
grant execute on function public.rollback_to_version(uuid, integer) to authenticated;
grant execute on function public.reset_draft_to_live(uuid) to authenticated;
grant execute on function public.set_field_tag(uuid, text, text, boolean) to authenticated;
grant execute on function public.clone_instance(uuid, text) to authenticated;
grant execute on function public.rename_instance(uuid, text) to authenticated;
grant execute on function public.regenerate_token(uuid) to authenticated;

-- get_published_config returns rate-bearing snapshot: SERVICE ROLE ONLY.
revoke execute on function public.get_published_config(text) from public;
grant execute on function public.get_published_config(text) to service_role;

-- 7. config_versions read becomes admin-only (no anon, no plain authenticated).
drop policy if exists "read live or admin config versions" on public.config_versions;
create policy "admin reads config versions" on public.config_versions
  for select to authenticated using (public.is_admin());
