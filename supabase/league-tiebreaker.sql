-- League Championship combined final-game runs tiebreaker.
create table public.pool_baseball_tiebreaker_rounds (
 season integer not null,
 round_key text not null,
 locked_at timestamptz,
 al_final_runs integer check (al_final_runs between 0 and 100),
 nl_final_runs integer check (nl_final_runs between 0 and 100),
 al_game_pk integer,
 nl_game_pk integer,
 primary key (season,round_key),
 check (round_key = 'league')
);
create table public.pool_baseball_tiebreaker_predictions (
 season integer not null,
 round_key text not null,
 user_id uuid not null references auth.users(id),
 predicted_runs integer not null check (predicted_runs between 0 and 100),
 updated_at timestamptz not null default now(),
 primary key (season,round_key,user_id),
 foreign key (season,round_key) references public.pool_baseball_tiebreaker_rounds(season,round_key)
);
alter table public.pool_baseball_tiebreaker_rounds enable row level security;
alter table public.pool_baseball_tiebreaker_predictions enable row level security;
revoke all on public.pool_baseball_tiebreaker_rounds, public.pool_baseball_tiebreaker_predictions from public, anon, authenticated;
grant all on public.pool_baseball_tiebreaker_rounds, public.pool_baseball_tiebreaker_predictions to service_role;
insert into public.pool_baseball_tiebreaker_rounds(season,round_key) values (2026,'league');
