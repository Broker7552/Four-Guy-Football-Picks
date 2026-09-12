-- Isolated Week test workflow. Test picks never write to production pool_picks.
create table if not exists public.pool_test_pick_runs (
  week_id bigint primary key references public.pool_weeks(id) on delete cascade,
  is_live boolean not null default false,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.pool_test_picks (
  week_id bigint not null references public.pool_weeks(id) on delete cascade,
  game_id bigint not null references public.pool_games(id) on delete cascade,
  participant_name text not null check (participant_name in ('Scott','Ross','Ken','Jim')),
  picked_team text not null,
  updated_at timestamptz not null default now(),
  primary key (week_id,game_id,participant_name)
);

alter table public.pool_test_pick_runs enable row level security;
alter table public.pool_test_picks enable row level security;
revoke all on public.pool_test_pick_runs, public.pool_test_picks from public,anon,authenticated;
grant all on public.pool_test_pick_runs, public.pool_test_picks to service_role;

create policy pool_test_pick_runs_service on public.pool_test_pick_runs to service_role using(true) with check(true);
create policy pool_test_picks_service on public.pool_test_picks to service_role using(true) with check(true);

create or replace function public.manage_test_picks(p_action text,p_actor uuid,p_week_id bigint,p_participant text default null,p_picks jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  w public.pool_weeks%rowtype;
  entry jsonb;
  g public.pool_games%rowtype;
  written integer:=0;
  live_state boolean:=false;
begin
  perform 1 from public.pool_settings s join public.pool_members m on m.user_id=s.admin_user_id
    where s.id=1 and s.admin_user_id=p_actor and m.role='admin' for share of s,m;
  if not found then raise exception 'Administrator access required'; end if;
  select * into w from public.pool_weeks where id=p_week_id for share;
  if w.id is null or w.week_number<=1 or w.status not in ('published','open','picks_open') then raise exception 'Choose a published week after Week 1'; end if;
  insert into public.pool_test_pick_runs(week_id) values(w.id) on conflict do nothing;
  if p_action='get' then
    select is_live into live_state from public.pool_test_pick_runs where week_id=w.id;
    return jsonb_build_object('participants',jsonb_build_array('Scott','Ross','Ken','Jim'),'is_live',live_state,
      'picks',(select coalesce(jsonb_agg(jsonb_build_object('game_id',p.game_id,'participant_name',p.participant_name,'picked_team',p.picked_team) order by p.game_id,p.participant_name),'[]'::jsonb) from public.pool_test_picks p where p.week_id=w.id));
  end if;
  if p_action='save' then
    if p_participant not in ('Scott','Ross','Ken','Jim') then raise exception 'Choose Scott, Ross, Ken, or Jim'; end if;
    if jsonb_typeof(p_picks) is distinct from 'array' or jsonb_array_length(p_picks)=0 then raise exception 'Choose at least one pick'; end if;
    if exists(select 1 from jsonb_array_elements(p_picks) x group by x->>'game_id' having count(*)>1) then raise exception 'Duplicate game picks'; end if;
    for entry in select x from jsonb_array_elements(p_picks) x loop
      select * into g from public.pool_games where id=(entry->>'game_id')::bigint and week_id=w.id for share;
      if g.id is null or not g.selected_for_pool or not g.published or entry->>'picked_team' not in(g.home_team,g.away_team) then raise exception 'Choose a valid side for a currently published game'; end if;
      insert into public.pool_test_picks(week_id,game_id,participant_name,picked_team,updated_at)
      values(w.id,g.id,p_participant,entry->>'picked_team',now())
      on conflict(week_id,game_id,participant_name) do update set picked_team=excluded.picked_team,updated_at=excluded.updated_at;
      written:=written+1;
    end loop;
    return jsonb_build_object('saved',written);
  end if;
  if p_action='publish' then update public.pool_test_pick_runs set is_live=true,published_at=now(),updated_at=now() where week_id=w.id; return jsonb_build_object('is_live',true); end if;
  if p_action='hide' then update public.pool_test_pick_runs set is_live=false,updated_at=now() where week_id=w.id; return jsonb_build_object('is_live',false); end if;
  if p_action='reset' then delete from public.pool_test_picks where week_id=w.id; update public.pool_test_pick_runs set is_live=false,published_at=null,updated_at=now() where week_id=w.id; return jsonb_build_object('reset',true); end if;
  raise exception 'Unknown test-pick action';
end $$;
revoke all on function public.manage_test_picks(text,uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_test_picks(text,uuid,bigint,text,jsonb) to service_role;
