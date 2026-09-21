-- Phase 1 token eligibility: only verified, liquid, risk-screened tokens can affect leaderboards.
create or replace function public.paper_token_leaderboard_eligible(p_token_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public','pg_temp'
as $$
  select exists(
    select 1
    from public.tokens t
    join public.paper_token_risk_snapshots r on r.mint_address=t.mint_address
    where t.id=p_token_id
      and r.data_status='LIVE'
      and coalesce(r.liquidity_usd,0)>0
      and coalesce(r.funded_buy_blocked,true)=false
  );
$$;

revoke all on function public.paper_token_leaderboard_eligible(uuid) from public, anon, authenticated;
grant execute on function public.paper_token_leaderboard_eligible(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.paper_refresh_leaderboard_periods_user_v1(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      and public.paper_token_leaderboard_eligible(t.token_id)
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
      and public.paper_token_leaderboard_eligible(x.token_id)
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
$function$


CREATE OR REPLACE FUNCTION public.paper_refresh_leaderboards_v2()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      and public.paper_token_leaderboard_eligible(x.token_id)
  ) t on true
  left join lateral (
    select count(*)::int closed_count,
           count(*) filter (where coalesce(realized_pnl_usd,0)>0)::int wins
    from public.paper_positions x where x.user_id=p.id and x.status='closed' and coalesce(x.accounting_version,'')='usd_v2'
      and public.paper_token_leaderboard_eligible(x.token_id)
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
      and public.paper_token_leaderboard_eligible(x.token_id)
      and x.ts>=date_trunc('week',now())
  ) t on true
  left join lateral (
    select count(*)::int closed_count,
           count(*) filter (where coalesce(realized_pnl_usd,0)>0)::int wins
    from public.paper_positions x where x.user_id=p.id and x.status='closed'
      and coalesce(x.accounting_version,'')='usd_v2'
      and public.paper_token_leaderboard_eligible(x.token_id)
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
$function$


do $$
declare r record;
begin
  for r in select id from public.profiles loop
    perform public.paper_refresh_leaderboard_periods_user_v1(r.id);
  end loop;
  perform public.paper_refresh_leaderboards_v2();
end $$;
