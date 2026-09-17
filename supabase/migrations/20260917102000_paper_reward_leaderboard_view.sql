create or replace view public.paper_reward_leaderboard with (security_invoker=true) as
select r.user_id,r.points,r.qualifying_trades,r.last_earned_at,p.username,p.display_name,p.avatar_url,p.avatar_emoji
from public.paper_reward_totals r
left join public.profiles p on p.id=r.user_id;
grant select on public.paper_reward_leaderboard to authenticated;
