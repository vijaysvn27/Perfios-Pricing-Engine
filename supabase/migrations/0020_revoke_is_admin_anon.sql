-- is_admin() is only evaluated by authenticated RLS policies and (internally) by
-- security-definer RPCs. anon never needs it; revoke the default direct grant
-- (harmless either way — it returns false for anon — but keeps the linter clean).
revoke execute on function public.is_admin() from anon;
