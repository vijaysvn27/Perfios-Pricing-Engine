-- Stage 5 refinement 2: re-seed the TEMPLATE instance's question help with
-- customer-friendly copy, and seed the three Consent Manager sizing questions as
-- INFORMATIONAL (stored-only, never priced). Scoped strictly to the Template — other
-- instances keep their own edited help and can re-clone to pick up these defaults.
-- No engine math: only field help + informational questions + a republish.

-- 1. Priced-field help — Section A "System Sizing (Data Privacy)".
update public.fields f set
  question_text = v.question_text,
  example       = v.example,
  why_text      = v.why_text,
  section       = 'System Sizing (Data Privacy)',
  section_sort  = 1,
  item_sort     = v.item_sort
from (values
  ('db',               'How many databases need scanning? Split cloud vs on-prem if known', '10 cloud / 30 on-prem', 'Primary driver of data-discovery scan scope', 1),
  ('cloud_connector',  'How many cloud platforms to connect (AWS / Azure / GCP)?',          '3',                     'Each cloud platform is connected for discovery', 2),
  ('account',          'How many cloud accounts / subscriptions across those platforms?',   '8',                     'Discovery is scoped per account/subscription', 3),
  ('onprem_connector', 'How many on-premise environments need a connector?',                '2',                     'Sizes on-prem discovery coverage', 4),
  ('data_centre',      'How many distinct data centres / locations?',                       '2',                     'Affects on-prem deployment footprint', 5),
  ('gdrive_user',      'Approx users whose Google Drive / OneDrive need scanning? (optional)', '2,000',              'Per-user crawl scope', 6),
  ('sharepoint_site',  'How many SharePoint sites? (optional)',                             '30',                    'SharePoint discovery scope', 7),
  ('vm',               'How many virtual machines are in scope for monitoring?',            '4',                     'Data-flow monitoring scope', 8),
  ('dam_dataset',      'How many systems / datasets need activity monitoring (DAM)?',       '5',                     'Defines DAM monitoring coverage', 9)
) as v(field_key, question_text, example, why_text, item_sort)
where f.instance_id = (select id from public.instances where is_template)
  and f.field_key = v.field_key;

-- 2. Consent Manager sizing — Section B, INFORMATIONAL (free text, never priced).
insert into public.informational_questions
  (instance_id, question_key, question_text, example, why_text, answer_type, options, section, section_sort, item_sort, active)
select (select id from public.instances where is_template),
       x.question_key, x.question_text, x.example, x.why_text, 'text'::info_answer_type, null,
       'Consent Manager', 2, x.item_sort, true
from (values
  ('cm_data_principals',      'Total active data principal (customer) base',                                       '50,00,000',              'Scale of the consent base', 1),
  ('cm_touchpoints_journeys', 'Customer touchpoints + distinct journeys needing separate consent templates',        '3 touchpoints, 8 journeys', 'Consent configuration scope', 2),
  ('cm_y1_consents',          'Estimated consents to capture in Year 1 (new vs bulk-migrated)',                     'new + migrated',          'Year-1 volume + migration scope', 3)
) as x(question_key, question_text, example, why_text, item_sort)
on conflict (instance_id, question_key) do update set
  question_text = excluded.question_text,
  example       = excluded.example,
  why_text      = excluded.why_text,
  answer_type   = excluded.answer_type,
  options       = excluded.options,
  section       = excluded.section,
  section_sort  = excluded.section_sort,
  item_sort     = excluded.item_sort,
  active        = excluded.active;

-- 3. Republish the Template's live snapshot (TEMPLATE ONLY) so its own public link and
--    future clones reflect the new help + CM section. Same snapshot shape as 0023.
do $$
declare tmpl uuid; snap jsonb;
begin
  select id into tmpl from public.instances where is_template limit 1;

  snap := jsonb_build_object(
    'fields', (select coalesce(jsonb_agg(jsonb_build_object(
      'field_key', f.field_key, 'label', f.label, 'unit_price_inr', f.unit_price_inr, 'frequency', f.frequency::text,
      'active', f.active, 'sort_order', f.sort_order, 'question_text', f.question_text, 'example', f.example,
      'why_text', f.why_text, 'section', f.section, 'section_sort', f.section_sort, 'item_sort', f.item_sort
    ) order by f.sort_order), '[]'::jsonb) from public.fields f where f.instance_id = tmpl),
    'modules', (select coalesce(jsonb_agg(jsonb_build_object(
      'module_key', m.module_key, 'label', m.label, 'kind', m.kind::text, 'pricing_type', m.pricing_type::text,
      'deployment_pct', m.deployment_pct, 'amc_pct', m.amc_pct, 'multiplier', m.multiplier,
      'applies_multiplier', m.applies_multiplier, 'active', m.active
    ) order by m.module_key), '[]'::jsonb) from public.modules m where m.instance_id = tmpl),
    'module_fields', (select coalesce(jsonb_agg(jsonb_build_object('module_key', m.module_key, 'field_key', f.field_key) order by m.module_key, f.sort_order), '[]'::jsonb)
      from public.module_fields mf join public.modules m on m.id = mf.module_id join public.fields f on f.id = mf.field_id where mf.instance_id = tmpl),
    'cm_tiers', (select coalesce(jsonb_agg(jsonb_build_object('tier_key', t.tier_key, 'label', t.label, 'license_fee_inr', t.license_fee_inr, 'amc_pct', t.amc_pct, 'implementation_fee_inr', t.implementation_fee_inr) order by t.license_fee_inr), '[]'::jsonb) from public.cm_tiers t where t.instance_id = tmpl),
    'settings', (select jsonb_build_object('currency', s.currency, 'deployment_pct', s.deployment_pct, 'amc_pct', s.amc_pct, 'y2_includes_deployment', s.y2_includes_deployment, 'cm_model', s.cm_model::text, 'rounding', s.rounding, 'excel_hero', s.excel_hero, 'excel_terms', s.excel_terms) from public.settings s where s.instance_id = tmpl),
    'informational_questions', (select coalesce(jsonb_agg(jsonb_build_object('question_key', q.question_key, 'question_text', q.question_text, 'example', q.example, 'why_text', q.why_text, 'answer_type', q.answer_type::text, 'options', to_jsonb(q.options), 'section', q.section, 'section_sort', q.section_sort, 'item_sort', q.item_sort, 'active', q.active) order by q.section_sort, q.item_sort), '[]'::jsonb) from public.informational_questions q where q.instance_id = tmpl)
  );

  update public.config_versions set is_live = false where instance_id = tmpl and is_live;
  insert into public.config_versions (instance_id, version_no, snapshot, published_by, is_live)
  values (tmpl, (select coalesce(max(version_no), 0) + 1 from public.config_versions where instance_id = tmpl), snap, 'stage5-reseed', true);
end $$;
