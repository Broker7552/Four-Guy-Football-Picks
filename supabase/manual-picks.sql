create table public.pool_manual_pick_audit (
  id bigint generated always as identity primary key,
  actor uuid not null,
  player uuid not null,
  week_id bigint not null references public.pool_weeks(id),
  before_picks jsonb not null,
  submitted_picks jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.pool_manual_pick_audit enable row level security;
revoke all on public.pool_manual_pick_audit from public,anon,authenticated;
grant all on public.pool_manual_pick_audit to service_role;
grant usage,select on sequence public.pool_manual_pick_audit_id_seq to service_role;
create policy manual_pick_audit_service on public.pool_manual_pick_audit to service_role using(true) with check(true);

-- Callable only by the authenticated administrator Edge endpoint using service_role.
-- Review exposes counts and an opaque token, never another player's private choices.
create function public.manage_manual_picks(p_action text,p_actor uuid,p_player uuid,p_week_id bigint,p_picks jsonb,p_token text default null,p_acknowledge boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.pool_weeks%rowtype; entry jsonb; game public.pool_games%rowtype;
  previous jsonb; games jsonb; token text; existing_count integer; written integer:=0;
begin
  perform 1 from public.pool_settings s join public.pool_members m on m.user_id=s.admin_user_id
    where s.id=1 and s.admin_user_id=p_actor and m.role='admin' for share of s,m;
  if not found then raise exception 'Administrator access required'; end if;
  perform 1 from public.pool_members where user_id=p_player for share;
  if not found then raise exception 'Choose a registered pool member'; end if;
  select * into w from public.pool_weeks where id=p_week_id for share;
  if w.id is null or w.week_number<=1 or w.status not in ('published','open','picks_open') then raise exception 'Choose a published pick week'; end if;
  if w.picks_due_at is null or now()>=w.picks_due_at then raise exception 'Picks are locked for this week'; end if;
  if p_action not in ('review','save') then raise exception 'Unknown action'; end if;
  if jsonb_typeof(p_picks) is distinct from 'array' or jsonb_array_length(p_picks)=0 then raise exception 'Choose at least one pick'; end if;
  if exists(select 1 from jsonb_array_elements(p_picks) x group by x->>'game_id' having count(*)>1) then raise exception 'Duplicate game picks'; end if;
  -- Prevent concurrent submissions from being silently overwritten after review.
  if p_action='save' then lock table public.pool_picks in share row exclusive mode; end if;
  games='[]';
  for entry in select x from jsonb_array_elements(p_picks) x order by (x->>'game_id')::bigint loop
    select * into game from public.pool_games where id=(entry->>'game_id')::bigint and week_id=w.id for share;
    if game.id is null or not game.selected_for_pool or not game.published or entry->>'picked_team' is null or entry->>'picked_team' not in(game.home_team,game.away_team) then raise exception 'Choose a valid side for a currently published game'; end if;
    games=games || jsonb_build_array(to_jsonb(game));
  end loop;
  select coalesce(jsonb_agg(p order by p.game_id),'[]'),count(*) into previous,existing_count
    from public.pool_picks p where user_id=p_player and exists(select 1 from jsonb_array_elements(p_picks) x where (x->>'game_id')::bigint=p.game_id);
  token=md5(previous::text || games::text || p_picks::text || p_player::text || w.picks_due_at::text);
  if p_action='review' then return jsonb_build_object('token',token,'existing_count',existing_count,'pick_count',jsonb_array_length(p_picks)); end if;
  if p_token is distinct from token then raise exception 'Picks or games changed. Review again before saving'; end if;
  if existing_count>0 and not coalesce(p_acknowledge,false) then raise exception 'Confirm replacement of existing picks'; end if;
  -- The actor has been verified above. Supply that identity to the existing member/deadline trigger.
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  insert into public.pool_manual_pick_audit(actor,player,week_id,before_picks,submitted_picks) values(p_actor,p_player,w.id,previous,p_picks);
  for entry in select x from jsonb_array_elements(p_picks) x loop
    insert into public.pool_picks(game_id,user_id,picked_team,updated_at)
      values((entry->>'game_id')::bigint,p_player,entry->>'picked_team',now())
      on conflict(game_id,user_id) do update set picked_team=excluded.picked_team,updated_at=excluded.updated_at
        where public.pool_picks.picked_team is distinct from excluded.picked_team;
    if found then written=written+1; end if;
  end loop;
  return jsonb_build_object('saved',written);
end $$;
revoke all on function public.manage_manual_picks(text,uuid,uuid,bigint,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.manage_manual_picks(text,uuid,uuid,bigint,jsonb,text,boolean) to service_role;
