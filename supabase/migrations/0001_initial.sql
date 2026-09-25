-- CoteScope FR initial data model.
-- Apply to a dedicated Supabase project only.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  sport text not null,
  competition text not null,
  home_name text,
  away_name text,
  starts_at timestamptz not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.odds_snapshots (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  bookmaker text not null,
  market_key text not null,
  selection_key text not null,
  decimal_odds numeric(8,3) not null check (decimal_odds > 1),
  is_boost boolean not null default false,
  source_timestamp timestamptz,
  captured_at timestamptz not null default now()
);

create index if not exists odds_event_market_idx
  on public.odds_snapshots(event_id, market_key, selection_key, captured_at desc);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  market_key text not null,
  selection_key text not null,
  bookmaker text not null,
  bookmaker_odds numeric(8,3) not null,
  fair_odds numeric(8,3) not null,
  ev_pct numeric(8,3) not null,
  opportunity_score smallint not null check (opportunity_score between 0 and 100),
  high_odds_guard_passed boolean not null default false,
  detected_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.tracked_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  selection_label text not null,
  market_label text not null,
  bookmaker text not null,
  decimal_odds numeric(8,3) not null check (decimal_odds > 1),
  stake numeric(12,2) not null check (stake >= 0),
  fair_odds_at_bet numeric(8,3),
  closing_odds numeric(8,3),
  result text not null default 'open',
  profit_loss numeric(12,2),
  placed_at timestamptz not null default now(),
  settled_at timestamptz
);

alter table public.tracked_bets enable row level security;

create policy "users read own tracked bets"
  on public.tracked_bets for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own tracked bets"
  on public.tracked_bets for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users update own tracked bets"
  on public.tracked_bets for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users delete own tracked bets"
  on public.tracked_bets for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Public market data is intended to be read through server routes initially.
alter table public.events enable row level security;
alter table public.odds_snapshots enable row level security;
alter table public.opportunities enable row level security;
