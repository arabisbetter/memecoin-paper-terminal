-- PAPER Part 3: control plane, waitlist/scaling, social v1 and leaderboards.
-- Real funded activation, custody signing and payouts stay disabled by platform flags.

create table if not exists public.paper_control_plane (
  id boolean primary key default true check (id),
  emergency_pause boolean not null default false,
  paper_trading_enabled boolean not null default true,
  evaluation_entries_enabled boolean not null default true,
  funded_waitlist_enabled boolean not null default true,
  social_enabled boolean not null default true,
  risk_engine_enabled boolean not null default true,
  maintenance_message text,
  updated_at timestamptz not null default now()
);
insert into public.paper_control_plane(id) values(true) on conflict(id) do nothing;
alter table public.paper_control_plane enable row level security;
drop policy if exists paper_control_plane_read on public.paper_control_plane;
create policy paper_control_plane_read on public.paper_control_plane
  for select to authenticated using (true);
revoke all on public.paper_control_plane from public,anon,authenticated;
grant select on public.paper_control_plane to authenticated;

create table if not exists public.paper_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','reviewer','ops','read_only')),
  enabled boolean not null default true,
  requires_strong_auth boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.paper_admin_users enable row level security;
revoke all on public.paper_admin_users from public,anon,authenticated;

create table if not exists public.paper_admin_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  action text not null,
  target_type text,
  target_id text,
  before_state jsonb,
  after_state jsonb,
  request_id text,
  created_at timestamptz not null default now()
);
alter table public.paper_admin_audit_log enable row level security;
create index if not exists paper_admin_audit_time_idx on public.paper_admin_audit_log(created_at desc);
revoke all on public.paper_admin_audit_log from public,anon,authenticated;

