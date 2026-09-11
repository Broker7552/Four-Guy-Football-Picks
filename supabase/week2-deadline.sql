-- Requested Week 2 exception: Friday September 11, 2026, 5 PM Eastern.
-- Keep the existing one-second reveal delay. Other deadlines are unchanged.
update public.pool_weeks set picks_due_at='2026-09-11 17:00:00 America/New_York'::timestamptz,
  picks_visible_at='2026-09-11 17:00:01 America/New_York'::timestamptz
where season=2026 and week_number=2 and picks_due_at='2026-09-11 04:00:00+00'::timestamptz;
