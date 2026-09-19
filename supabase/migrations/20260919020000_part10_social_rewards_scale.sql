-- PAPER Part 10: community, multi-period leaderboards, persisted badges.
-- PAPER-only. No funded activation or real-wallet trading changes.

create table if not exists public.paper_social_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  token_address text,
  token_symbol text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='paper_social_posts_body_len_check'
      and conrelid='public.paper_social_posts'::regclass
  ) then
    alter table public.paper_social_posts
      add constraint paper_social_posts_body_len_check
      check (char_length(body) between 1 and 280);
  end if;
end $$;

alter table public.paper_social_posts enable row level security;
drop policy if exists social_posts_read on public.paper_social_posts;
drop policy if exists social_posts_insert_own on public.paper_social_posts;
drop policy if exists social_posts_update_own on public.paper_social_posts;
create policy social_posts_read on public.paper_social_posts
for select to authenticated
using (
  deleted_at is null and (
    (select auth.uid())=user_id
    or exists(
      select 1 from public.paper_profile_visibility v
      where v.user_id=paper_social_posts.user_id
        and v.public_profile
        and v.activity_public
    )
  )
);
create policy social_posts_insert_own on public.paper_social_posts
for insert to authenticated
with check ((select auth.uid())=user_id and deleted_at is null);
create policy social_posts_update_own on public.paper_social_posts
for update to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);
revoke all on public.paper_social_posts from public,anon,authenticated;
grant select,insert,update on public.paper_social_posts to authenticated;
create index if not exists paper_social_posts_time_idx
  on public.paper_social_posts(created_at desc) where deleted_at is null;
create index if not exists paper_social_posts_user_time_idx
  on public.paper_social_posts(user_id,created_at desc) where deleted_at is null;

create or replace function public.paper_social_post_guard_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  recent_count integer:=0;
begin
  new.body:=btrim(new.body);
  if char_length(new.body)<1 or char_length(new.body)>280 then
    raise exception 'Post must be between 1 and 280 characters.';
  end if;
  if new.body ~* '(nigg|fagg|kike|spic|chink|wetback|tranny|retard)' then
    raise exception 'Post violates PAPER community text rules.';
  end if;
  if tg_op='INSERT' then
    select count(*)::int into recent_count
    from public.paper_social_posts p
    where p.user_id=new.user_id
      and p.created_at>=now()-interval '60 seconds';
    if recent_count>=5 then
      raise exception 'Post rate limit exceeded. Try again shortly.';
    end if;
  end if;
  new.updated_at:=now();
  return new;
end;
$$;
revoke all on function public.paper_social_post_guard_v1() from public,anon,authenticated;
drop trigger if exists trg_paper_social_post_guard on public.paper_social_posts;
create trigger trg_paper_social_post_guard
before insert or update of body on public.paper_social_posts
for each row execute function public.paper_social_post_guard_v1();

create table if not exists public.paper_social_likes (
  post_id uuid not null references public.paper_social_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);
alter table public.paper_social_likes enable row level security;
drop policy if exists social_likes_read on public.paper_social_likes;
drop policy if exists social_likes_insert_own on public.paper_social_likes;
drop policy if exists social_likes_delete_own on public.paper_social_likes;
create policy social_likes_read on public.paper_social_likes
for select to authenticated using (true);
create policy social_likes_insert_own on public.paper_social_likes
for insert to authenticated with check ((select auth.uid())=user_id);
create policy social_likes_delete_own on public.paper_social_likes
for delete to authenticated using ((select auth.uid())=user_id);
revoke all on public.paper_social_likes from public,anon,authenticated;
grant select,insert,delete on public.paper_social_likes to authenticated;
create index if not exists paper_social_likes_user_idx
  on public.paper_social_likes(user_id,created_at desc);

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at timestamptz not null default now()
);
alter table public.moderation_reports
  add column if not exists reported_post_id uuid references public.paper_social_posts(id) on delete set null,
  add column if not exists report_kind text not null default 'profile';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='moderation_reports_kind_check'
      and conrelid='public.moderation_reports'::regclass
  ) then
    alter table public.moderation_reports
      add constraint moderation_reports_kind_check
      check (report_kind in ('profile','post'));
  end if;
end $$;

alter table public.moderation_reports enable row level security;
drop policy if exists moderation_reports_insert_own on public.moderation_reports;
create policy moderation_reports_insert_own on public.moderation_reports
for insert to authenticated
with check (
  (select auth.uid())=reporter_user_id
  and reporter_user_id<>reported_user_id
);
revoke all on public.moderation_reports from public,anon,authenticated;
grant insert on public.moderation_reports to authenticated;
create index if not exists moderation_reports_reported_post_idx
  on public.moderation_reports(reported_post_id) where reported_post_id is not null;
