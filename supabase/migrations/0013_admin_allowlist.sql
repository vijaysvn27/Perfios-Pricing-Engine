-- Stage 3: pre-authorize admins by email. An email on the allowlist becomes admin
-- automatically when its account is created (handled in handle_new_user), so admin
-- assignment works regardless of whether the account exists yet.

create table public.admin_allowlist (
  email text primary key
);
alter table public.admin_allowlist enable row level security;
-- No policies: locked to the service role / definer functions only.

insert into public.admin_allowlist (email) values
  ('vijay.narayanan@perfios.com'),
  ('aakash.s@perfios.com'),
  ('olivia.mukhopadhyay@perfios.com')
on conflict (email) do nothing;

-- New users on the allowlist get 'admin'; everyone else 'viewer'.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare desired user_role := 'viewer';
begin
  if exists (select 1 from public.admin_allowlist a where a.email = new.email) then
    desired := 'admin';
  end if;
  insert into public.profiles (id, email, role)
  values (new.id, new.email, desired)
  on conflict (id) do nothing;
  return new;
end $$;

-- Promote any already-existing profiles that match the allowlist (idempotent).
update public.profiles p
set role = 'admin'
from public.admin_allowlist a
where a.email = p.email and p.role <> 'admin';