create table if not exists public.paper_admin_overrides (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid references auth.users(id) on delete set null,
  override_type text not null,
  reason text not null check (char_length(reason) between 8 and 1000),
  previous_value jsonb,
  new_value jsonb not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.paper_admin_overrides enable row level security;
create index if not exists paper_admin_overrides_target_idx on public.paper_admin_overrides(target_user_id,created_at desc);
revoke all on public.paper_admin_overrides from public,anon,authenticated;

create table if not exists public.paper_admin_action_approvals (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  target_id text not null,
  amount_usd numeric(20,8),
  requested_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','rejected','executed','expired')),
  details jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  executed_at timestamptz,
  unique(action_type,target_id,status)
);
alter table public.paper_admin_action_approvals enable row level security;
create index if not exists paper_admin_action_approvals_status_idx
  on public.paper_admin_action_approvals(status,requested_at desc);
revoke all on public.paper_admin_action_approvals from public,anon,authenticated;

create table if not exists public.paper_funded_waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  evaluation_id uuid references public.paper_evaluations(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','eligible','held','activated','cancelled')),
  priority integer not null default 0,
  qualified_at timestamptz not null default now(),
  eligibility_checked_at timestamptz,
  hold_reason text,
  activated_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.paper_funded_waitlist enable row level security;
create index if not exists paper_funded_waitlist_queue_idx
  on public.paper_funded_waitlist(status,priority desc,qualified_at asc);
drop policy if exists paper_funded_waitlist_read_own on public.paper_funded_waitlist;
create policy paper_funded_waitlist_read_own on public.paper_funded_waitlist
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.paper_funded_waitlist from public,anon,authenticated;
grant select on public.paper_funded_waitlist to authenticated;

create table if not exists public.paper_funded_scale_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  scale_level integer not null default 0 check (scale_level between 0 and 4),
  capital_usd numeric(20,8) not null default 1000,
  consecutive_profitable_cycles integer not null default 0 check (consecutive_profitable_cycles >= 0),
  profitable_cycles_total integer not null default 0 check (profitable_cycles_total >= 0),
  last_cycle_profitable boolean,
  last_cycle_at timestamptz,
  next_capital_usd numeric(20,8) not null default 2500,
  updated_at timestamptz not null default now()
);
alter table public.paper_funded_scale_state enable row level security;
drop policy if exists paper_funded_scale_read_own on public.paper_funded_scale_state;
create policy paper_funded_scale_read_own on public.paper_funded_scale_state
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.paper_funded_scale_state from public,anon,authenticated;
grant select on public.paper_funded_scale_state to authenticated;

create or replace function public.paper_apply_scale_cycle_v1(p_user_id uuid,p_profitable boolean)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  s public.paper_funded_scale_state%rowtype;
  levels numeric[]:=array[1000,2500,5000,10000,25000];
  next_level integer;
  next_consecutive integer;
  new_capital numeric;
  new_next numeric;
begin
  insert into public.paper_funded_scale_state(user_id)
  values(p_user_id) on conflict(user_id) do nothing;

  select * into s from public.paper_funded_scale_state where user_id=p_user_id for update;
  if s.user_id is null then raise exception 'scale state not found'; end if;

  next_consecutive:=case when p_profitable then s.consecutive_profitable_cycles+1 else 0 end;
  next_level:=s.scale_level;

  if p_profitable and next_consecutive>=2 and s.scale_level<4 then
    next_level:=s.scale_level+1;
    next_consecutive:=0;
  end if;

  new_capital:=levels[next_level+1];
  new_next:=levels[least(next_level+2,5)];

  update public.paper_funded_scale_state set
    scale_level=next_level,
    capital_usd=new_capital,
    next_capital_usd=new_next,
    consecutive_profitable_cycles=next_consecutive,
    profitable_cycles_total=profitable_cycles_total+case when p_profitable then 1 else 0 end,
    last_cycle_profitable=p_profitable,
    last_cycle_at=now(),
    updated_at=now()
  where user_id=p_user_id
  returning * into s;

  return jsonb_build_object(
    'user_id',s.user_id,'scale_level',s.scale_level,'capital_usd',s.capital_usd,
    'consecutive_profitable_cycles',s.consecutive_profitable_cycles,
    'profitable_cycles_total',s.profitable_cycles_total,'next_capital_usd',s.next_capital_usd
  );
end;
$$;
revoke all on function public.paper_apply_scale_cycle_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function public.paper_apply_scale_cycle_v1(uuid,boolean) to service_role;

create table if not exists public.paper_profile_visibility (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  public_profile boolean not null default true,
  leaderboard_opt_out boolean not null default false,
  activity_public boolean not null default true,
  share_pnl boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.paper_profile_visibility(user_id)
select id from public.profiles on conflict(user_id) do nothing;
alter table public.paper_profile_visibility enable row level security;
drop policy if exists paper_profile_visibility_read on public.paper_profile_visibility;
create policy paper_profile_visibility_read on public.paper_profile_visibility
  for select to authenticated
  using (public_profile or (select auth.uid())=user_id);
drop policy if exists paper_profile_visibility_insert_own on public.paper_profile_visibility;
create policy paper_profile_visibility_insert_own on public.paper_profile_visibility
  for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists paper_profile_visibility_update_own on public.paper_profile_visibility;
create policy paper_profile_visibility_update_own on public.paper_profile_visibility
  for update to authenticated
  using ((select auth.uid())=user_id)
  with check ((select auth.uid())=user_id);
revoke all on public.paper_profile_visibility from public,anon,authenticated;
grant select,insert,update on public.paper_profile_visibility to authenticated;

create or replace view public.paper_public_profiles with (security_invoker=true) as
select p.id,p.username,p.display_name,p.bio,p.x_handle,p.avatar_url,p.avatar_emoji,p.accent,p.created_at
from public.profiles p
join public.paper_profile_visibility v on v.user_id=p.id
where v.public_profile or (select auth.uid())=p.id;
revoke all on public.paper_public_profiles from public,anon,authenticated;
grant select on public.paper_public_profiles to authenticated;

create or replace function public.paper_profile_visibility_bootstrap()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.paper_profile_visibility(user_id) values(new.id) on conflict(user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.paper_profile_visibility_bootstrap() from public,anon,authenticated;

drop trigger if exists trg_paper_profile_visibility_bootstrap on public.profiles;
create trigger trg_paper_profile_visibility_bootstrap
after insert on public.profiles for each row execute function public.paper_profile_visibility_bootstrap();

create table if not exists public.paper_social_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id,following_id),
  check (follower_id<>following_id)
);
alter table public.paper_social_follows enable row level security;
drop policy if exists social_follows_read on public.paper_social_follows;
create policy social_follows_read on public.paper_social_follows for select to authenticated using (true);
drop policy if exists social_follows_insert_own on public.paper_social_follows;
create policy social_follows_insert_own on public.paper_social_follows
  for insert to authenticated with check ((select auth.uid())=follower_id);
drop policy if exists social_follows_delete_own on public.paper_social_follows;
create policy social_follows_delete_own on public.paper_social_follows
  for delete to authenticated using ((select auth.uid())=follower_id);
revoke all on public.paper_social_follows from public,anon,authenticated;
grant select,insert,delete on public.paper_social_follows to authenticated;
create index if not exists paper_social_follows_following_idx
  on public.paper_social_follows(following_id,created_at desc);

create table if not exists public.paper_activity_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('evaluation_started','evaluation_passed','evaluation_failed','evaluation_expired','paper_trade','follow')),
  token_address text,
  token_symbol text,
  trade_id uuid references public.paper_trades(id) on delete set null,
  evaluation_id uuid references public.paper_evaluations(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.paper_activity_events enable row level security;
create index if not exists paper_activity_user_time_idx on public.paper_activity_events(user_id,created_at desc);
drop policy if exists paper_activity_read_public on public.paper_activity_events;
create policy paper_activity_read_public on public.paper_activity_events
  for select to authenticated
  using (
    (select auth.uid())=user_id
    or exists(
      select 1 from public.paper_profile_visibility v
      where v.user_id=paper_activity_events.user_id and v.public_profile and v.activity_public
    )
  );
revoke all on public.paper_activity_events from public,anon,authenticated;
grant select on public.paper_activity_events to authenticated;

create table if not exists public.paper_trade_cards (
  trade_id uuid primary key references public.paper_trades(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_address text not null,
  token_symbol text,
  action text not null,
  notional_usd numeric(20,8),
  simulated_fill_price_usd numeric(30,16),
  fee_usd numeric(20,8),
  realized_pnl_usd numeric(20,8),
  execution_quality text,
  verified boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.paper_trade_cards enable row level security;
create index if not exists paper_trade_cards_user_time_idx on public.paper_trade_cards(user_id,created_at desc);
drop policy if exists paper_trade_cards_read_public on public.paper_trade_cards;
create policy paper_trade_cards_read_public on public.paper_trade_cards
  for select to authenticated
  using (
    (select auth.uid())=user_id
    or exists(
      select 1 from public.paper_profile_visibility v
      where v.user_id=paper_trade_cards.user_id and v.public_profile and v.share_pnl
    )
  );
revoke all on public.paper_trade_cards from public,anon,authenticated;
grant select on public.paper_trade_cards to authenticated;

create or replace function public.paper_social_trade_event_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  mint text;
  sym text;
begin
  select mint_address,ticker into mint,sym from public.tokens where id=new.token_id;

  insert into public.paper_trade_cards(
    trade_id,user_id,token_address,token_symbol,action,notional_usd,simulated_fill_price_usd,
    fee_usd,realized_pnl_usd,execution_quality,verified,created_at
  ) values(
    new.id,new.user_id,coalesce(mint,''),sym,new.action,new.notional_usd,new.simulated_fill_price_usd,
    new.fee_usd,null,new.execution_quality,true,coalesce(new.ts,now())
  ) on conflict(trade_id) do nothing;

  insert into public.paper_activity_events(user_id,event_type,token_address,token_symbol,trade_id,payload,created_at)
  values(
    new.user_id,'paper_trade',mint,sym,new.id,
    jsonb_build_object('action',new.action,'notional_usd',new.notional_usd,'paper',true),
    coalesce(new.ts,now())
  );
  return new;
end;
$$;
revoke all on function public.paper_social_trade_event_v1() from public,anon,authenticated;

drop trigger if exists trg_paper_social_trade_event on public.paper_trades;
create trigger trg_paper_social_trade_event
after insert on public.paper_trades for each row execute function public.paper_social_trade_event_v1();

insert into public.paper_trade_cards(
  trade_id,user_id,token_address,token_symbol,action,notional_usd,simulated_fill_price_usd,
  fee_usd,realized_pnl_usd,execution_quality,verified,created_at
)
select t.id,t.user_id,coalesce(k.mint_address,''),k.ticker,t.action,t.notional_usd,t.simulated_fill_price_usd,
       t.fee_usd,p.realized_pnl_usd,t.execution_quality,true,t.ts
from public.paper_trades t
join public.tokens k on k.id=t.token_id
left join public.paper_positions p on p.id=t.position_id
where coalesce(t.accounting_version,'')='usd_v2'
on conflict(trade_id) do nothing;

create or replace function public.paper_evaluation_activity_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if tg_op='INSERT' then
    insert into public.paper_activity_events(user_id,event_type,evaluation_id,payload,created_at)
    values(new.user_id,'evaluation_started',new.id,jsonb_build_object('attempt_no',new.attempt_no),new.starts_at);
  elsif old.status is distinct from new.status and new.status in ('passed','failed','expired') then
    insert into public.paper_activity_events(user_id,event_type,evaluation_id,payload,created_at)
    values(
      new.user_id,'evaluation_'||new.status,new.id,
      jsonb_build_object('attempt_no',new.attempt_no,'equity_usd',new.last_equity_usd,'reason',new.failure_reason),
      coalesce(new.ended_at,now())
    );
    if new.status='passed' then
      insert into public.paper_funded_waitlist(user_id,evaluation_id,status,qualified_at,updated_at)
      values(new.user_id,new.id,'queued',coalesce(new.passed_at,now()),now())
      on conflict(user_id) do update set
        evaluation_id=excluded.evaluation_id,
        status=case when public.paper_funded_waitlist.status='activated' then 'activated' else 'queued' end,
        qualified_at=excluded.qualified_at,
        updated_at=now();

      insert into public.paper_funded_scale_state(user_id) values(new.user_id)
      on conflict(user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.paper_evaluation_activity_v1() from public,anon,authenticated;

drop trigger if exists trg_paper_evaluation_activity_insert on public.paper_evaluations;
create trigger trg_paper_evaluation_activity_insert
after insert on public.paper_evaluations for each row execute function public.paper_evaluation_activity_v1();
drop trigger if exists trg_paper_evaluation_activity_update on public.paper_evaluations;
create trigger trg_paper_evaluation_activity_update
after update of status on public.paper_evaluations for each row execute function public.paper_evaluation_activity_v1();

insert into public.paper_funded_waitlist(user_id,evaluation_id,status,qualified_at,updated_at)
select e.user_id,e.id,'queued',coalesce(e.passed_at,e.ended_at,e.updated_at),now()
from public.paper_evaluations e where e.status='passed'
on conflict(user_id) do nothing;
insert into public.paper_funded_scale_state(user_id)
select user_id from public.paper_funded_waitlist on conflict(user_id) do nothing;

create table if not exists public.paper_leaderboard_v2 (
  period_key text not null check (period_key in ('weekly','all_time')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  evaluation_status text,
  evaluation_pnl_usd numeric(20,8) not null default 0,
  evaluation_roi_pct numeric(12,4) not null default 0,
  win_rate_pct numeric(12,4) not null default 0,
  trades_count integer not null default 0,
  funded_pnl_usd numeric(20,8) not null default 0,
  funded_capital_usd numeric(20,8) not null default 0,
  captured_at timestamptz not null default now(),
  primary key(period_key,user_id)
);
alter table public.paper_leaderboard_v2 enable row level security;
drop policy if exists paper_leaderboard_v2_read on public.paper_leaderboard_v2;
create policy paper_leaderboard_v2_read on public.paper_leaderboard_v2
  for select to authenticated
  using (
    (select auth.uid())=user_id
    or not coalesce((select leaderboard_opt_out from public.paper_profile_visibility v where v.user_id=paper_leaderboard_v2.user_id),false)
  );
revoke all on public.paper_leaderboard_v2 from public,anon,authenticated;
grant select on public.paper_leaderboard_v2 to authenticated;

create or replace function public.paper_refresh_leaderboards_v2()
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.paper_leaderboard_v2(
    period_key,user_id,evaluation_status,evaluation_pnl_usd,evaluation_roi_pct,
    win_rate_pct,trades_count,funded_pnl_usd,funded_capital_usd,captured_at
  )
  select
    'all_time',
    p.id,
    e.status,
    coalesce(e.last_equity_usd-e.starting_balance_usd,0),
    case when coalesce(e.starting_balance_usd,0)>0
      then (e.last_equity_usd/e.starting_balance_usd-1)*100 else 0 end,
    case when coalesce(c.closed_count,0)>0 then c.wins::numeric/c.closed_count*100 else 0 end,
    coalesce(t.trade_count,0),
    coalesce(f.current_equity_usd-f.capital_usd,0),
    coalesce(f.capital_usd,0),
    now()
  from public.profiles p
  left join lateral (
    select * from public.paper_evaluations x where x.user_id=p.id order by x.attempt_no desc limit 1
  ) e on true
  left join lateral (
    select count(*)::int trade_count from public.paper_trades x
    where x.user_id=p.id and coalesce(x.accounting_version,'')='usd_v2'
  ) t on true
  left join lateral (
    select count(*)::int closed_count,
           count(*) filter (where coalesce(realized_pnl_usd,0)>0)::int wins
    from public.paper_positions x where x.user_id=p.id and x.status='closed' and coalesce(x.accounting_version,'')='usd_v2'
  ) c on true
  left join public.paper_funded_accounts f on f.user_id=p.id
  on conflict(period_key,user_id) do update set
    evaluation_status=excluded.evaluation_status,
    evaluation_pnl_usd=excluded.evaluation_pnl_usd,
    evaluation_roi_pct=excluded.evaluation_roi_pct,
    win_rate_pct=excluded.win_rate_pct,
    trades_count=excluded.trades_count,
    funded_pnl_usd=excluded.funded_pnl_usd,
    funded_capital_usd=excluded.funded_capital_usd,
    captured_at=now();

  insert into public.paper_leaderboard_v2(
    period_key,user_id,evaluation_status,evaluation_pnl_usd,evaluation_roi_pct,
    win_rate_pct,trades_count,funded_pnl_usd,funded_capital_usd,captured_at
  )
  select
    'weekly',
    p.id,
    e.status,
    coalesce(e.last_equity_usd-e.starting_balance_usd,0),
    case when coalesce(e.starting_balance_usd,0)>0
      then (e.last_equity_usd/e.starting_balance_usd-1)*100 else 0 end,
    case when coalesce(c.closed_count,0)>0 then c.wins::numeric/c.closed_count*100 else 0 end,
    coalesce(t.trade_count,0),
    coalesce(f.current_equity_usd-f.capital_usd,0),
    coalesce(f.capital_usd,0),
    now()
  from public.profiles p
  left join lateral (
    select * from public.paper_evaluations x where x.user_id=p.id order by x.attempt_no desc limit 1
  ) e on true
  left join lateral (
    select count(*)::int trade_count from public.paper_trades x
    where x.user_id=p.id and coalesce(x.accounting_version,'')='usd_v2'
      and x.ts>=date_trunc('week',now())
  ) t on true
  left join lateral (
    select count(*)::int closed_count,
           count(*) filter (where coalesce(realized_pnl_usd,0)>0)::int wins
    from public.paper_positions x where x.user_id=p.id and x.status='closed'
      and coalesce(x.accounting_version,'')='usd_v2'
      and coalesce(x.closed_at,x.updated_at)>=date_trunc('week',now())
  ) c on true
  left join public.paper_funded_accounts f on f.user_id=p.id
  on conflict(period_key,user_id) do update set
    evaluation_status=excluded.evaluation_status,
    evaluation_pnl_usd=excluded.evaluation_pnl_usd,
    evaluation_roi_pct=excluded.evaluation_roi_pct,
    win_rate_pct=excluded.win_rate_pct,
    trades_count=excluded.trades_count,
    funded_pnl_usd=excluded.funded_pnl_usd,
    funded_capital_usd=excluded.funded_capital_usd,
    captured_at=now();
end;
$$;
revoke all on function public.paper_refresh_leaderboards_v2() from public,anon,authenticated;
grant execute on function public.paper_refresh_leaderboards_v2() to service_role;

create table if not exists public.paper_treasury_state (
  id boolean primary key default true check (id),
  total_capital_usd numeric(24,8) not null default 0 check (total_capital_usd>=0),
  deployed_capital_usd numeric(24,8) not null default 0 check (deployed_capital_usd>=0),
  reserve_capital_usd numeric(24,8) not null default 0 check (reserve_capital_usd>=0),
  cumulative_protocol_revenue_usd numeric(24,8) not null default 0,
  max_deploy_pct numeric(8,4) not null default 60 check (max_deploy_pct between 0 and 100),
  min_reserve_pct numeric(8,4) not null default 40 check (min_reserve_pct between 0 and 100),
  updated_at timestamptz not null default now(),
  check (total_capital_usd=0 or deployed_capital_usd<=total_capital_usd*(max_deploy_pct/100.0)),
  check (total_capital_usd=0 or reserve_capital_usd>=total_capital_usd*(min_reserve_pct/100.0))
);
insert into public.paper_treasury_state(id) values(true) on conflict(id) do nothing;
alter table public.paper_treasury_state enable row level security;
revoke all on public.paper_treasury_state from public,anon,authenticated;

create table if not exists public.paper_abuse_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  related_user_id uuid references auth.users(id) on delete cascade,
  signal_type text not null,
  severity text not null check (severity in ('soft','hard')),
  status text not null default 'open' check (status in ('open','reviewed','dismissed','frozen')),
  details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
alter table public.paper_abuse_signals enable row level security;
create index if not exists paper_abuse_signals_open_idx
  on public.paper_abuse_signals(status,severity,detected_at desc);
create unique index if not exists paper_abuse_signal_dedupe_idx
  on public.paper_abuse_signals(user_id,related_user_id,signal_type)
  where status in ('open','frozen');
revoke all on public.paper_abuse_signals from public,anon,authenticated;

create or replace function public.paper_scan_abuse_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  hard_count integer:=0;
  soft_count integer:=0;
  v_row_count integer:=0;
begin
  -- Same payout address across funded profiles is a hard signal. Auto-freeze funded stage.
  with dupes as (
    select payout_wallet_address, array_agg(user_id order by user_id) users
    from public.paper_funded_profiles
    where payout_wallet_address is not null
    group by payout_wallet_address having count(*)>1
  ), pairs as (
    select users[i] a,users[j] b,payout_wallet_address
    from dupes,generate_subscripts(users,1) i,generate_subscripts(users,1) j
    where i<j
  )
  insert into public.paper_abuse_signals(user_id,related_user_id,signal_type,severity,status,details)
  select a,b,'duplicate_payout_wallet','hard','frozen',jsonb_build_object('wallet',payout_wallet_address)
  from pairs
  on conflict(user_id,related_user_id,signal_type) where status in ('open','frozen') do nothing;

  get diagnostics hard_count=row_count;

  update public.paper_funded_profiles fp set stage='suspended',updated_at=now()
  where exists(
    select 1 from public.paper_abuse_signals s
    where s.signal_type='duplicate_payout_wallet' and s.status='frozen'
      and (s.user_id=fp.user_id or s.related_user_id=fp.user_id)
  );

  -- Shared IP/device are soft review signals, never automatic proof of abuse.
  insert into public.paper_abuse_signals(user_id,related_user_id,signal_type,severity,details)
  select least(a.user_id,b.user_id),greatest(a.user_id,b.user_id),'shared_device_or_ip','soft',
         jsonb_build_object('shared_ip',a.created_ip is not null and a.created_ip=b.created_ip,
                            'shared_device',a.device_fingerprint_hash is not null and a.device_fingerprint_hash=b.device_fingerprint_hash,
                            'heuristic',true)
  from public.account_security a
  join public.account_security b on a.user_id<b.user_id
   and (
     (a.created_ip is not null and a.created_ip=b.created_ip)
     or (a.device_fingerprint_hash is not null and a.device_fingerprint_hash=b.device_fingerprint_hash)
   )
  on conflict(user_id,related_user_id,signal_type) where status in ('open','frozen') do nothing;

  get diagnostics soft_count=row_count;

  -- Repetitive same-token activity is a soft wash-trading review signal only.
  insert into public.paper_abuse_signals(user_id,signal_type,severity,details)
  select t.user_id,'repetitive_same_token_activity','soft',
         jsonb_build_object('token_id',t.token_id,'trades_last_hour',count(*),'heuristic',true)
  from public.paper_trades t
  where t.ts>=now()-interval '1 hour'
  group by t.user_id,t.token_id
  having count(*)>=20
  on conflict(user_id,related_user_id,signal_type) where status in ('open','frozen') do nothing;

  get diagnostics v_row_count=row_count;
  soft_count:=soft_count+v_row_count;

  return jsonb_build_object('hard_signals_added',hard_count,'soft_signals_added',soft_count);
end;
$$;
revoke all on function public.paper_scan_abuse_v1() from public,anon,authenticated;
grant execute on function public.paper_scan_abuse_v1() to service_role;

-- Product scope: posts/calls/comments/copy-trading are deferred. If legacy social
-- tables exist, remove direct client mutation until a later reviewed release.
do $$
begin
  if to_regclass('public.paper_social_posts') is not null then
    execute 'revoke insert,update,delete on public.paper_social_posts from anon,authenticated';
  end if;
  if to_regclass('public.paper_social_comments') is not null then
    execute 'revoke insert,update,delete on public.paper_social_comments from anon,authenticated';
  end if;
  if to_regclass('public.paper_social_likes') is not null then
    execute 'revoke insert,update,delete on public.paper_social_likes from anon,authenticated';
  end if;
end $$;

-- Cover Part 3 foreign-key access paths used by admin and social queries.
create index if not exists paper_abuse_related_user_idx on public.paper_abuse_signals(related_user_id) where related_user_id is not null;
create index if not exists paper_abuse_reviewed_by_idx on public.paper_abuse_signals(reviewed_by) where reviewed_by is not null;
create index if not exists paper_activity_evaluation_idx on public.paper_activity_events(evaluation_id) where evaluation_id is not null;
create index if not exists paper_activity_trade_idx on public.paper_activity_events(trade_id) where trade_id is not null;
create index if not exists paper_admin_approvals_requested_idx on public.paper_admin_action_approvals(requested_by,requested_at desc);
create index if not exists paper_admin_approvals_approved_idx on public.paper_admin_action_approvals(approved_by) where approved_by is not null;
create index if not exists paper_admin_audit_actor_idx on public.paper_admin_audit_log(actor_user_id,created_at desc) where actor_user_id is not null;
create index if not exists paper_admin_overrides_actor_idx on public.paper_admin_overrides(actor_user_id,created_at desc);
create index if not exists paper_funded_waitlist_evaluation_idx on public.paper_funded_waitlist(evaluation_id) where evaluation_id is not null;
create index if not exists paper_leaderboard_v2_user_idx on public.paper_leaderboard_v2(user_id,captured_at desc);

select public.paper_refresh_leaderboards_v2();
