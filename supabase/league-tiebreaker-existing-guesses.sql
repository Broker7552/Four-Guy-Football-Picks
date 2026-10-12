-- League Championship guesses recorded before the series began.
-- This existing table is the active source for the run tiebreaker.
create table if not exists public.pool_baseball_tiebreaker_guesses (
 season integer not null,
 round_key text not null check (round_key='league'),
 user_id uuid not null references auth.users(id),
 predicted_runs integer not null check (predicted_runs between 0 and 100),
 updated_at timestamptz not null default now(),
 primary key (season,round_key,user_id)
);
alter table public.pool_baseball_tiebreaker_guesses enable row level security;
revoke all on public.pool_baseball_tiebreaker_guesses from public,anon,authenticated;
grant all on public.pool_baseball_tiebreaker_guesses to service_role;
