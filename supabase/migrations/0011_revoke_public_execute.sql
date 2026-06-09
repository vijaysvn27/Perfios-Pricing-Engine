-- Stage 3 fix: CREATE FUNCTION grants EXECUTE to PUBLIC by default, and anon
-- inherits via PUBLIC. Revoking from anon alone is not enough — revoke from PUBLIC
-- so only the explicitly-granted authenticated role can call these (and the
-- in-function is_admin() guard still gates to admins).

revoke execute on function public.publish_snapshot(jsonb, text) from public;
revoke execute on function public.rollback_to_version(integer) from public;
revoke execute on function public.reset_draft_to_live() from public;
revoke execute on function public.set_field_tag(text, text, boolean) from public;

grant execute on function public.publish_snapshot(jsonb, text) to authenticated;
grant execute on function public.rollback_to_version(integer) to authenticated;
grant execute on function public.reset_draft_to_live() to authenticated;
grant execute on function public.set_field_tag(text, text, boolean) to authenticated;
