-- Stage 4 Step 2 fix: Supabase default privileges grant EXECUTE directly to anon
-- on new functions, so `revoke from public` is insufficient. Revoke from anon
-- explicitly. CRITICAL for get_published_config, which returns the rate-bearing
-- snapshot and must be service_role only.

revoke execute on function public.get_published_config(text) from anon, authenticated, public;
grant  execute on function public.get_published_config(text) to service_role;

-- Admin-guarded RPCs: keep authenticated (is_admin() inside), remove anon.
revoke execute on function public.publish_snapshot(uuid, jsonb, text) from anon;
revoke execute on function public.rollback_to_version(uuid, integer) from anon;
revoke execute on function public.reset_draft_to_live(uuid) from anon;
revoke execute on function public.set_field_tag(uuid, text, text, boolean) from anon;
revoke execute on function public.clone_instance(uuid, text) from anon;
revoke execute on function public.rename_instance(uuid, text) from anon;
revoke execute on function public.regenerate_token(uuid) from anon;
