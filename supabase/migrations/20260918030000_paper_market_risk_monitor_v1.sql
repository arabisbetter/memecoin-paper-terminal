-- PAPER Part 2: market/risk backend + always-on evaluation monitor.
-- Real funded trading and payouts remain disabled.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create schema if not exists paper_private;
revoke all on schema paper_private from public, anon, authenticated;
grant usage on schema paper_private to service_role;

create table if not exists paper_private.runtime_secrets (
  id boolean primary key default true check (id),
  internal_monitor_token text not null default encode(gen_random_bytes(32),'hex'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);
insert into paper_private.runtime_secrets(id) values(true) on conflict(id) do nothing;
revoke all on paper_private.runtime_secrets from public,anon,authenticated;
grant select on paper_private.runtime_secrets to service_role;

create table if not exists paper_private.runtime_config (
  id boolean primary key default true check (id),
  project_url text,
  monitor_enabled boolean not null default false,
  monitor_interval_seconds integer not null default 30 check (monitor_interval_seconds between 15 and 300),
  updated_at timestamptz not null default now()
);
insert into paper_private.runtime_config(id) values(true) on conflict(id) do nothing;
revoke all on paper_private.runtime_config from public,anon,authenticated;
grant select on paper_private.runtime_config to service_role;

create table if not exists public.paper_market_provider_health (
  provider text primary key,
  status text not null default 'DEGRADED' check (status in ('LIVE','DEGRADED','DOWN')),
  last_latency_ms integer,
  consecutive_successes integer not null default 0,
  consecutive_failures integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.paper_market_provider_health enable row level security;

create table if not exists public.paper_market_marks (
  mint_address text primary key,
  price_usd numeric(30,16),
  liquidity_usd numeric(24,8),
  market_cap_usd numeric(24,8),
  source text not null,
  data_status text not null check (data_status in ('LIVE','DEGRADED','STALE','UNAVAILABLE')),
  source_at timestamptz,
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (price_usd is null or price_usd >= 0),
  check (liquidity_usd is null or liquidity_usd >= 0)
);
alter table public.paper_market_marks enable row level security;
create index if not exists paper_market_marks_status_time_idx
  on public.paper_market_marks(data_status,observed_at desc);

create table if not exists public.paper_risk_policy (
  id boolean primary key default true check (id),
  min_liquidity_usd numeric(20,2) not null default 10000,
  max_top10_holder_pct numeric(8,4) not null default 65,
  max_dev_holder_pct numeric(8,4) not null default 15,
  block_freeze_authority boolean not null default true,
  block_mint_authority boolean not null default false,
  max_risk_score integer not null default 80 check (max_risk_score between 1 and 100),
  updated_at timestamptz not null default now()
);
insert into public.paper_risk_policy(id) values(true) on conflict(id) do nothing;
alter table public.paper_risk_policy enable row level security;

create table if not exists public.paper_token_risk_snapshots (
  mint_address text primary key,
  token_symbol text,
  top10_holder_pct numeric(8,4),
  top20_holder_pct numeric(8,4),
  dev_holder_pct numeric(8,4),
  liquidity_usd numeric(24,8),
  mint_authority_present boolean,
  freeze_authority_present boolean,
  holder_count bigint,
  holder_count_is_lower_bound boolean not null default false,
  dev_sell_detected boolean,
  bundled_wallet_score integer check (bundled_wallet_score between 0 and 100),
  sniper_score integer check (sniper_score between 0 and 100),
  suspicious_cluster_score integer check (suspicious_cluster_score between 0 and 100),
  token_age_seconds bigint,
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  risk_level text not null default 'UNKNOWN' check (risk_level in ('LOW','MEDIUM','HIGH','CRITICAL','UNKNOWN')),
  funded_buy_blocked boolean not null default false,
  data_status text not null default 'DEGRADED' check (data_status in ('LIVE','DEGRADED','STALE','UNAVAILABLE')),
  sources text[] not null default '{}'::text[],
  details jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);
alter table public.paper_token_risk_snapshots enable row level security;
create index if not exists paper_token_risk_level_idx
  on public.paper_token_risk_snapshots(risk_level,risk_score desc,observed_at desc);

create table if not exists public.paper_evaluation_monitor_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  active_evaluations integer not null default 0,
  marked_live integer not null default 0,
  marked_degraded integer not null default 0,
  passed integer not null default 0,
  failed integer not null default 0,
  expired integer not null default 0,
  provider_summary jsonb not null default '{}'::jsonb,
  error_summary jsonb not null default '{}'::jsonb
);
alter table public.paper_evaluation_monitor_runs enable row level security;

drop policy if exists paper_provider_health_read on public.paper_market_provider_health;
create policy paper_provider_health_read on public.paper_market_provider_health
  for select to authenticated using (true);
drop policy if exists paper_market_marks_read on public.paper_market_marks;
create policy paper_market_marks_read on public.paper_market_marks
  for select to authenticated using (true);
drop policy if exists paper_risk_policy_read on public.paper_risk_policy;
create policy paper_risk_policy_read on public.paper_risk_policy
  for select to authenticated using (true);
drop policy if exists paper_token_risk_read on public.paper_token_risk_snapshots;
create policy paper_token_risk_read on public.paper_token_risk_snapshots
  for select to authenticated using (true);

revoke all on public.paper_market_provider_health,public.paper_market_marks,public.paper_risk_policy,
  public.paper_token_risk_snapshots,public.paper_evaluation_monitor_runs
from public,anon,authenticated;
grant select on public.paper_market_provider_health,public.paper_market_marks,public.paper_risk_policy,
  public.paper_token_risk_snapshots
to authenticated;

create or replace function public.paper_verify_internal_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path=paper_private,pg_temp
as $$
  select coalesce(p_token,'') <> ''
     and p_token = (select internal_monitor_token from paper_private.runtime_secrets where id=true);
$$;
revoke all on function public.paper_verify_internal_token(text) from public,anon,authenticated;
grant execute on function public.paper_verify_internal_token(text) to service_role;

-- Provider failures must never fabricate an evaluation result. Only LIVE data can
-- move equity, trailing drawdown, daily loss, or pass/fail state. Expiration is
-- time-based and may still close an evaluation while market data is unavailable.
create or replace function public.paper_record_evaluation_mark_v1(
  p_user_id uuid,
  p_equity_usd numeric,
  p_cash_usd numeric,
  p_open_value_usd numeric,
  p_source text,
  p_data_status text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  e public.paper_evaluations%rowtype;
  v_now timestamptz:=now();
  v_utc_date date:=(now() at time zone 'utc')::date;
  v_peak numeric;
  v_floor numeric;
  v_anchor numeric;
  v_daily_loss numeric;
  v_drawdown_pct numeric;
  v_trades integer;
  v_status text;
  v_reason text;
  v_app_id uuid;
begin
  if p_user_id is null then raise exception 'user required'; end if;
  if p_data_status not in ('LIVE','DEGRADED','STALE','UNAVAILABLE') then raise exception 'invalid data status'; end if;

  select * into e from public.paper_evaluations
  where user_id=p_user_id and status='active'
  order by starts_at desc limit 1 for update;

  if e.id is null then
    return jsonb_build_object(
      'active',false,
      'status',coalesce((select status from public.paper_evaluations where user_id=p_user_id order by attempt_no desc limit 1),'none')
    );
  end if;

  if p_data_status <> 'LIVE' then
    v_status:=case when v_now>=e.expires_at then 'expired' else 'active' end;
    v_reason:=case when v_status='expired' then '30_day_window_expired' else null end;

    update public.paper_evaluations set
      status=v_status,
      failure_reason=coalesce(v_reason,failure_reason),
      ended_at=case when v_status='expired' then coalesce(ended_at,v_now) else ended_at end,
      cooldown_until=case when v_status='expired' then v_now+interval '24 hours' else cooldown_until end,
      last_mark_at=v_now,
      last_mark_source=p_source,
      data_status=p_data_status,
      updated_at=v_now
    where id=e.id;

    insert into public.paper_evaluation_marks(
      evaluation_id,user_id,equity_usd,cash_usd,open_value_usd,peak_equity_usd,trailing_floor_usd,
      daily_loss_usd,current_drawdown_pct,source,data_status,marked_at
    ) values(
      e.id,p_user_id,e.last_equity_usd,e.last_cash_usd,e.last_open_value_usd,e.peak_equity_usd,e.trailing_floor_usd,
      e.daily_loss_usd,e.current_drawdown_pct,p_source,p_data_status,v_now
    );

    if v_status='expired' then
      insert into public.paper_evaluation_events(evaluation_id,user_id,event_type,details)
      values(e.id,p_user_id,'evaluation_expired',jsonb_build_object(
        'reason','30_day_window_expired','data_status',p_data_status,'trusted_equity_usd',e.last_equity_usd
      ));
    end if;

    return jsonb_build_object(
      'active',v_status='active','id',e.id,'attempt_no',e.attempt_no,'status',v_status,
      'equity_usd',e.last_equity_usd,'cash_usd',e.last_cash_usd,'open_value_usd',e.last_open_value_usd,
      'peak_equity_usd',e.peak_equity_usd,'trailing_floor_usd',e.trailing_floor_usd,
      'current_drawdown_pct',e.current_drawdown_pct,'daily_loss_usd',e.daily_loss_usd,
      'daily_loss_limit_usd',e.max_daily_loss_usd,'trades_count',e.trades_count,
      'min_trades',e.min_trades,'pass_equity_usd',e.pass_equity_usd,'profit_target_usd',e.profit_target_usd,
      'starts_at',e.starts_at,'expires_at',e.expires_at,
      'cooldown_until',case when v_status='expired' then v_now+interval '24 hours' else e.cooldown_until end,
      'failure_reason',v_reason,'data_status',p_data_status,'source',p_source,
      'funded_activation_enabled',(select real_funded_activation from public.paper_platform_flags where id=true)
    );
  end if;

  if p_equity_usd is null or p_equity_usd<0 or p_cash_usd is null or p_cash_usd<0 or p_open_value_usd is null or p_open_value_usd<0 then
    raise exception 'invalid evaluation mark';
  end if;

  select count(*)::int into v_trades from public.paper_trades where evaluation_id=e.id;
  v_peak:=greatest(e.peak_equity_usd,p_equity_usd);
  v_floor:=v_peak*(1-e.trailing_drawdown_pct/100.0);
  v_anchor:=case when e.daily_anchor_date=v_utc_date then e.daily_anchor_equity_usd else p_equity_usd end;
  v_daily_loss:=greatest(v_anchor-p_equity_usd,0);
  v_drawdown_pct:=case when v_peak>0 then greatest((v_peak-p_equity_usd)/v_peak*100,0) else 0 end;
  v_status:='active';

  if v_now>=e.expires_at then
    v_status:='expired'; v_reason:='30_day_window_expired';
  elsif p_equity_usd<=v_floor then
    v_status:='failed'; v_reason:='trailing_drawdown_breach';
  elsif v_daily_loss>=e.max_daily_loss_usd then
    v_status:='failed'; v_reason:='daily_loss_breach';
  elsif p_equity_usd>=e.pass_equity_usd and v_trades>=e.min_trades then
    v_status:='passed';
  end if;

  update public.paper_evaluations set
    status=v_status,
    peak_equity_usd=v_peak,
    trailing_floor_usd=v_floor,
    last_equity_usd=p_equity_usd,
    last_cash_usd=p_cash_usd,
    last_open_value_usd=p_open_value_usd,
    daily_anchor_date=v_utc_date,
    daily_anchor_equity_usd=v_anchor,
    daily_loss_usd=v_daily_loss,
    current_drawdown_pct=v_drawdown_pct,
    trades_count=v_trades,
    failure_reason=v_reason,
    passed_at=case when v_status='passed' then coalesce(passed_at,v_now) else passed_at end,
    ended_at=case when v_status<>'active' then coalesce(ended_at,v_now) else ended_at end,
    cooldown_until=case when v_status in ('failed','expired') then v_now+interval '24 hours' else cooldown_until end,
    last_mark_at=v_now,
    last_mark_source=p_source,
    data_status='LIVE',
    updated_at=v_now
  where id=e.id;

  insert into public.paper_evaluation_marks(
    evaluation_id,user_id,equity_usd,cash_usd,open_value_usd,peak_equity_usd,trailing_floor_usd,
    daily_loss_usd,current_drawdown_pct,source,data_status,marked_at
  ) values(e.id,p_user_id,p_equity_usd,p_cash_usd,p_open_value_usd,v_peak,v_floor,v_daily_loss,v_drawdown_pct,p_source,'LIVE',v_now);

  if v_status<>'active' and e.status='active' then
    insert into public.paper_evaluation_events(evaluation_id,user_id,event_type,details)
    values(e.id,p_user_id,'evaluation_'||v_status,jsonb_build_object(
      'equity_usd',p_equity_usd,'reason',v_reason,'trades_count',v_trades
    ));
  end if;

  if v_status='passed' then
    insert into public.paper_funded_profiles(user_id,stage,kyc_status,updated_at)
    values(p_user_id,'kyc_required','required',v_now)
    on conflict(user_id) do update set stage='kyc_required',kyc_status='required',updated_at=v_now;

    if not exists(
      select 1 from public.paper_funded_applications
      where user_id=p_user_id and status in ('kyc_required','kyc_pending','approved','active')
    ) then
      insert into public.paper_funded_applications(user_id,status,qualification_snapshot,applied_at,updated_at)
      values(p_user_id,'kyc_required',jsonb_build_object(
        'evaluation_id',e.id,'attempt_no',e.attempt_no,'passed_equity_usd',p_equity_usd,
        'peak_equity_usd',v_peak,'trades_count',v_trades,'passed_at',v_now,
        'rules',jsonb_build_object(
          'start',1000,'profit_target',5000,'trailing_drawdown_pct',10,
          'daily_loss_usd',50,'max_position_pct',25,'max_open_positions',5
        )
      ),v_now,v_now)
      returning id into v_app_id;
    end if;
  end if;

  return jsonb_build_object(
    'active',v_status='active','id',e.id,'attempt_no',e.attempt_no,'status',v_status,
    'equity_usd',round(p_equity_usd,8),'cash_usd',round(p_cash_usd,8),
    'open_value_usd',round(p_open_value_usd,8),'peak_equity_usd',round(v_peak,8),
    'trailing_floor_usd',round(v_floor,8),'current_drawdown_pct',round(v_drawdown_pct,4),
    'daily_loss_usd',round(v_daily_loss,8),'daily_loss_limit_usd',e.max_daily_loss_usd,
    'trades_count',v_trades,'min_trades',e.min_trades,'pass_equity_usd',e.pass_equity_usd,
    'profit_target_usd',e.profit_target_usd,'starts_at',e.starts_at,'expires_at',e.expires_at,
    'cooldown_until',case when v_status in ('failed','expired') then v_now+interval '24 hours' else e.cooldown_until end,
    'failure_reason',v_reason,'data_status','LIVE','source',p_source,
    'funded_activation_enabled',(select real_funded_activation from public.paper_platform_flags where id=true)
  );
end;
$$;
revoke all on function public.paper_record_evaluation_mark_v1(uuid,numeric,numeric,numeric,text,text)
  from public,anon,authenticated;
grant execute on function public.paper_record_evaluation_mark_v1(uuid,numeric,numeric,numeric,text,text)
  to service_role;

create or replace function paper_private.invoke_evaluation_monitor()
returns bigint
language plpgsql
security definer
set search_path=paper_private,public,net,pg_temp
as $$
declare
  cfg paper_private.runtime_config%rowtype;
  tok text;
  req_id bigint;
begin
  select * into cfg from paper_private.runtime_config where id=true;
  if not coalesce(cfg.monitor_enabled,false) or cfg.project_url is null then return null; end if;
  select internal_monitor_token into tok from paper_private.runtime_secrets where id=true;

  select net.http_post(
    url:=rtrim(cfg.project_url,'/')||'/functions/v1/evaluation-monitor',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-paper-internal-token',tok
    ),
    body:='{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds:=20000
  ) into req_id;
  return req_id;
end;
$$;
revoke all on function paper_private.invoke_evaluation_monitor() from public,anon,authenticated;
grant execute on function paper_private.invoke_evaluation_monitor() to service_role;

do $$
declare existing_id bigint;
begin
  select jobid into existing_id from cron.job where jobname='paper-evaluation-monitor-v1';
  if existing_id is not null then perform cron.unschedule(existing_id); end if;
  perform cron.schedule(
    'paper-evaluation-monitor-v1',
    '30 seconds',
    'select paper_private.invoke_evaluation_monitor();'
  );
end $$;
