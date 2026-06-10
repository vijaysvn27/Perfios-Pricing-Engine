-- Stage 5: defense-in-depth on the persistence tables. RLS already denies anon
-- (no anon policy), but revoke the default anon table grants too so there is no
-- access path at all to stored customer/quote data. Writes go via service role.
revoke all on table public.customers     from anon;
revoke all on table public.quotes        from anon;
revoke all on table public.quote_events  from anon;
