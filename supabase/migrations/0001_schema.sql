-- Perfios Pricing Engine — Stage 1 schema.
-- All pricing logic is DATA in these tables; no rates or rules live in code.

create type frequency as enum ('recurring', 'one_time');
create type module_kind as enum ('composite', 'saas');
create type cm_model as enum ('perpetual', 'subscription');

-- Rate-card line items.
create table public.fields (
  id             uuid primary key default gen_random_uuid(),
  field_key      text unique not null,
  label          text not null,
  unit_price_inr integer not null check (unit_price_inr >= 0),
  frequency      frequency not null default 'recurring',
  active         boolean not null default true,
  sort_order     integer not null default 0
);

-- Selectable modules. deployment_pct / amc_pct are nullable per-module overrides
-- reserved for a future stage; the composite bucket reads its rates from settings.
create table public.modules (
  id                 uuid primary key default gen_random_uuid(),
  module_key         text unique not null,
  label              text not null,
  kind               module_kind not null,
  deployment_pct     numeric(6,4),
  amc_pct            numeric(6,4),
  multiplier         numeric(6,4),
  applies_multiplier boolean not null default false,
  active             boolean not null default true
);

-- Tags fields to modules. The UNION across selected modules drives both pricing
-- (shared fields counted once) and questionnaire gating.
create table public.module_fields (
  module_id uuid not null references public.modules(id) on delete cascade,
  field_id  uuid not null references public.fields(id) on delete cascade,
  primary key (module_id, field_id)
);

-- Consent Manager tiers (picked manually by the user).
create table public.cm_tiers (
  id                     uuid primary key default gen_random_uuid(),
  tier_key               text unique not null,
  label                  text not null,
  license_fee_inr        integer not null check (license_fee_inr >= 0),
  amc_pct                numeric(6,4) not null default 0.30,
  implementation_fee_inr integer not null default 0 check (implementation_fee_inr >= 0)
);

-- Global settings (single row enforced by a boolean primary key fixed to true).
create table public.settings (
  id                     boolean primary key default true,
  currency               text not null default 'INR',
  deployment_pct         numeric(6,4) not null default 0.18,
  amc_pct                numeric(6,4) not null default 0.12,
  y2_includes_deployment boolean not null default false,
  cm_model               cm_model not null default 'perpetual',
  rounding               text not null default 'half_up',
  constraint settings_singleton check (id = true)
);

-- Full published config snapshot per publish, for the calculator to read and for rollback.
create table public.config_versions (
  id           uuid primary key default gen_random_uuid(),
  version_no   integer unique not null,
  snapshot     jsonb not null,
  published_by text,
  published_at timestamptz not null default now(),
  is_live      boolean not null default false
);

-- At most one live version at a time.
create unique index one_live_config_version on public.config_versions (is_live) where is_live;
