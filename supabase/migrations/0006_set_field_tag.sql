-- Stage 2: tag/untag a field to a module by KEYS, so the client never handles UUIDs.
create or replace function public.set_field_tag(p_module_key text, p_field_key text, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m_id uuid; f_id uuid;
begin
  select id into m_id from public.modules where module_key = p_module_key;
  select id into f_id from public.fields where field_key = p_field_key;
  if m_id is null or f_id is null then raise exception 'unknown module/field'; end if;
  if p_on then
    insert into public.module_fields(module_id, field_id) values (m_id, f_id) on conflict do nothing;
  else
    delete from public.module_fields where module_id = m_id and field_id = f_id;
  end if;
end $$;

grant execute on function public.set_field_tag(text, text, boolean) to anon, authenticated;
