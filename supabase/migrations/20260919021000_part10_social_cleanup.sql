-- Part 10 production-compatibility cleanup.
-- Remove legacy duplicates superseded by the Part 10 equivalents.

drop policy if exists moderation_reporter_insert on public.moderation_reports;

drop index if exists public.social_posts_created_idx;
drop index if exists public.moderation_reports_reported_idx;
