create index if not exists paper_fills_user_idx on public.paper_fills(user_id);
create index if not exists paper_ledger_entries_account_idx on public.paper_ledger_entries(account_id);
create index if not exists paper_ledger_entries_user_idx on public.paper_ledger_entries(user_id);
create index if not exists paper_orders_user_idx on public.paper_orders(user_id);
create index if not exists paper_positions_token_idx on public.paper_positions(token_id);
create index if not exists paper_positions_user_idx on public.paper_positions(user_id);
create index if not exists paper_reward_events_user_idx on public.paper_reward_events(user_id);
create index if not exists paper_trades_position_idx on public.paper_trades(position_id);
create index if not exists paper_trades_token_idx on public.paper_trades(token_id);
create index if not exists paper_trades_user_idx on public.paper_trades(user_id);
create index if not exists trade_rate_events_user_idx on public.trade_rate_events(user_id);
create index if not exists weekly_payouts_user_idx on public.weekly_payouts(user_id);

drop policy if exists portfolio_snapshots_select_own on public.portfolio_snapshots;
create policy portfolio_snapshots_select_own on public.portfolio_snapshots for select to authenticated using ((select auth.uid())=user_id);

drop policy if exists tracked_wallets_select_own on public.tracked_wallets;
create policy tracked_wallets_select_own on public.tracked_wallets for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists tracked_wallets_insert_own on public.tracked_wallets;
create policy tracked_wallets_insert_own on public.tracked_wallets for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists tracked_wallets_update_own on public.tracked_wallets;
create policy tracked_wallets_update_own on public.tracked_wallets for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists tracked_wallets_delete_own on public.tracked_wallets;
create policy tracked_wallets_delete_own on public.tracked_wallets for delete to authenticated using ((select auth.uid())=user_id);

drop policy if exists token_watchlist_select_own on public.token_watchlist;
create policy token_watchlist_select_own on public.token_watchlist for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists token_watchlist_insert_own on public.token_watchlist;
create policy token_watchlist_insert_own on public.token_watchlist for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists token_watchlist_update_own on public.token_watchlist;
create policy token_watchlist_update_own on public.token_watchlist for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists token_watchlist_delete_own on public.token_watchlist;
create policy token_watchlist_delete_own on public.token_watchlist for delete to authenticated using ((select auth.uid())=user_id);

drop policy if exists paper_reward_events_select_own on public.paper_reward_events;
create policy paper_reward_events_select_own on public.paper_reward_events for select to authenticated using ((select auth.uid())=user_id);
