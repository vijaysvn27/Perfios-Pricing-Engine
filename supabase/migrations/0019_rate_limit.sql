-- Stage 4 Step 7: basic rate limiting for the public price-instance Edge Function.
-- Postgres-backed fixed-window counter so it survives function cold starts and is
-- shared across isolates. Only the service role (the Edge Function) may call it.

create table public.rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (bucket, window_start)
);
alter table public.rate_limits enable row level security;
-- No policies: only the security-definer function (service role) touches this.

create function public.hit_rate_limit(p_bucket text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare w timestamptz; c int;
begin
  w := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits (bucket, window_start, count)
  values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set count = public.rate_limits.count + 1
  returning count into c;
  delete from public.rate_limits where window_start < now() - interval '1 hour';
  return c <= p_max; -- true = allowed
end $$;

revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant  execute on function public.hit_rate_limit(text, int, int) to service_role;
