create schema if not exists paper_private;
revoke all on schema paper_private from public,anon,authenticated;
grant usage on schema paper_private to service_role;

create table if not exists public.paper_operational_heartbeats (
  component text primary key,
  status text not null default 'unknown' check (status in ('healthy','degraded','failed','unknown')),
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures>=0),
  latency_ms integer,
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.paper_operational_heartbeats enable row level security;
revoke all on public.paper_operational_heartbeats from public,anon,authenticated;
grant select,insert,update,delete on public.paper_operational_heartbeats to service_role;

create table if not exists paper_private.rate_limit_buckets (
  scope text not null,
  subject text not null,
  window_started_at timestamptz not null default now(),
  event_count integer not null default 0 check (event_count>=0),
  updated_at timestamptz not null default now(),
  primary key(scope,subject)
);
revoke all on paper_private.rate_limit_buckets from public,anon,authenticated;
grant select,insert,update,delete on paper_private.rate_limit_buckets to service_role;

create or replace function public.paper_validate_server_session_v1(
  p_user_id uuid,
  p_session_id uuid,
  p_require_aal2 boolean default false
) returns boolean
language sql
stable
security definer
set search_path=auth,pg_temp
as $session$
  select exists(
    select 1
    from auth.sessions s
    where s.id=p_session_id
      and s.user_id=p_user_id
      and (s.not_after is null or s.not_after>now())
      and (not p_require_aal2 or s.aal::text='aal2')
  );
$session$;
revoke all on function public.paper_validate_server_session_v1(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.paper_validate_server_session_v1(uuid,uuid,boolean) to service_role;

create or replace function public.paper_consume_server_rate_limit_v1(
  p_scope text,
  p_subject text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path=paper_private,pg_temp
as $rate$
declare
  b paper_private.rate_limit_buckets%rowtype;
  now_ts timestamptz:=clock_timestamp();
  elapsed numeric;
  retry_after integer:=0;
begin
  if p_scope is null or length(p_scope)<1 or length(p_scope)>80 then raise exception 'invalid rate-limit scope'; end if;
  if p_subject is null or length(p_subject)<1 or length(p_subject)>160 then raise exception 'invalid rate-limit subject'; end if;
  if p_limit<1 or p_limit>10000 then raise exception 'invalid rate-limit limit'; end if;
  if p_window_seconds<1 or p_window_seconds>86400 then raise exception 'invalid rate-limit window'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_scope||':'||p_subject,0));

  select * into b from paper_private.rate_limit_buckets
  where scope=p_scope and subject=p_subject
  for update;

  if b.scope is null or b.window_started_at + make_interval(secs=>p_window_seconds)<=now_ts then
    insert into paper_private.rate_limit_buckets(scope,subject,window_started_at,event_count,updated_at)
    values(p_scope,p_subject,now_ts,1,now_ts)
    on conflict(scope,subject) do update set
      window_started_at=excluded.window_started_at,event_count=1,updated_at=now_ts;
    return jsonb_build_object('allowed',true,'remaining',p_limit-1,'retry_after_seconds',0);
  end if;

  elapsed:=extract(epoch from (now_ts-b.window_started_at));
  retry_after:=greatest(1,ceil(p_window_seconds-elapsed)::integer);

  if b.event_count>=p_limit then
    return jsonb_build_object('allowed',false,'remaining',0,'retry_after_seconds',retry_after);
  end if;

  update paper_private.rate_limit_buckets
  set event_count=event_count+1,updated_at=now_ts
  where scope=p_scope and subject=p_subject;

  return jsonb_build_object('allowed',true,'remaining',greatest(0,p_limit-b.event_count-1),'retry_after_seconds',retry_after);
