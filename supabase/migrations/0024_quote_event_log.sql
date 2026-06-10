-- Stage 5 Step 6: anon-callable, rate-limited event logger for the public
-- calculator. Used for lightweight events that have no priced quote behind them
-- (currently the questionnaire download). The heavier `pricing_download` event +
-- the quote row are written server-side by the `store-quote` Edge Function (service
-- role), which recomputes pricing and never trusts client-supplied prices.
--
-- SECURITY: SECURITY DEFINER so the anon browser can append a row to quote_events
-- (which has no anon policies) WITHOUT any anon write grant on the table. The
-- function: (1) accepts only an allow-listed event_type, (2) resolves the instance
-- from the share token (silently no-ops on unknown/inactive tokens — no leak),
-- (3) rate-limits per token via the service-role-only hit_rate_limit (callable here
-- because this definer function is owned by the same privileged role), and
-- (4) bounds the customer name length.

create or replace function public.log_quote_event(
  p_token text,
  p_event_type text,
  p_customer_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instance uuid;
  v_customer uuid;
  v_name     text;
begin
  -- Only events that legitimately originate from the anon client may use this path.
  if p_event_type is distinct from 'questionnaire_download' then
    raise exception 'invalid event';
  end if;

  select id into v_instance
  from public.instances
  where share_token = p_token and active
  limit 1;

  -- Unknown / inactive / regenerated token: ignore quietly (no information leak).
  if v_instance is null then
    return;
  end if;

  -- Per-token rate limit (shares the fixed-window counter used by the Edge Functions).
  if not public.hit_rate_limit('qevent:' || p_token, 60, 60) then
    raise exception 'rate limit exceeded';
  end if;

  v_name := nullif(btrim(coalesce(p_customer_name, '')), '');
  if v_name is not null then
    v_name := left(v_name, 200);
    insert into public.customers (instance_id, name)
    values (v_instance, v_name)
    on conflict (instance_id, name) do update set name = excluded.name
    returning id into v_customer;
  end if;

  insert into public.quote_events (instance_id, customer_id, customer_name, event_type)
  values (v_instance, v_customer, v_name, p_event_type);
end $$;

revoke execute on function public.log_quote_event(text, text, text) from public;
grant  execute on function public.log_quote_event(text, text, text) to anon, authenticated;
