-- Stage 2: atomic versioning RPCs. SECURITY DEFINER, granted to anon (no auth yet).
-- AUTH-STAGE TODO: gate these to admin role; anon execute is the accepted tradeoff.

-- Publish the client-built snapshot as a new live version.
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

-- Roll back: make a prior version live in one step.
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
  from jsonb_to_recordset(s->'fields')
    as x(field_key text, label text, unit_price_inr int, frequency text, active boolean, sort_order int);

  insert into public.modules (module_key, label, kind, pricing_type, deployment_pct, amc_pct, multiplier, applies_multiplier, active)
  select x.module_key, x.label, x.kind::module_kind, x.pricing_type::pricing_type, x.deployment_pct, x.amc_pct, x.multiplier, x.applies_multiplier, x.active
  from jsonb_to_recordset(s->'modules')
    as x(module_key text, label text, kind text, pricing_type text, deployment_pct numeric, amc_pct numeric, multiplier numeric, applies_multiplier boolean, active boolean);

  insert into public.module_fields (module_id, field_id)
  select m.id, f.id
  from jsonb_to_recordset(s->'module_fields') as x(module_key text, field_key text)
  join public.modules m on m.module_key = x.module_key
  join public.fields f on f.field_key = x.field_key;

  insert into public.cm_tiers (tier_key, label, license_fee_inr, amc_pct, implementation_fee_inr)
  select x.tier_key, x.label, x.license_fee_inr, x.amc_pct, x.implementation_fee_inr
  from jsonb_to_recordset(s->'cm_tiers')
    as x(tier_key text, label text, license_fee_inr int, amc_pct numeric, implementation_fee_inr int);

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
