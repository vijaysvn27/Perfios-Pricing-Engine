-- Proposal-builder rate cards: one draft + published versioned snapshots per
-- instance. Snapshot shape = src/lib/engine2/types.ts RateCard.
create table if not exists rate_cards (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  status text not null check (status in ('draft', 'published')),
  version integer not null default 0, -- 0 for the draft row; >=1 for published
  snapshot jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (instance_id, status, version)
);

create index if not exists rate_cards_instance_status_idx
  on rate_cards (instance_id, status, version desc);

alter table rate_cards enable row level security;

-- Admins manage rate cards end to end.
create policy rate_cards_admin_all on rate_cards
  for all
  using (is_admin())
  with check (is_admin());

-- Any authenticated user (AM role) can read the latest published card;
-- drafts stay admin-only.
create policy rate_cards_read_published on rate_cards
  for select
  to authenticated
  using (status = 'published');

-- Proposals: an AM's saved deal — inputs + which rate-card version priced it.
create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  customer_name text not null,
  channel text not null default 'direct'
    check (channel in ('direct', 'aurva', 'techjockey', 'pwc')), -- INTERNAL ONLY: never rendered client-side
  internal_notes text not null default '',
  validity_days integer not null default 60,
  inputs jsonb not null,
  rate_card_version integer not null,
  totals jsonb not null default '{}'::jsonb,
  discount_shown boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposals_instance_idx on proposals (instance_id, updated_at desc);

alter table proposals enable row level security;

-- Owners manage their own proposals; admins see and manage everything.
create policy proposals_owner_all on proposals
  for all
  to authenticated
  using (created_by = auth.uid() or is_admin())
  with check (created_by = auth.uid() or is_admin());
