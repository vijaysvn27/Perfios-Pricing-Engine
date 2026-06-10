-- Stage 5 Step 1: questions layer + persistence (additive, non-breaking).

-- 1. Per-field "help" (priced-question metadata). Engine ignores these.
alter table public.fields
  add column question_text text,
  add column example      text,
  add column why_text      text,
  add column section       text,
  add column section_sort  int not null default 0,
  add column item_sort     int not null default 0;

-- 2. Informational (non-priced) questions — admin-addable, never affect price.
create type info_answer_type as enum ('number', 'yes_no', 'text', 'date', 'select');

create table public.informational_questions (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid not null references public.instances(id) on delete cascade,
  question_key text not null,
  question_text text not null,
  example      text,
  why_text     text,
  answer_type  info_answer_type not null default 'text',
  options      text[],
  section      text,
  section_sort int not null default 0,
  item_sort    int not null default 0,
  active       boolean not null default true,
  unique (instance_id, question_key)
);
alter table public.informational_questions enable row level security;
create index on public.informational_questions(instance_id);

create policy "admin read informational_questions"   on public.informational_questions for select to authenticated using (public.is_admin());
create policy "admin insert informational_questions" on public.informational_questions for insert to authenticated with check (public.is_admin());
create policy "admin update informational_questions" on public.informational_questions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete informational_questions" on public.informational_questions for delete to authenticated using (public.is_admin());

-- 3. Persistence (admin read-only; writes via service role only).
create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  instance_id   uuid not null references public.instances(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now(),
  synced_to_gtm boolean not null default false,
  unique (instance_id, name)
);

create table public.quotes (
  id                   uuid primary key default gen_random_uuid(),
  instance_id          uuid not null references public.instances(id) on delete cascade,
  customer_id          uuid references public.customers(id) on delete set null,
  customer_name        text,
  module_keys          text[] not null default '{}',
  quantities           jsonb not null default '{}'::jsonb,
  cm_tier              text,
  year1                int not null,
  year2                int not null,
  breakdown            jsonb not null,
  informational_answers jsonb not null default '{}'::jsonb,
  status               text not null default 'created',
  synced_to_gtm        boolean not null default false,
  created_at           timestamptz not null default now()
);

create table public.quote_events (
  id            uuid primary key default gen_random_uuid(),
  instance_id   uuid not null references public.instances(id) on delete cascade,
  customer_id   uuid references public.customers(id) on delete set null,
  customer_name text,
  event_type    text not null,
  quote_id      uuid references public.quotes(id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.customers     enable row level security;
alter table public.quotes        enable row level security;
alter table public.quote_events  enable row level security;

create index on public.quotes(instance_id, created_at);
create index on public.quote_events(instance_id, created_at);
create index on public.customers(instance_id);

create policy "admin read customers"     on public.customers    for select to authenticated using (public.is_admin());
create policy "admin read quotes"        on public.quotes       for select to authenticated using (public.is_admin());
create policy "admin read quote_events"  on public.quote_events for select to authenticated using (public.is_admin());

-- 4. clone_instance: also copy the new field help + informational questions.
create or replace function public.clone_instance(p_source uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  insert into public.instances (name, is_template, active, created_by, share_token)
  values (p_name, false, true, coalesce((select email from public.profiles where id = auth.uid()), 'admin'),
          encode(extensions.gen_random_bytes(16), 'hex'))
  returning id into new_id;

  insert into public.fields (instance_id, field_key, label, unit_price_inr, frequency, active, sort_order,
                             question_text, example, why_text, section, section_sort, item_sort)
  select new_id, field_key, label, unit_price_inr, frequency, active, sort_order,
         question_text, example, why_text, section, section_sort, item_sort
  from public.fields where instance_id = p_source;

  insert into public.modules (instance_id, module_key, label, kind, pricing_type, deployment_pct, amc_pct, multiplier, applies_multiplier, active)
  select new_id, module_key, label, kind, pricing_type, deployment_pct, amc_pct, multiplier, applies_multiplier, active from public.modules where instance_id = p_source;

  insert into public.cm_tiers (instance_id, tier_key, label, license_fee_inr, amc_pct, implementation_fee_inr)
  select new_id, tier_key, label, license_fee_inr, amc_pct, implementation_fee_inr from public.cm_tiers where instance_id = p_source;

  insert into public.settings (instance_id, currency, deployment_pct, amc_pct, y2_includes_deployment, cm_model, rounding, excel_hero, excel_terms)
  select new_id, currency, deployment_pct, amc_pct, y2_includes_deployment, cm_model, rounding, excel_hero, excel_terms from public.settings where instance_id = p_source;

  insert into public.informational_questions (instance_id, question_key, question_text, example, why_text, answer_type, options, section, section_sort, item_sort, active)
  select new_id, question_key, question_text, example, why_text, answer_type, options, section, section_sort, item_sort, active
  from public.informational_questions where instance_id = p_source;

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

-- 5. reset_draft_to_live: rebuild field help + informational questions from the snapshot.
create or replace function public.reset_draft_to_live(p_instance uuid)
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
  delete from public.informational_questions where instance_id = p_instance;

  insert into public.fields (instance_id, field_key, label, unit_price_inr, frequency, active, sort_order,
                             question_text, example, why_text, section, section_sort, item_sort)
  select p_instance, x.field_key, x.label, x.unit_price_inr, x.frequency::frequency, x.active, x.sort_order,
         x.question_text, x.example, x.why_text, x.section, coalesce(x.section_sort, 0), coalesce(x.item_sort, 0)
  from jsonb_to_recordset(s->'fields')
    as x(field_key text, label text, unit_price_inr int, frequency text, active boolean, sort_order int,
         question_text text, example text, why_text text, section text, section_sort int, item_sort int);

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

  insert into public.informational_questions (instance_id, question_key, question_text, example, why_text, answer_type, options, section, section_sort, item_sort, active)
  select p_instance, x.question_key, x.question_text, x.example, x.why_text, coalesce(x.answer_type, 'text')::info_answer_type, x.options, x.section, coalesce(x.section_sort, 0), coalesce(x.item_sort, 0), coalesce(x.active, true)
  from jsonb_to_recordset(coalesce(s->'informational_questions', '[]'::jsonb))
    as x(question_key text, question_text text, example text, why_text text, answer_type text, options text[], section text, section_sort int, item_sort int, active boolean);

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
