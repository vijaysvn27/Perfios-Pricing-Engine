-- Row Level Security. Stage 1 has no auth: the calculator reads ONLY the live
-- published snapshot, anonymously. The normalised editing tables are locked by
-- default (RLS on, no policy) and will be opened to admins behind auth in a later stage.

alter table public.fields enable row level security;
alter table public.modules enable row level security;
alter table public.module_fields enable row level security;
alter table public.cm_tiers enable row level security;
alter table public.settings enable row level security;
alter table public.config_versions enable row level security;

-- Anyone may read the current live config snapshot (and nothing else).
create policy "anon reads live config snapshot"
  on public.config_versions
  for select
  to anon, authenticated
  using (is_live = true);
