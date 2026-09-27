-- Apply the unanimous-pick rule to college and NFL games after picks close.
create table if not exists public.pool_anti_clone_audit (
  game_id bigint primary key references public.pool_games(id),
  week_id bigint not null references public.pool_weeks(id),
  pick_id bigint not null references public.pool_picks(id),
  user_id uuid not null,
  original_team text not null,
  flipped_team text not null,
  applied_at timestamptz not null default now()
);
alter table public.pool_anti_clone_audit enable row level security;
revoke all on public.pool_anti_clone_audit from public, anon, authenticated;
grant all on public.pool_anti_clone_audit to service_role;

create or replace function public.prevent_pick_after_deadline()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare due timestamptz; pub boolean;
begin
  if tg_op='UPDATE'
     and current_setting('request.jwt.claim.role',true)='service_role'
     and new.game_id=old.game_id and new.user_id=old.user_id
     and new.was_anti_clone_flip=true and old.was_anti_clone_flip=false
     and new.picked_team is distinct from old.picked_team
     and new.is_late is not distinct from old.is_late
     and new.was_auto_favorite is not distinct from old.was_auto_favorite
  then return new; end if;
  if not public.is_pool_member() then raise exception 'Not a pool member'; end if;
  select w.picks_due_at,g.published into due,pub
    from public.pool_games g join public.pool_weeks w on w.id=g.week_id where g.id=new.game_id;
  if not pub then raise exception 'Game is not published'; end if;
  if due is not null and now()>=due then raise exception 'Picks are locked'; end if;
  return new;
end $fn$;

create or replace function public.apply_pool_anti_clone_flips(p_week_id bigint)
returns jsonb language plpgsql security invoker set search_path = ''
as $fn$
declare w public.pool_weeks%rowtype; g public.pool_games%rowtype;
  pick public.pool_picks%rowtype; n integer; sides integer; unanimous text;
  applied jsonb := '[]'::jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(407553,p_week_id::integer);
  select * into w from public.pool_weeks where id=p_week_id for update;
  if w.id is null or w.status not in ('published','open','picks_open')
     or w.picks_due_at is null or (pg_catalog.now()<w.picks_due_at and not coalesce(w.picks_closed_early,false))
     then
    return applied;
  end if;
  lock table public.pool_picks in share row exclusive mode;
  for g in select * from public.pool_games
    where week_id=w.id and sport in ('college','nfl')
      and selected_for_pool and published order by id
  loop
    if exists(select 1 from public.pool_anti_clone_audit where game_id=g.id)
      or exists(select 1 from public.pool_picks where game_id=g.id and was_anti_clone_flip)
    then continue; end if;
    select count(*),count(distinct p.picked_team),min(p.picked_team)
      into n,sides,unanimous
      from public.pool_picks p join public.pool_members m on m.user_id=p.user_id
      where p.game_id=g.id;
    if n<>4 or sides<>1 or unanimous not in (g.home_team,g.away_team) then continue; end if;
    select p.* into pick from public.pool_picks p
      join public.pool_members m on m.user_id=p.user_id
      where p.game_id=g.id order by pg_catalog.random() limit 1;
    update public.pool_picks set
      picked_team=case when unanimous=g.home_team then g.away_team else g.home_team end,
      was_anti_clone_flip=true,updated_at=pg_catalog.now()
      where id=pick.id and picked_team=unanimous and not was_anti_clone_flip;
    if not found then raise exception 'Flip could not be applied for game %',g.id; end if;
    insert into public.pool_anti_clone_audit(game_id,week_id,pick_id,user_id,original_team,flipped_team)
      values(g.id,w.id,pick.id,pick.user_id,unanimous,
        case when unanimous=g.home_team then g.away_team else g.home_team end);
    applied=applied || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('game_id',g.id,'pick_id',pick.id));
  end loop;
  return applied;
end $fn$;
revoke all on function public.apply_pool_anti_clone_flips(bigint) from public,anon,authenticated;
grant execute on function public.apply_pool_anti_clone_flips(bigint) to service_role;
