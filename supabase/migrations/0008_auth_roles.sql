-- Stage 3: roles. A profile per auth user; admin is assigned by email later.

create type user_role as enum ('admin', 'viewer');

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       user_role not null default 'viewer',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Auto-create a viewer profile whenever an auth user is added (incl. dashboard-created).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'viewer')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Current caller admin? security definer so it can be used inside the profiles
-- RLS policy without recursion (it reads the table as the definer, bypassing RLS).
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Assign / unassign admin by email. Service-role only (run via SQL editor / MCP).
create or replace function public.grant_admin(p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set role = 'admin' where email = p_email;
  if not found then raise exception 'no profile with email %', p_email; end if;
end $$;

create or replace function public.revoke_admin(p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set role = 'viewer' where email = p_email;
  if not found then raise exception 'no profile with email %', p_email; end if;
end $$;

-- A user can read their own profile; admins can read all.
create policy "read own or admin profiles" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

-- Keep the admin-assignment helpers off the public API surface.
revoke all on function public.grant_admin(text) from public, anon, authenticated;
revoke all on function public.revoke_admin(text) from public, anon, authenticated;
