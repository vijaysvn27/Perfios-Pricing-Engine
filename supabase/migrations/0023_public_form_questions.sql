-- Stage 5 Step 2: widen get_public_form to carry field help + informational
-- questions (STILL price-stripped: no unit_price, no fees, no rate settings), and
-- republish every instance's live snapshot in the new shape.

create or replace function public.get_public_form(p_token text)
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
    -- fields: labels + help ONLY. unit_price / frequency are deliberately omitted.
    'fields', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'field_key', f->>'field_key', 'label', f->>'label',
        'sort_order', (f->>'sort_order')::int, 'active', (f->>'active')::boolean,
        'question_text', f->>'question_text', 'example', f->>'example', 'why_text', f->>'why_text',
        'section', f->>'section',
        'section_sort', coalesce((f->>'section_sort')::int, 0), 'item_sort', coalesce((f->>'item_sort')::int, 0)
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
    'informational_questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'question_key', q->>'question_key', 'question_text', q->>'question_text',
        'example', q->>'example', 'why_text', q->>'why_text', 'answer_type', q->>'answer_type',
        'options', coalesce(q->'options', 'null'::jsonb), 'section', q->>'section',
        'section_sort', coalesce((q->>'section_sort')::int, 0), 'item_sort', coalesce((q->>'item_sort')::int, 0),
        'active', (q->>'active')::boolean
      )), '[]'::jsonb)
      from jsonb_array_elements(coalesce(s->'informational_questions', '[]'::jsonb)) q
    ),
    'excel_hero', s->'settings'->>'excel_hero',
    'excel_terms', s->'settings'->>'excel_terms'
  );
end $$;

-- Republish every live instance with field help + informational_questions in the
-- snapshot (full snapshot incl. prices — read only server-side via get_published_config).
do $$
declare inst record; snap jsonb;
begin
  for inst in select distinct cv.instance_id as id from public.config_versions cv where cv.is_live loop
    snap := jsonb_build_object(
      'fields', (select coalesce(jsonb_agg(jsonb_build_object(
        'field_key', f.field_key, 'label', f.label, 'unit_price_inr', f.unit_price_inr, 'frequency', f.frequency::text,
        'active', f.active, 'sort_order', f.sort_order, 'question_text', f.question_text, 'example', f.example,
        'why_text', f.why_text, 'section', f.section, 'section_sort', f.section_sort, 'item_sort', f.item_sort
      ) order by f.sort_order), '[]'::jsonb) from public.fields f where f.instance_id = inst.id),
      'modules', (select coalesce(jsonb_agg(jsonb_build_object(
        'module_key', m.module_key, 'label', m.label, 'kind', m.kind::text, 'pricing_type', m.pricing_type::text,
        'deployment_pct', m.deployment_pct, 'amc_pct', m.amc_pct, 'multiplier', m.multiplier,
        'applies_multiplier', m.applies_multiplier, 'active', m.active
      ) order by m.module_key), '[]'::jsonb) from public.modules m where m.instance_id = inst.id),
      'module_fields', (select coalesce(jsonb_agg(jsonb_build_object('module_key', m.module_key, 'field_key', f.field_key) order by m.module_key, f.sort_order), '[]'::jsonb)
        from public.module_fields mf join public.modules m on m.id = mf.module_id join public.fields f on f.id = mf.field_id where mf.instance_id = inst.id),
      'cm_tiers', (select coalesce(jsonb_agg(jsonb_build_object('tier_key', t.tier_key, 'label', t.label, 'license_fee_inr', t.license_fee_inr, 'amc_pct', t.amc_pct, 'implementation_fee_inr', t.implementation_fee_inr) order by t.license_fee_inr), '[]'::jsonb) from public.cm_tiers t where t.instance_id = inst.id),
      'settings', (select jsonb_build_object('currency', s.currency, 'deployment_pct', s.deployment_pct, 'amc_pct', s.amc_pct, 'y2_includes_deployment', s.y2_includes_deployment, 'cm_model', s.cm_model::text, 'rounding', s.rounding, 'excel_hero', s.excel_hero, 'excel_terms', s.excel_terms) from public.settings s where s.instance_id = inst.id),
      'informational_questions', (select coalesce(jsonb_agg(jsonb_build_object('question_key', q.question_key, 'question_text', q.question_text, 'example', q.example, 'why_text', q.why_text, 'answer_type', q.answer_type::text, 'options', to_jsonb(q.options), 'section', q.section, 'section_sort', q.section_sort, 'item_sort', q.item_sort, 'active', q.active) order by q.section_sort, q.item_sort), '[]'::jsonb) from public.informational_questions q where q.instance_id = inst.id)
    );
    update public.config_versions set is_live = false where instance_id = inst.id and is_live;
    insert into public.config_versions (instance_id, version_no, snapshot, published_by, is_live)
    values (inst.id, (select coalesce(max(version_no), 0) + 1 from public.config_versions where instance_id = inst.id), snap, 'stage5-republish', true);
  end loop;
end $$;
