-- Part 9: first four pro-terminal upgrades
-- 1) live smart-wallet intelligence snapshots
-- 2) advanced scanner/lifecycle storage
-- 3) richer PAPER execution telemetry
-- 4) holder/lifecycle visualization support

alter table public.paper_fills
  add column if not exists dex_fee_usd numeric not null default 0,
  add column if not exists network_fee_usd numeric not null default 0,
  add column if not exists post_trade_price_usd numeric,
  add column if not exists slippage_limit_bps numeric,
  add column if not exists priority_fee_sol numeric not null default 0;

alter table public.paper_trades
  add column if not exists dex_fee_usd numeric not null default 0,
  add column if not exists network_fee_usd numeric not null default 0,
  add column if not exists post_trade_price_usd numeric,
  add column if not exists slippage_limit_bps numeric,
  add column if not exists priority_fee_sol numeric not null default 0;

create table if not exists public.paper_smart_wallet_snapshots (
  address text primary key,
  smart_score integer not null check (smart_score between 0 and 100),
  confidence text not null check (confidence in ('LOW','MEDIUM','HIGH')),
  recent_tx_count integer not null default 0,
  tx_success_pct numeric,
  swap_count_30d integer,
  active_days_30d integer,
  unique_tokens_30d integer,
  sol_balance numeric,
  priced_portfolio_usd numeric,
  priced_holding_count integer not null default 0,
  top_holding_pct numeric,
  last_activity_at timestamptz,
  profitability_status text not null default 'UNKNOWN' check (profitability_status in ('UNKNOWN','PARTIAL','VERIFIED')),
  estimated_realized_pnl_usd numeric,
  estimated_win_rate_pct numeric,
  sources jsonb not null default '[]'::jsonb,
  score_components jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.paper_smart_wallet_snapshots enable row level security;
drop policy if exists paper_smart_wallet_snapshots_read on public.paper_smart_wallet_snapshots;
create policy paper_smart_wallet_snapshots_read on public.paper_smart_wallet_snapshots
  for select to anon, authenticated using (true);
revoke all on public.paper_smart_wallet_snapshots from public;
grant select on public.paper_smart_wallet_snapshots to anon, authenticated;
create index if not exists paper_smart_wallet_score_idx
  on public.paper_smart_wallet_snapshots(smart_score desc, observed_at desc);

create table if not exists public.paper_token_lifecycle_snapshots (
  mint_address text primary key,
  token_symbol text,
  pair_address text,
  pair_created_at timestamptz,
  first_seen_at timestamptz not null default now(),
  current_dex_id text,
  previous_dex_id text,
  migration_count integer not null default 0,
  last_migration_at timestamptz,
  current_price_usd numeric,
  current_market_cap_usd numeric,
  current_liquidity_usd numeric,
  peak_price_usd numeric,
  peak_market_cap_usd numeric,
  peak_liquidity_usd numeric,
  ath_at timestamptz,
  historical_candle_count integer not null default 0,
  holder_count bigint,
  top10_holder_pct numeric,
  top_holders jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  details jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.paper_token_lifecycle_snapshots enable row level security;
drop policy if exists paper_token_lifecycle_snapshots_read on public.paper_token_lifecycle_snapshots;
create policy paper_token_lifecycle_snapshots_read on public.paper_token_lifecycle_snapshots
  for select to anon, authenticated using (true);
revoke all on public.paper_token_lifecycle_snapshots from public;
grant select on public.paper_token_lifecycle_snapshots to anon, authenticated;
create index if not exists paper_token_lifecycle_observed_idx
  on public.paper_token_lifecycle_snapshots(observed_at desc);

create table if not exists public.paper_token_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  mint_address text not null,
  event_type text not null check (event_type in ('pair_created','first_seen','ath','dex_change')),
  event_at timestamptz not null,
  dex_from text,
  dex_to text,
  value_usd numeric,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.paper_token_lifecycle_events enable row level security;
drop policy if exists paper_token_lifecycle_events_read on public.paper_token_lifecycle_events;
create policy paper_token_lifecycle_events_read on public.paper_token_lifecycle_events
  for select to anon, authenticated using (true);
revoke all on public.paper_token_lifecycle_events from public;
grant select on public.paper_token_lifecycle_events to anon, authenticated;
create unique index if not exists paper_token_lifecycle_event_dedupe
  on public.paper_token_lifecycle_events(
    mint_address,
    event_type,
    event_at,
    coalesce(dex_from,''),
    coalesce(dex_to,'')
  );
create index if not exists paper_token_lifecycle_events_mint_idx
  on public.paper_token_lifecycle_events(mint_address,event_at desc);
