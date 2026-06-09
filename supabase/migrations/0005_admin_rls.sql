-- Stage 2: permissive anon write RLS for draft editing (no auth yet).
-- AUTH-STAGE TODO: replace these with authenticated admin-only policies.

do $$
declare t text;
begin
  foreach t in array array['fields','modules','module_fields','cm_tiers','settings'] loop
    execute format('create policy "anon read %1$s" on public.%1$s for select to anon, authenticated using (true);', t);
    execute format('create policy "anon insert %1$s" on public.%1$s for insert to anon, authenticated with check (true);', t);
    execute format('create policy "anon update %1$s" on public.%1$s for update to anon, authenticated using (true) with check (true);', t);
    execute format('create policy "anon delete %1$s" on public.%1$s for delete to anon, authenticated using (true);', t);
  end loop;
end $$;

-- Admin needs the full version history (the calculator's live-only read policy stays).
create policy "anon read all config versions" on public.config_versions
  for select to anon, authenticated using (true);
