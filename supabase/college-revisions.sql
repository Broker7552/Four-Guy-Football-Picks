-- Separate administrator revisions; the live schedule stays published while editing.
create table public.pool_college_revisions (
  week_id bigint primary key references public.pool_weeks(id),
  version integer not null default 1,
  baseline jsonb not null,
  candidates jsonb not null,
  selected_ids jsonb not null,
  refreshed_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
create table public.pool_college_revision_audit (
  id bigint generated always as identity primary key,
  week_id bigint not null references public.pool_weeks(id),
  actor uuid not null,
  before_games jsonb not null,
  changes jsonb not null,
  published_at timestamptz not null default now()
);
alter table public.pool_college_revisions enable row level security;
alter table public.pool_college_revision_audit enable row level security;
revoke all on public.pool_college_revisions,public.pool_college_revision_audit from public,anon,authenticated;
grant all on public.pool_college_revisions,public.pool_college_revision_audit to service_role;
grant usage,select on sequence public.pool_college_revision_audit_id_seq to service_role;
create policy college_revision_service on public.pool_college_revisions to service_role using(true) with check(true);
create policy college_revision_audit_service on public.pool_college_revision_audit to service_role using(true) with check(true);

create function public.manage_college_revision(p_action text,p_actor uuid,p_week_id bigint,p_version integer default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  w public.pool_weeks%rowtype;
  d public.pool_college_revisions%rowtype;
  live jsonb; c jsonb; old jsonb; item jsonb; ids jsonb;
  changes jsonb := '[]'; token text; affected integer; replacement boolean; changed boolean;
begin
  perform 1 from public.pool_settings s join public.pool_members m on m.user_id=s.admin_user_id
    where s.id=1 and s.admin_user_id=p_actor and m.role='admin' for share of s,m;
  if not found then raise exception 'Administrator access required'; end if;
  select * into w from public.pool_weeks where id=p_week_id for update;
  if w.id is null or w.week_number<=1 or w.status not in ('published','open','picks_open') then
    raise exception 'Choose a published week after Week 1';
  end if;
  -- Short transaction locks prevent a pick arriving between impact checking and publication.
  if p_action='publish' then lock table public.pool_picks in share mode; end if;
  perform 1 from public.pool_games where week_id=w.id and sport='college' order by id for update;
  select coalesce(jsonb_agg(g order by id),'[]') into live from public.pool_games g where week_id=w.id and sport='college';
  select * into d from public.pool_college_revisions where week_id=w.id for update;
  if p_action='open' then
    if d.week_id is not null and d.published_at is null then return to_jsonb(d); end if;
    select coalesce(jsonb_agg(g || jsonb_build_object('id','db:'||(g->>'id'),'game_id',(g->>'id')::bigint,'issue','','line_updated_at',null)),'[]') into ids from jsonb_array_elements(live) g;
    insert into public.pool_college_revisions(week_id,baseline,candidates,selected_ids)
      values(w.id,live,ids,(select coalesce(jsonb_agg('db:'||(g->>'id')),'[]') from jsonb_array_elements(live) g where (g->>'selected_for_pool')::boolean))
      on conflict(week_id) do update set baseline=excluded.baseline,candidates=excluded.candidates,selected_ids=excluded.selected_ids,
        version=public.pool_college_revisions.version+1,published_at=null,refreshed_at=null,updated_at=now() returning * into d;
    return to_jsonb(d);
  end if;
  if d.week_id is null or d.published_at is not null then raise exception 'Open a published-week revision first'; end if;
  if p_action='get' then return to_jsonb(d); end if;
  if p_version is distinct from d.version then raise exception 'The revision changed. Reload and review again'; end if;
  if p_action='discard' then
    update public.pool_college_revisions set published_at=now(),version=version+1 where week_id=w.id returning * into d;
    return to_jsonb(d);
  end if;
  if live is distinct from d.baseline then raise exception 'Published college data changed since this revision opened. Discard this draft and reopen it'; end if;
  if p_action in ('save','refresh') then
    ids=p_payload->'selected_ids';
    if jsonb_typeof(p_payload->'candidates') is distinct from 'array' or jsonb_typeof(ids) is distinct from 'array' then raise exception 'Invalid revision'; end if;
    if exists(select 1 from jsonb_array_elements(p_payload->'candidates') candidate_row group by candidate_row->>'id' having count(*)>1)
      or exists(select 1 from jsonb_array_elements(p_payload->'candidates') candidate_row where coalesce(candidate_row->>'id','')='' or (candidate_row->>'game_id' is not null and not exists(select 1 from jsonb_array_elements(live) g where g->>'id'=candidate_row->>'game_id')))
      or exists(select 1 from jsonb_array_elements(p_payload->'candidates') candidate_row where candidate_row->>'game_id' is not null group by candidate_row->>'game_id' having count(*)>1)
      or exists(select 1 from jsonb_array_elements(ids) i where jsonb_typeof(i)<>'string' or not exists(select 1 from jsonb_array_elements(p_payload->'candidates') candidate_row where candidate_row->'id'=i)) then raise exception 'Invalid game IDs'; end if;
    update public.pool_college_revisions set candidates=p_payload->'candidates',selected_ids=(select coalesce(jsonb_agg(distinct i),'[]') from jsonb_array_elements(ids) i),
      refreshed_at=case when p_action='refresh' then now() else refreshed_at end,version=version+1,updated_at=now() where week_id=w.id returning * into d;
    return to_jsonb(d);
  elsif p_action not in ('review','publish') then raise exception 'Unknown action'; end if;

  -- Describe only changed games, with pick COUNTS, never private choices or identities.
  for old in select g from jsonb_array_elements(live) g loop
    select x into c from jsonb_array_elements(d.candidates) x where x->>'game_id'=old->>'id' and d.selected_ids ? (x->>'id');
    if c is null then
      if (old->>'selected_for_pool')::boolean then
        changes=changes || jsonb_build_array(jsonb_build_object('action','remove','game_id',old->'id','before',old));
      end if;
    end if;
  end loop;
  for c in select x from jsonb_array_elements(d.candidates) x where d.selected_ids ? (x->>'id') loop
    select g into old from jsonb_array_elements(live) g where g->>'id'=c->>'game_id';
    replacement=old is not null and (old->>'home_team' is distinct from c->>'home_team' or old->>'away_team' is distinct from c->>'away_team');
    changed=old is null or replacement or not (old->>'selected_for_pool')::boolean
      or old->>'favorite_team' is distinct from c->>'favorite_team' or (old->>'spread')::numeric is distinct from (c->>'spread')::numeric
      or (old->>'kickoff_at')::timestamptz is distinct from (c->>'kickoff_at')::timestamptz or old->>'venue' is distinct from c->>'venue';
    if changed then
      if coalesce(c->>'issue','')<>'' and coalesce(c->>'manual_override','false')<>'true' then raise exception 'Resolve unavailable source data with Edit game before republishing'; end if;
      if coalesce(trim(c->>'home_team'),'')='' or coalesce(trim(c->>'away_team'),'')='' or c->>'home_team'=c->>'away_team'
        or c->>'favorite_team' is null or c->>'favorite_team' not in(c->>'home_team',c->>'away_team')
        or c->>'spread' is null or not ((c->>'spread')::numeric<0) or (c->>'spread')::numeric='-Infinity'::numeric
        or c->>'kickoff_at' is null or not isfinite((c->>'kickoff_at')::timestamptz) then raise exception 'Resolve the matchup, favorite, negative spread and kickoff for each changed game'; end if;
      if (old is null or replacement or not (old->>'selected_for_pool')::boolean) and (c->>'kickoff_at')::timestamptz<=w.picks_due_at then raise exception 'A new selected game starts before the unchanged picks deadline'; end if;
      changes=changes || jsonb_build_array(jsonb_build_object('action',case when old is null then 'add' when replacement then 'replace' else 'update' end,'game_id',old->'id','before',old,'after',c));
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(d.candidates) candidate_row where d.selected_ids ? (candidate_row->>'id') group by candidate_row->>'home_team',candidate_row->>'away_team',(candidate_row->>'kickoff_at')::timestamptz having count(*)>1) then raise exception 'The same matchup and kickoff is selected twice'; end if;
  ids='[]';
  for item in select x from jsonb_array_elements(changes) x loop
    select count(*) into affected from public.pool_picks where game_id=(item->>'game_id')::bigint;
    ids=ids || jsonb_build_array(item || jsonb_build_object('pick_count',affected));
  end loop;
  changes=ids;
  token=md5(changes::text || d.version::text || live::text);
  if p_action='review' then return jsonb_build_object('changes',changes,'token',token,'version',d.version); end if;
  if p_payload->>'token' is distinct from token then raise exception 'Games or affected pick counts changed. Review again before republishing'; end if;
  if exists(select 1 from jsonb_array_elements(changes) x where (x->>'pick_count')::integer>0) and p_payload->>'acknowledge_picks' is distinct from 'true' then raise exception 'Acknowledge the warning about existing picks before republishing'; end if;
  insert into public.pool_college_revision_audit(week_id,actor,before_games,changes) values(w.id,p_actor,live,changes);
  for item in select x from jsonb_array_elements(changes) x loop
    c=item->'after';
    if item->>'action' in ('remove','replace') then
      update public.pool_games set selected_for_pool=false where id=(item->>'game_id')::bigint and week_id=w.id and sport='college';
    end if;
    if item->>'action' in ('add','replace') then
      insert into public.pool_games(week_id,sport,game_date,kickoff_at,venue,home_team,away_team,favorite_team,spread,point_value,selected_for_pool,published)
        values(w.id,'college',((c->>'kickoff_at')::timestamptz at time zone 'America/New_York')::date,(c->>'kickoff_at')::timestamptz,c->>'venue',c->>'home_team',c->>'away_team',c->>'favorite_team',(c->>'spread')::numeric,1,true,true);
    elsif item->>'action'='update' then
      update public.pool_games set kickoff_at=(c->>'kickoff_at')::timestamptz,
        game_date=case when kickoff_at is distinct from (c->>'kickoff_at')::timestamptz then ((c->>'kickoff_at')::timestamptz at time zone 'America/New_York')::date else game_date end,
        venue=c->>'venue',favorite_team=c->>'favorite_team',spread=(c->>'spread')::numeric,selected_for_pool=true
        where id=(item->>'game_id')::bigint and week_id=w.id and sport='college';
    end if;
  end loop;
  update public.pool_college_revisions set published_at=now(),version=version+1,updated_at=now() where week_id=w.id returning * into d;
  return to_jsonb(d);
end $$;
revoke all on function public.manage_college_revision(text,uuid,bigint,integer,jsonb) from public,anon,authenticated;
grant execute on function public.manage_college_revision(text,uuid,bigint,integer,jsonb) to service_role;
