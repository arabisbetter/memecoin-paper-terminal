-- Final release: wallet tracking, token watchlists, and PAPER reward points.
create table if not exists public.tracked_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null,
  label text not null default 'Tracked wallet',
  notes text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,address)
);

alter table public.tracked_wallets enable row level security;
drop policy if exists tracked_wallets_select_own on public.tracked_wallets;
drop policy if exists tracked_wallets_insert_own on public.tracked_wallets;
drop policy if exists tracked_wallets_update_own on public.tracked_wallets;
drop policy if exists tracked_wallets_delete_own on public.tracked_wallets;
create policy tracked_wallets_select_own on public.tracked_wallets for select to authenticated using (auth.uid()=user_id);
create policy tracked_wallets_insert_own on public.tracked_wallets for insert to authenticated with check (auth.uid()=user_id);
create policy tracked_wallets_update_own on public.tracked_wallets for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy tracked_wallets_delete_own on public.tracked_wallets for delete to authenticated using (auth.uid()=user_id);

create table if not exists public.token_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chain_id text not null check (chain_id in ('solana','base','ethereum')),
  address text not null,
  symbol text,
  name text,
  image_url text,
  alert_above_usd numeric,
  alert_below_usd numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,chain_id,address)
);

alter table public.token_watchlist enable row level security;
drop policy if exists token_watchlist_select_own on public.token_watchlist;
drop policy if exists token_watchlist_insert_own on public.token_watchlist;
drop policy if exists token_watchlist_update_own on public.token_watchlist;
drop policy if exists token_watchlist_delete_own on public.token_watchlist;
create policy token_watchlist_select_own on public.token_watchlist for select to authenticated using (auth.uid()=user_id);
create policy token_watchlist_insert_own on public.token_watchlist for insert to authenticated with check (auth.uid()=user_id);
create policy token_watchlist_update_own on public.token_watchlist for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy token_watchlist_delete_own on public.token_watchlist for delete to authenticated using (auth.uid()=user_id);

create table if not exists public.paper_reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  points integer not null check (points>0),
  source_trade_id uuid references public.paper_trades(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists paper_reward_events_trade_unique on public.paper_reward_events(source_trade_id) where source_trade_id is not null;
alter table public.paper_reward_events enable row level security;
drop policy if exists paper_reward_events_select_own on public.paper_reward_events;
create policy paper_reward_events_select_own on public.paper_reward_events for select to authenticated using (auth.uid()=user_id);

create table if not exists public.paper_reward_totals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points bigint not null default 0,
  qualifying_trades bigint not null default 0,
  last_earned_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.paper_reward_totals enable row level security;
drop policy if exists paper_reward_totals_public_read on public.paper_reward_totals;
create policy paper_reward_totals_public_read on public.paper_reward_totals for select to authenticated using (true);

create or replace function public.award_paper_trade_points()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.accounting_version='usd_v2' and coalesce(new.is_paper,true) then
    insert into public.paper_reward_events(user_id,event_type,points,source_trade_id)
    values(new.user_id,'paper_trade',10,new.id)
    on conflict do nothing;
    if found then
      insert into public.paper_reward_totals(user_id,points,qualifying_trades,last_earned_at,updated_at)
      values(new.user_id,10,1,coalesce(new.ts,now()),now())
      on conflict(user_id) do update set
        points=public.paper_reward_totals.points+10,
        qualifying_trades=public.paper_reward_totals.qualifying_trades+1,
        last_earned_at=greatest(public.paper_reward_totals.last_earned_at,excluded.last_earned_at),
        updated_at=now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_award_paper_trade_points on public.paper_trades;
create trigger trg_award_paper_trade_points after insert on public.paper_trades for each row execute function public.award_paper_trade_points();

insert into public.paper_reward_events(user_id,event_type,points,source_trade_id,created_at)
select t.user_id,'paper_trade',10,t.id,t.ts
from public.paper_trades t
where t.accounting_version='usd_v2' and coalesce(t.is_paper,true)
on conflict do nothing;

insert into public.paper_reward_totals(user_id,points,qualifying_trades,last_earned_at,updated_at)
select user_id,sum(points)::bigint,count(*)::bigint,max(created_at),now()
from public.paper_reward_events
group by user_id
on conflict(user_id) do update set points=excluded.points,qualifying_trades=excluded.qualifying_trades,last_earned_at=excluded.last_earned_at,updated_at=now();

grant select,insert,update,delete on public.tracked_wallets to authenticated;
grant select,insert,update,delete on public.token_watchlist to authenticated;
grant select on public.paper_reward_events to authenticated;
grant select on public.paper_reward_totals to authenticated;