create index if not exists moderation_reports_reported_user_idx
  on public.moderation_reports(reported_user_id,created_at desc);
create index if not exists moderation_reports_reporter_user_idx
  on public.moderation_reports(reporter_user_id,created_at desc);

create or replace function public.paper_social_follow_event_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.paper_activity_events(user_id,event_type,payload,created_at)
  values(
    new.follower_id,'follow',
    jsonb_build_object('following_id',new.following_id),
    coalesce(new.created_at,now())
  );
  return new;
end;
$$;
revoke all on function public.paper_social_follow_event_v1() from public,anon,authenticated;
drop trigger if exists trg_paper_social_follow_event on public.paper_social_follows;
create trigger trg_paper_social_follow_event
after insert on public.paper_social_follows
for each row execute function public.paper_social_follow_event_v1();

create table if not exists public.paper_leaderboard_periods (
  period_key text not null check (period_key in ('daily','weekly','monthly','all_time')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  realized_pnl_usd numeric(20,8) not null default 0,
  roi_pct numeric(12,4) not null default 0,
  win_rate_pct numeric(12,4) not null default 0,
  trades_count integer not null default 0,
  closed_count integer not null default 0,
  max_drawdown_pct numeric(12,4) not null default 0,
  consistency_score numeric(12,4) not null default 0,
  captured_at timestamptz not null default now(),
  primary key(period_key,user_id)
);
alter table public.paper_leaderboard_periods enable row level security;
drop policy if exists paper_leaderboard_periods_read on public.paper_leaderboard_periods;
create policy paper_leaderboard_periods_read on public.paper_leaderboard_periods
for select to authenticated
using (
  (select auth.uid())=user_id
  or not coalesce((
    select v.leaderboard_opt_out
    from public.paper_profile_visibility v
    where v.user_id=paper_leaderboard_periods.user_id
  ),false)
);
revoke all on public.paper_leaderboard_periods from public,anon,authenticated;
grant select on public.paper_leaderboard_periods to authenticated;
create index if not exists paper_leaderboard_periods_score_idx
  on public.paper_leaderboard_periods(period_key,consistency_score desc,captured_at desc);
create index if not exists paper_leaderboard_periods_user_idx
  on public.paper_leaderboard_periods(user_id,captured_at desc);

create or replace function public.paper_refresh_leaderboard_periods_user_v1(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.paper_leaderboard_periods(
    period_key,user_id,realized_pnl_usd,roi_pct,win_rate_pct,trades_count,
    closed_count,max_drawdown_pct,consistency_score,captured_at
  )
  with periods(period_key,start_at) as (
    values
      ('daily'::text,date_trunc('day',now())),
      ('weekly'::text,date_trunc('week',now())),
      ('monthly'::text,date_trunc('month',now())),
      ('all_time'::text,null::timestamptz)
  )
  select
    p.period_key,p_user_id,
    coalesce(pos.realized,0),
    coalesce(pos.realized,0)/10.0,
    case when coalesce(pos.closed_count,0)>0
      then pos.wins::numeric/pos.closed_count*100 else 0 end,
    coalesce(tr.trade_count,0),
    coalesce(pos.closed_count,0),
    coalesce(dd.max_drawdown,0),
    greatest(0,least(100,
      (case when coalesce(pos.closed_count,0)>0
        then pos.wins::numeric/pos.closed_count*100 else 0 end)
      - coalesce(dd.max_drawdown,0)*1.5
      + least(coalesce(tr.trade_count,0),20)
    )),
    now()
  from periods p
  left join lateral (
    select count(*)::int trade_count
    from public.paper_trades t
    where t.user_id=p_user_id
      and coalesce(t.accounting_version,'')='usd_v2'
      and (p.start_at is null or t.ts>=p.start_at)
  ) tr on true
  left join lateral (
    select
      count(*)::int closed_count,
      count(*) filter(where coalesce(x.realized_pnl_usd,0)>0)::int wins,
      coalesce(sum(x.realized_pnl_usd),0) realized
    from public.paper_positions x
    where x.user_id=p_user_id
      and x.status='closed'
      and coalesce(x.accounting_version,'')='usd_v2'
      and (p.start_at is null or coalesce(x.closed_at,x.updated_at)>=p.start_at)
  ) pos on true
  left join lateral (
    select coalesce(max(
      case when peak>0 then (peak-equity_usd)/peak*100 else 0 end
    ),0) max_drawdown
    from (
      select
        s.equity_usd,
        max(s.equity_usd) over(
          order by s.created_at rows between unbounded preceding and current row
        ) peak
      from public.portfolio_snapshots s
      where s.user_id=p_user_id
        and (p.start_at is null or s.created_at>=p.start_at)
    ) z
  ) dd on true
  on conflict(period_key,user_id) do update set
    realized_pnl_usd=excluded.realized_pnl_usd,
    roi_pct=excluded.roi_pct,
    win_rate_pct=excluded.win_rate_pct,
    trades_count=excluded.trades_count,
    closed_count=excluded.closed_count,
    max_drawdown_pct=excluded.max_drawdown_pct,
    consistency_score=excluded.consistency_score,
    captured_at=now();
end;
$$;
revoke all on function public.paper_refresh_leaderboard_periods_user_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.paper_refresh_leaderboard_periods_user_v1(uuid)
  to service_role;

create or replace function public.paper_refresh_leaderboard_periods_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  perform public.paper_refresh_leaderboard_periods_user_v1(new.user_id);
  return new;
end;
$$;
revoke all on function public.paper_refresh_leaderboard_periods_trigger_v1()
  from public,anon,authenticated;

drop trigger if exists trg_paper_leaderboard_trade_refresh on public.paper_trades;
create trigger trg_paper_leaderboard_trade_refresh
after insert on public.paper_trades
for each row execute function public.paper_refresh_leaderboard_periods_trigger_v1();

drop trigger if exists trg_paper_leaderboard_snapshot_refresh on public.portfolio_snapshots;
create trigger trg_paper_leaderboard_snapshot_refresh
after insert on public.portfolio_snapshots
for each row execute function public.paper_refresh_leaderboard_periods_trigger_v1();

create table if not exists public.paper_reward_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null,
  earned_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key(user_id,badge_key)
);
alter table public.paper_reward_badges enable row level security;
drop policy if exists paper_reward_badges_read on public.paper_reward_badges;
create policy paper_reward_badges_read on public.paper_reward_badges
for select to authenticated using (true);
revoke all on public.paper_reward_badges from public,anon,authenticated;
grant select on public.paper_reward_badges to authenticated;

create or replace function public.paper_refresh_reward_badges_user_v1(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  pts bigint:=0;
  fills bigint:=0;
begin
  select coalesce(points,0),coalesce(qualifying_trades,0)
  into pts,fills
  from public.paper_reward_totals
  where user_id=p_user_id;

  if fills>=1 then
    insert into public.paper_reward_badges(user_id,badge_key)
    values(p_user_id,'first_fill') on conflict do nothing;
  end if;
  if pts>=100 then
    insert into public.paper_reward_badges(user_id,badge_key)
    values(p_user_id,'grinder_100') on conflict do nothing;
  end if;
  if pts>=500 then
    insert into public.paper_reward_badges(user_id,badge_key)
    values(p_user_id,'degen_500') on conflict do nothing;
  end if;
  if pts>=1500 then
    insert into public.paper_reward_badges(user_id,badge_key)
    values(p_user_id,'alpha_1500') on conflict do nothing;
  end if;
  if pts>=5000 then
    insert into public.paper_reward_badges(user_id,badge_key)
    values(p_user_id,'legend_5000') on conflict do nothing;
  end if;
  if fills>=100 then
    insert into public.paper_reward_badges(user_id,badge_key)
    values(p_user_id,'century_fills') on conflict do nothing;
  end if;
end;
$$;
revoke all on function public.paper_refresh_reward_badges_user_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.paper_refresh_reward_badges_user_v1(uuid)
  to service_role;

create or replace function public.paper_reward_badges_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  perform public.paper_refresh_reward_badges_user_v1(new.user_id);
  return new;
end;
$$;
revoke all on function public.paper_reward_badges_trigger_v1()
  from public,anon,authenticated;

drop trigger if exists trg_paper_reward_badges_refresh on public.paper_reward_totals;
create trigger trg_paper_reward_badges_refresh
after insert or update on public.paper_reward_totals
for each row execute function public.paper_reward_badges_trigger_v1();

do $$
declare r record;
begin
  for r in select id from public.profiles loop
    perform public.paper_refresh_leaderboard_periods_user_v1(r.id);
    perform public.paper_refresh_reward_badges_user_v1(r.id);
  end loop;
end $$;
