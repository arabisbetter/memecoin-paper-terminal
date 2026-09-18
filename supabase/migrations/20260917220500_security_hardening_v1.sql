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
  with check ((select auth.uid())=user_id);
grant insert on public.portfolio_snapshots to authenticated;

-- Trigger-only reward function must never be an exposed RPC.
revoke all on function public.award_paper_trade_points() from public,anon,authenticated;

-- Legacy funded qualification/application RPCs are intentionally disabled. The
-- authoritative route is evaluation-status -> paper_evaluations -> KYC gate.
revoke all on function public.paper_apply_for_funded() from public,anon,authenticated;
revoke all on function public.paper_get_funded_qualification() from public,anon,authenticated;
revoke all on function public.paper_set_funded_payout_wallet(text) from public,anon,authenticated;

-- Funded/custody objects are read-only to signed-in users and invisible to anon.
-- Revoke ALL first because TRUNCATE bypasses RLS and can be inherited from
-- permissive Supabase default table privileges.
revoke all on public.paper_funded_profiles from public,anon,authenticated;
revoke all on public.paper_funded_applications from public,anon,authenticated;
revoke all on public.paper_funded_accounts from public,anon,authenticated;
revoke all on public.paper_funded_orders from public,anon,authenticated;
revoke all on public.paper_funded_fills from public,anon,authenticated;
revoke all on public.paper_funded_settlements from public,anon,authenticated;
revoke all on public.paper_funded_settings from public,anon,authenticated;
revoke all on public.weekly_payouts from public,anon,authenticated;
revoke all on public.account_security from public,anon,authenticated;
revoke all on public.payout_wallet_challenges from public,anon,authenticated;
revoke all on public.observability_events from public,anon,authenticated;
revoke all on public.trade_rate_events from public,anon,authenticated;

grant select on public.paper_funded_profiles,public.paper_funded_applications,public.paper_funded_accounts,
  public.paper_funded_orders,public.paper_funded_fills,public.paper_funded_settlements,
  public.paper_funded_settings,public.weekly_payouts,public.account_security
to authenticated;

-- Real-money switches are service-controlled only. Signed-in clients may read them
-- for accurate UI state, but never mutate them.
revoke insert,update,delete on public.paper_platform_flags from authenticated;
