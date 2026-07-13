-- Add Rohit as admin (proposal-builder review, 2026-07-13). Allowlisted emails
-- become admin on first sign-in (handle_new_user); the update promotes an
-- already-existing account immediately. Idempotent.

insert into public.admin_allowlist (email) values
  ('rohit.d@perfios.com')
on conflict (email) do nothing;

update public.profiles p
set role = 'admin'
from public.admin_allowlist a
where a.email = p.email and p.role <> 'admin';
