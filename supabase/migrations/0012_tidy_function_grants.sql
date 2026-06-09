-- Stage 3 fix: tidy SECURITY DEFINER grants.
-- - handle_new_user is a TRIGGER function; it never needs to be called via the API.
--   Triggers fire regardless of EXECUTE grants, so revoke from everyone.
-- - is_admin must be callable by `authenticated` (RLS policies evaluate it), but not
--   by anon (no anon policy references it after lockdown).

revoke all on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
