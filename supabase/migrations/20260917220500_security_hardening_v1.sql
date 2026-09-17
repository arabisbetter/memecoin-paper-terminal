-- PAPER public-evaluation security hardening v1
-- Preserve anonymous PAPER trading while removing direct client authority from
-- qualification/funded paths and reducing unnecessary pre-auth GraphQL exposure.

-- Portfolio snapshots remain user analytics only. Run as invoker so RLS, not a
-- SECURITY DEFINER boundary, governs inserts. Evaluation qualification never trusts
-- this table; it uses paper_evaluation_marks written by the service role.
alter function public.record_portfolio_snapshot(numeric,numeric,numeric,numeric,numeric) security invoker;
revoke all on function public.record_portfolio_snapshot(numeric,numeric,numeric,numeric,numeric) from public,anon;
grant execute on function public.record_portfolio_snapshot(numeric,numeric,numeric,numeric,numeric) to authenticated;

drop policy if exists portfolio_snapshots_insert_own on public.portfolio_snapshots;
create policy portfolio_snapshots_insert_own on public.portfolio_snapshots
  for insert to authenticated
  with check (auth.uid()=user_id);
grant insert on public.portfolio_snapshots to authenticated;

-- Trigger-only reward function must never be an exposed RPC.
revoke all on function public.award_paper_trade_points() from public,anon,authenticated;

-- Legacy funded qualification/application RPCs are intentionally disabled. The
-- authoritative route is evaluation-status -> paper_evaluations -> KYC gate.
revoke all on function public.paper_apply_for_funded() from public,anon,authenticated;
revoke all on function public.paper_get_funded_qualification() from public,anon,authenticated;
revoke all on function public.paper_set_funded_payout_wallet(text) from public,anon,authenticated;

-- Funded/custody objects should not be discoverable before a user has a session.
revoke select,insert,update,delete on public.paper_funded_profiles from anon;
revoke select,insert,update,delete on public.paper_funded_applications from anon;
revoke select,insert,update,delete on public.paper_funded_accounts from anon;
revoke select,insert,update,delete on public.paper_funded_orders from anon;
revoke select,insert,update,delete on public.paper_funded_fills from anon;
revoke select,insert,update,delete on public.paper_funded_settlements from anon;
revoke select,insert,update,delete on public.paper_funded_settings from anon;
revoke select,insert,update,delete on public.weekly_payouts from anon;
revoke select,insert,update,delete on public.account_security from anon;
revoke select,insert,update,delete on public.payout_wallet_challenges from anon;
revoke select,insert,update,delete on public.observability_events from anon;
revoke select,insert,update,delete on public.trade_rate_events from anon;

-- Real-money switches are service-controlled only. Signed-in clients may read them
-- for accurate UI state, but never mutate them.
revoke insert,update,delete on public.paper_platform_flags from authenticated;
