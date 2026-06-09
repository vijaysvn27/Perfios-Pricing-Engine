-- Stage 3: recreate the versioning RPCs with an in-function admin check. Because
-- they are SECURITY DEFINER, table RLS does not protect them — the is_admin()
-- guard is the real boundary. Execute is revoked from anon, granted to authenticated.

create or replace function public.publish_snapshot(p_snapshot jsonb, p_published_by text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_no integer;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select coalesce(max(version_no), 0) + 1 into v_no from public.config_versions;
  update public.config_versions set is_live = false where is_live;
  insert into public.config_versions (version_no, snapshot, published_by, is_live)
  values (v_no, p_snapshot, coalesce(nullif(p_published_by, ''), 'admin'), true);
  return v_no;
end $$;

create or replace function public.rollback_to_version(p_version_no integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if not exists (select 1 from public.config_versions where version_no = p_version_no) then
    raise exception 'version % does not exist', p_version_no;
  end if;
  update public.config_versions set is_live = false where is_live;
  update public.config_versions set is_live = true where version_no = p_version_no;
end $$;

create or replace function public.reset_draft_to_live()
returns void language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
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

create or replace function public.set_field_tag(p_module_key text, p_field_key text, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m_id uuid; f_id uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select id into m_id from public.modules where module_key = p_module_key;
  select id into f_id from public.fields where field_key = p_field_key;
  if m_id is null or f_id is null then raise exception 'unknown module/field'; end if;
  if p_on then
    insert into public.module_fields(module_id, field_id) values (m_id, f_id) on conflict do nothing;
  else
    delete from public.module_fields where module_id = m_id and field_id = f_id;
  end if;
end $$;

revoke execute on function public.publish_snapshot(jsonb, text) from anon;
revoke execute on function public.rollback_to_version(integer) from anon;
revoke execute on function public.reset_draft_to_live() from anon;
revoke execute on function public.set_field_tag(text, text, boolean) from anon;

grant execute on function public.publish_snapshot(jsonb, text) to authenticated;
grant execute on function public.rollback_to_version(integer) to authenticated;
grant execute on function public.reset_draft_to_live() to authenticated;
grant execute on function public.set_field_tag(text, text, boolean) to authenticated;
