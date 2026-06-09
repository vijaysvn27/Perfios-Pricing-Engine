-- Stage 3: replace Stage 2's permissive anon policies with role-based RLS.
-- Draft tables become admin-only; config_versions is readable by any logged-in
-- user only for the LIVE version; admin reads all.

-- 1. Drop Stage 2 permissive anon policies on the 5 draft tables.
do $$
declare t text;
begin
  foreach t in array array['fields','modules','module_fields','cm_tiers','settings'] loop
    execute format('drop policy if exists "anon read %1$s" on public.%1$s;', t);
    execute format('drop policy if exists "anon insert %1$s" on public.%1$s;', t);
    execute format('drop policy if exists "anon update %1$s" on public.%1$s;', t);
    execute format('drop policy if exists "anon delete %1$s" on public.%1$s;', t);
  end loop;
end $$;

-- Drop the anon read policies on config_versions (Stage 1 live-read + Stage 2 read-all).
drop policy if exists "anon read all config versions" on public.config_versions;
drop policy if exists "anon reads live config snapshot" on public.config_versions;

-- 2. Admin-only access on the 5 draft tables (the calculator never reads these).
do $$
declare t text;
begin
  foreach t in array array['fields','modules','module_fields','cm_tiers','settings'] loop
    execute format('create policy "admin read %1$s" on public.%1$s for select to authenticated using (public.is_admin());', t);
    execute format('create policy "admin insert %1$s" on public.%1$s for insert to authenticated with check (public.is_admin());', t);
    execute format('create policy "admin update %1$s" on public.%1$s for update to authenticated using (public.is_admin()) with check (public.is_admin());', t);
    execute format('create policy "admin delete %1$s" on public.%1$s for delete to authenticated using (public.is_admin());', t);
  end loop;
end $$;

-- 3. config_versions: any logged-in user reads the LIVE version (calculator);
--    admin reads all (history). Writes happen only through the RPCs.
create policy "read live or admin config versions" on public.config_versions
  for select to authenticated using (is_live or public.is_admin());