end;
$rate$;
revoke all on function public.paper_consume_server_rate_limit_v1(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.paper_consume_server_rate_limit_v1(text,text,integer,integer) to service_role;

revoke all on function public.paper_start_evaluation_v1() from public,anon,authenticated;
grant execute on function public.paper_start_evaluation_v1() to service_role;

create or replace function public.paper_start_evaluation_v2(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $eval$
declare
  uid uuid:=p_user_id;
  v_is_anonymous boolean;
  v_active public.paper_evaluations%rowtype;
  v_last public.paper_evaluations%rowtype;
  v_attempt integer;
  v_open_count integer;
  v_cash numeric;
  v_eval public.paper_evaluations%rowtype;
  v_missing_legal integer;
begin
  if uid is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('paper-evaluation-start:'||uid::text,0));

  select is_anonymous into v_is_anonymous from auth.users where id=uid;
  if coalesce(v_is_anonymous,true) then
    raise exception 'RECOVERABLE_LOGIN_REQUIRED: link a verified email or X identity before entering an evaluation';
  end if;

  select count(*) into v_missing_legal
  from (values ('tos','v2'),('privacy','v1'),('risk_disclosure','v2')) req(document_type,document_version)
  where not exists (
    select 1 from public.legal_acceptances l
    where l.user_id=uid and l.document_type=req.document_type and l.document_version=req.document_version
  );
  if v_missing_legal>0 then raise exception 'LEGAL_ACCEPTANCE_REQUIRED: accept the current PAPER terms and risk disclosure'; end if;

  select * into v_active from public.paper_evaluations
  where user_id=uid and status='active' order by starts_at desc limit 1;
  if v_active.id is not null then return to_jsonb(v_active); end if;

  select * into v_last from public.paper_evaluations
  where user_id=uid order by attempt_no desc limit 1;
  if v_last.status='passed' then raise exception 'evaluation already passed'; end if;
  if v_last.cooldown_until is not null and v_last.cooldown_until>now() then
    raise exception 'EVALUATION_COOLDOWN: next attempt available at %',v_last.cooldown_until;
  end if;

  select count(*) into v_open_count from public.paper_positions
  where user_id=uid and status='open' and coalesce(accounting_version,'')='usd_v2' and quantity_tokens>0;
  if v_open_count>0 then raise exception 'Close all PAPER positions before starting an evaluation'; end if;

  select cash_usd into v_cash from public.paper_accounts where user_id=uid for update;
  if v_cash is null then raise exception 'PAPER account not found'; end if;
  v_attempt:=coalesce(v_last.attempt_no,0)+1;

  insert into public.paper_evaluations(
    user_id,attempt_no,status,starting_balance_usd,profit_target_usd,pass_equity_usd,
    trailing_drawdown_pct,max_daily_loss_usd,max_position_pct,max_single_trade_pct,
    max_open_positions,min_trades,starts_at,expires_at,peak_equity_usd,trailing_floor_usd,
    last_equity_usd,last_cash_usd,last_open_value_usd,daily_anchor_date,daily_anchor_equity_usd,
    daily_loss_usd,current_drawdown_pct,data_status
  ) values(
    uid,v_attempt,'active',1000,5000,6000,10,50,25,25,5,1,now(),now()+interval '30 days',
    1000,900,1000,1000,0,(now() at time zone 'utc')::date,1000,0,0,'DEGRADED'
  ) returning * into v_eval;

  update public.paper_accounts
  set starting_balance_usd=1000,cash_usd=1000,status='active',updated_at=now()
  where user_id=uid;

  insert into public.paper_ledger_entries(
    user_id,account_id,entry_type,amount_usd,balance_after_usd,metadata_json,idempotency_key
  ) values(
    uid,uid,'evaluation_reset',1000-coalesce(v_cash,0),1000,
    jsonb_build_object('evaluation_id',v_eval.id,'attempt_no',v_attempt,'previous_cash_usd',v_cash),
    'evaluation:'||v_eval.id::text||':reset'
  ) on conflict(idempotency_key) do nothing;

  insert into public.paper_evaluation_events(evaluation_id,user_id,event_type,details)
  values(v_eval.id,uid,'evaluation_started',jsonb_build_object('attempt_no',v_attempt,'expires_at',v_eval.expires_at));

  return to_jsonb(v_eval);
end;
$eval$;
revoke all on function public.paper_start_evaluation_v2(uuid) from public,anon,authenticated;
grant execute on function public.paper_start_evaluation_v2(uuid) to service_role;

create index if not exists observability_events_user_created_idx
  on public.observability_events(user_id,created_at desc) where user_id is not null;
create index if not exists payout_wallet_challenges_user_created_idx
  on public.payout_wallet_challenges(user_id,created_at desc);

create or replace function public.paper_ops_health_snapshot_v1()
returns jsonb
language sql
stable
security definer
set search_path=public,cron,pg_temp
as $health$
with monitored_jobs as (
  select j.jobid,j.jobname,j.schedule,j.active,
    (
      select jsonb_build_object(
        'status',r.status,'start_time',r.start_time,'end_time',r.end_time,
        'return_message',left(coalesce(r.return_message,''),240)
      )
      from cron.job_run_details r
      where r.jobid=j.jobid
      order by r.runid desc limit 1
    ) as last_run
  from cron.job j
  where j.jobname in (
    'paper-evaluation-monitor-v1',
    'paper-funded-monitor-v1',
    'paper-funded-settlement-v1',
    'paper-operational-prune-v1'
  )
)
select jsonb_build_object(
  'checked_at',now(),
  'evaluation_monitor',(
    select jsonb_build_object(
      'completed_at',m.completed_at,'active_evaluations',m.active_evaluations,
      'marked_live',m.marked_live,'marked_degraded',m.marked_degraded,
      'failed',m.failed,'expired',m.expired,'error_summary',m.error_summary
    )
    from public.paper_evaluation_monitor_runs m order by m.id desc limit 1
  ),
  'heartbeats',coalesce((select jsonb_agg(to_jsonb(h) order by h.component) from public.paper_operational_heartbeats h),'[]'::jsonb),
  'cron',coalesce((select jsonb_agg(to_jsonb(j) order by j.jobname) from monitored_jobs j),'[]'::jsonb),
  'provider_health',coalesce((
    select jsonb_agg(jsonb_build_object(
      'provider',p.provider,'status',p.status,'updated_at',p.updated_at,
      'consecutive_failures',p.consecutive_failures
    ) order by p.provider)
    from public.paper_market_provider_health p
  ),'[]'::jsonb),
  'real_money',(
    select jsonb_build_object(
      'activation',f.real_funded_activation,'payouts',f.real_payouts_enabled,
      'legal_review',f.legal_review_complete,'kyc',f.kyc_provider_configured,
      'turnkey',f.turnkey_signing_enabled,'treasury',f.treasury_capital_available
    )
    from public.paper_platform_flags f where f.id=true
  )
);
$health$;
revoke all on function public.paper_ops_health_snapshot_v1() from public,anon,authenticated;
grant execute on function public.paper_ops_health_snapshot_v1() to service_role;

create or replace function paper_private.prune_operational_data_v1()
returns jsonb
language plpgsql
security definer
set search_path=paper_private,public,pg_temp
as $prune$
declare
  rate_deleted bigint:=0;
  obs_deleted bigint:=0;
  eval_runs_deleted bigint:=0;
begin
  delete from paper_private.rate_limit_buckets where updated_at<now()-interval '2 days';
  get diagnostics rate_deleted=row_count;

  delete from public.observability_events where created_at<now()-interval '90 days';
  get diagnostics obs_deleted=row_count;

  delete from public.paper_evaluation_monitor_runs where completed_at<now()-interval '30 days';
  get diagnostics eval_runs_deleted=row_count;

  return jsonb_build_object(
    'rate_limit_buckets',rate_deleted,
    'observability_events',obs_deleted,
    'evaluation_monitor_runs',eval_runs_deleted
  );
end;
$prune$;
revoke all on function paper_private.prune_operational_data_v1() from public,anon,authenticated;
grant execute on function paper_private.prune_operational_data_v1() to service_role;

select cron.unschedule(jobid) from cron.job where jobname='paper-operational-prune-v1';
select cron.schedule(
  'paper-operational-prune-v1',
  '17 3 * * *',
  $$select paper_private.prune_operational_data_v1();$$
);
