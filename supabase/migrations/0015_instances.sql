-- Stage 4 Step 1: instance model (NON-BREAKING / additive).
-- Introduces instances + scopes every config table by instance_id, with all
-- current data assigned to a single "Template" instance. Existing constraints,
-- RPCs, and app behavior are unchanged — the app keeps working as the Template.

create table public.instances (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  is_template  boolean not null default false,
  share_token  text unique,
  active       boolean not null default true,
  created_by   text,
  created_at   timestamptz not null default now()
);
alter table public.instances enable row level security;

-- Admin-only management. Anon cannot list or read instances.
create policy "admin all instances" on public.instances
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Create the Template instance and assign all existing config to it.
do $$
declare tmpl uuid;
begin
  insert into public.instances (name, is_template, active, created_by)
  values ('Template', true, true, 'stage4-migration')
  returning id into tmpl;

  alter table public.fields          add column instance_id uuid references public.instances(id) on delete cascade;
  alter table public.modules         add column instance_id uuid references public.instances(id) on delete cascade;
  alter table public.module_fields   add column instance_id uuid references public.instances(id) on delete cascade;
  alter table public.cm_tiers        add column instance_id uuid references public.instances(id) on delete cascade;
  alter table public.settings        add column instance_id uuid references public.instances(id) on delete cascade;
  alter table public.config_versions add column instance_id uuid references public.instances(id) on delete cascade;

  update public.fields          set instance_id = tmpl;
  update public.modules         set instance_id = tmpl;
  update public.module_fields   set instance_id = tmpl;
  update public.cm_tiers        set instance_id = tmpl;
  update public.settings        set instance_id = tmpl;
  update public.config_versions set instance_id = tmpl;

  alter table public.fields          alter column instance_id set not null;
  alter table public.modules         alter column instance_id set not null;
  alter table public.module_fields   alter column instance_id set not null;
  alter table public.cm_tiers        alter column instance_id set not null;
  alter table public.settings        alter column instance_id set not null;
  alter table public.config_versions alter column instance_id set not null;
end $$;

create index on public.fields(instance_id);
create index on public.modules(instance_id);
create index on public.module_fields(instance_id);
create index on public.cm_tiers(instance_id);
create index on public.config_versions(instance_id);

-- NOTE: per-instance unique constraints, the settings PK change, the instance-scoped
-- RPCs, and clone_instance are deferred to Step 2 (they couple with the data layer),
-- so this migration leaves the single-Template config behaving exactly as before.
