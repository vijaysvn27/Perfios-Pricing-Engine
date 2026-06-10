-- Stage 4 Step 5: anon-callable, PRICE-STRIPPED form for the no-login calculator.
-- Returns only what is needed to render the questionnaire/inputs: module + field
-- labels, field->module tags, CM tier LABELS, and the (non-rate) export copy.
-- NO unit_price, NO licence/AMC fees, NO deployment/amc %, NO cm_model.
-- Serves only an ACTIVE instance that has a LIVE version (else null).

create function public.get_public_form(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s jsonb; nm text;
begin
  select cv.snapshot, i.name into s, nm
  from public.config_versions cv
  join public.instances i on i.id = cv.instance_id
  where i.share_token = p_token and i.active and cv.is_live
  limit 1;

  if s is null then return null; end if;

  return jsonb_build_object(
    'instance_name', nm,
    'modules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'module_key', m->>'module_key', 'label', m->>'label', 'kind', m->>'kind',
        'pricing_type', m->>'pricing_type', 'applies_multiplier', (m->>'applies_multiplier')::boolean,
        'active', (m->>'active')::boolean
      )), '[]'::jsonb)
      from jsonb_array_elements(s->'modules') m
    ),
    'fields', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'field_key', f->>'field_key', 'label', f->>'label',
        'sort_order', (f->>'sort_order')::int, 'active', (f->>'active')::boolean
      )), '[]'::jsonb)
      from jsonb_array_elements(s->'fields') f
    ),
    'module_fields', coalesce(s->'module_fields', '[]'::jsonb),
    'cm_tiers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tier_key', t->>'tier_key', 'label', t->>'label'
      )), '[]'::jsonb)
      from jsonb_array_elements(s->'cm_tiers') t
    ),
    'excel_hero', s->'settings'->>'excel_hero',
    'excel_terms', s->'settings'->>'excel_terms'
  );
end $$;

-- Anon may call this (it returns no rates). Service role too.
grant execute on function public.get_public_form(text) to anon, authenticated, service_role;
