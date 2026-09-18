-- Part 7: persistent PAPER conditional orders (limit / stop loss / take profit).
-- Supabase CLI is not available in this execution environment, so this migration
-- was validated transactionally on staging before being committed.

create table if not exists public.paper_conditional_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  token_address text not null,
  token_symbol text,
  side text not null check (side in ('buy','sell')),
  order_type text not null check (order_type in ('limit','stop_loss','take_profit')),
  trigger_price_usd numeric(30,14) not null check (trigger_price_usd>0),
  amount_sol numeric(30,12),
  sell_pct numeric(8,4),
  status text not null default 'pending' check (status in ('pending','processing','filled','cancelled','expired','rejected')),
  current_price_usd numeric(30,14),
  executed_order_id uuid,
  rejection_reason text,
  expires_at timestamptz,
  processing_started_at timestamptz,
  triggered_at timestamptz,
  filled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(user_id,idempotency_key),
  check (
    (side='buy' and amount_sol is not null and amount_sol>0 and sell_pct is null)
    or
    (side='sell' and sell_pct is not null and sell_pct>0 and sell_pct<=100 and amount_sol is null)
  )
);

alter table public.paper_conditional_orders enable row level security;
revoke all on public.paper_conditional_orders from public,anon,authenticated;
grant select on public.paper_conditional_orders to authenticated;
grant select,insert,update,delete on public.paper_conditional_orders to service_role;

drop policy if exists paper_conditional_orders_read_own on public.paper_conditional_orders;
create policy paper_conditional_orders_read_own
on public.paper_conditional_orders
for select
to authenticated
using ((select auth.uid())=user_id);

create index if not exists paper_conditional_orders_user_status_idx
  on public.paper_conditional_orders(user_id,status,created_at desc);
create index if not exists paper_conditional_orders_monitor_idx
  on public.paper_conditional_orders(status,expires_at,created_at)
  where status in ('pending','processing');

create or replace function paper_private.invoke_conditional_order_monitor()
returns bigint
language plpgsql
security definer
set search_path=paper_private,public,net,pg_temp
as $monitor$
declare
  cfg paper_private.runtime_config%rowtype;
  tok text;
  req_id bigint;
begin
  select * into cfg from paper_private.runtime_config where id=true;
  if not coalesce(cfg.monitor_enabled,false) or cfg.project_url is null then return null; end if;
  select internal_monitor_token into tok from paper_private.runtime_secrets where id=true;

  select net.http_post(
    url:=rtrim(cfg.project_url,'/')||'/functions/v1/paper-order-monitor',
    headers:=jsonb_build_object('Content-Type','application/json','x-paper-internal-token',tok),
    body:='{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds:=20000
  ) into req_id;
  return req_id;
end;
$monitor$;

revoke all on function paper_private.invoke_conditional_order_monitor() from public,anon,authenticated;
grant execute on function paper_private.invoke_conditional_order_monitor() to service_role;

do $schedule$
declare existing_id bigint;
begin
  select jobid into existing_id from cron.job where jobname='paper-conditional-order-monitor-v1';
  if existing_id is not null then perform cron.unschedule(existing_id); end if;
  perform cron.schedule(
    'paper-conditional-order-monitor-v1',
    '30 seconds',
    'select paper_private.invoke_conditional_order_monitor();'
  );
end
$schedule$;


-- Persistent watchlist alert events. These are server-evaluated so alerts survive page refreshes.
alter table public.token_watchlist
  add column if not exists push_enabled boolean not null default false,
  add column if not exists alert_above_triggered boolean not null default false,
  add column if not exists alert_below_triggered boolean not null default false,
  add column if not exists alert_last_price_usd numeric(30,14),
  add column if not exists alert_last_checked_at timestamptz;

create table if not exists public.paper_alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  watchlist_id uuid not null references public.token_watchlist(id) on delete cascade,
  chain_id text not null,
  token_address text not null,
  token_symbol text,
  direction text not null check (direction in ('above','below')),
  trigger_price_usd numeric(30,14) not null,
  observed_price_usd numeric(30,14) not null,
  status text not null default 'unread' check (status in ('unread','read')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.paper_alert_events enable row level security;
revoke all on public.paper_alert_events from public,anon,authenticated;
grant select,update on public.paper_alert_events to authenticated;
grant select,insert,update,delete on public.paper_alert_events to service_role;

drop policy if exists paper_alert_events_read_own on public.paper_alert_events;
create policy paper_alert_events_read_own
on public.paper_alert_events for select
to authenticated
using ((select auth.uid())=user_id);

drop policy if exists paper_alert_events_update_own on public.paper_alert_events;
create policy paper_alert_events_update_own
on public.paper_alert_events for update
to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

create index if not exists paper_alert_events_user_created_idx
  on public.paper_alert_events(user_id,created_at desc);
create index if not exists token_watchlist_alert_scan_idx
  on public.token_watchlist(updated_at)
  where alert_above_usd is not null or alert_below_usd is not null;

create or replace function paper_private.invoke_watchlist_alert_monitor()
returns bigint
language plpgsql
security definer
set search_path=paper_private,public,net,pg_temp
as $watch$
declare
  cfg paper_private.runtime_config%rowtype;
  tok text;
  req_id bigint;
begin
  select * into cfg from paper_private.runtime_config where id=true;
  if not coalesce(cfg.monitor_enabled,false) or cfg.project_url is null then return null; end if;
  select internal_monitor_token into tok from paper_private.runtime_secrets where id=true;

  select net.http_post(
    url:=rtrim(cfg.project_url,'/')||'/functions/v1/paper-watchlist-monitor',
    headers:=jsonb_build_object('Content-Type','application/json','x-paper-internal-token',tok),
    body:='{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds:=20000
  ) into req_id;
  return req_id;
end;
$watch$;

revoke all on function paper_private.invoke_watchlist_alert_monitor() from public,anon,authenticated;
grant execute on function paper_private.invoke_watchlist_alert_monitor() to service_role;

do $schedule$
declare existing_id bigint;
begin
  select jobid into existing_id from cron.job where jobname='paper-watchlist-alert-monitor-v1';
  if existing_id is not null then perform cron.unschedule(existing_id); end if;
  perform cron.schedule(
    'paper-watchlist-alert-monitor-v1',
    '* * * * *',
    'select paper_private.invoke_watchlist_alert_monitor();'
  );
end
$schedule$;
