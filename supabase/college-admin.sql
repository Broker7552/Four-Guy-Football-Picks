-- Additive college draft workflow. Existing pool rows and policies are unchanged.
create table public.pool_college_drafts (
  week_id bigint primary key references public.pool_weeks(id),
  version integer not null default 0,
  candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(candidates) = 'array'),
  selected_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_ids) = 'array'),
  refreshed_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.pool_college_drafts enable row level security;
revoke all on public.pool_college_drafts from public, anon, authenticated;
grant select on public.pool_college_drafts to authenticated;
grant all on public.pool_college_drafts to service_role;
create policy college_drafts_admin_read on public.pool_college_drafts for select to authenticated using (public.is_pool_admin());

-- Only the authenticated Edge Function's server client can call this RPC.
-- SECURITY INVOKER: no new privileged function callable by browser clients.
create function public.manage_college_draft(p_action text, p_actor uuid, p_week_id bigint default null, p_version integer default null, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  w public.pool_weeks%rowtype;
  d public.pool_college_drafts%rowtype;
  g jsonb;
  ids jsonb;
  n integer;
begin
  -- Lock the administrator records so authorization cannot change mid-transaction.
  perform 1 from public.pool_settings s join public.pool_members m on m.user_id=s.admin_user_id
    where s.id=1 and s.admin_user_id=p_actor and m.role='admin' for share of s,m;
  if not found then raise exception 'Administrator access required'; end if;

  if p_action='prepare_next' then
    perform pg_advisory_xact_lock(407552);
    select * into w from public.pool_weeks order by season desc,week_number desc limit 1 for update;
    if w.id is null or w.spread_lock_at is null or w.picks_due_at is null or w.picks_visible_at is null then
      raise exception 'A week with configured deadlines is required';
    end if;
    if w.status='setup' then return to_jsonb(w); end if;
    -- Preserve the configured Eastern wall-clock deadlines across DST changes.
    insert into public.pool_weeks (season,week_number,representative_user_id,spread_lock_at,picks_due_at,picks_visible_at,status)
      values (w.season,w.week_number+1,p_actor,
        ((w.spread_lock_at at time zone 'America/New_York')+interval '7 days') at time zone 'America/New_York',
        ((w.picks_due_at at time zone 'America/New_York')+interval '7 days') at time zone 'America/New_York',
        ((w.picks_visible_at at time zone 'America/New_York')+interval '7 days') at time zone 'America/New_York','setup') returning * into w;
    insert into public.pool_college_drafts(week_id) values(w.id);
    return to_jsonb(w);
  end if;

  select * into w from public.pool_weeks where id=p_week_id for update;
  if w.id is null then raise exception 'Week not found'; end if;
  if w.week_number<=2 or w.status<>'setup' then raise exception 'Only future setup weeks can be edited'; end if;
  if w.spread_lock_at is null or w.picks_due_at is null or w.picks_visible_at is null then raise exception 'Week deadlines are not configured'; end if;
  if now()>=w.spread_lock_at then raise exception 'The spread-lock deadline has passed'; end if;
  insert into public.pool_college_drafts(week_id) values(w.id) on conflict do nothing;
  select * into d from public.pool_college_drafts where week_id=w.id for update;
  if d.published_at is not null then raise exception 'College games are already published'; end if;
  if p_version is distinct from d.version then raise exception 'The draft changed. Reload it before continuing'; end if;

  if p_action='refresh' then
    if jsonb_typeof(p_payload->'candidates') is distinct from 'array' then raise exception 'Invalid candidate list'; end if;
    if exists(select 1 from jsonb_array_elements(p_payload->'candidates') c group by c->>'id' having count(*)>1)
       or exists(select 1 from jsonb_array_elements(p_payload->'candidates') c where coalesce(c->>'id','')='') then
      raise exception 'Duplicate or missing source game IDs';
    end if;
    update public.pool_college_drafts set candidates=p_payload->'candidates',refreshed_at=now(),version=version+1,updated_at=now() where week_id=w.id returning * into d;
  elsif p_action='save' then
    ids=p_payload->'selected_ids';
    if jsonb_typeof(ids) is distinct from 'array' then raise exception 'Invalid selections'; end if;
    if exists(select 1 from jsonb_array_elements(ids) i where jsonb_typeof(i)<>'string' or not exists(select 1 from jsonb_array_elements(d.candidates) c where c->'id'=i)) then
      raise exception 'A selected game is not in this draft';
    end if;
    select coalesce(jsonb_agg(distinct i),'[]'::jsonb) into ids from jsonb_array_elements(ids) i;
    update public.pool_college_drafts set selected_ids=ids,version=version+1,updated_at=now() where week_id=w.id returning * into d;
  elsif p_action='publish' then
    -- Never delete, replace or update existing games (including NFL).
    if exists(select 1 from public.pool_games where week_id=w.id and sport='college') then
      raise exception 'This week already contains college games; no existing games were changed';
    end if;
    if d.refreshed_at is null or d.refreshed_at < now()-interval '24 hours' then raise exception 'Refresh the draft before publishing'; end if;
    for g in select c from jsonb_array_elements(d.candidates) c where d.selected_ids ? (c->>'id') loop
      if coalesce(g->>'issue','')<>'' or g->>'kickoff_at' is null or g->>'favorite_team' is null or g->>'spread' is null then
        raise exception 'Resolve unavailable kickoff times, lines or matches before publishing';
      end if;
      if (g->>'spread')::numeric>=0 or g->>'favorite_team' not in (g->>'home_team',g->>'away_team') then raise exception 'Invalid favorite or spread'; end if;
      if (g->>'kickoff_at')::timestamptz<=w.picks_due_at then raise exception 'A selected game starts before picks are due'; end if;
      if (g->>'line_updated_at')::timestamptz < now()-interval '24 hours' or g->>'line_updated_at' is null then raise exception 'A selected line is stale; refresh before publishing'; end if;
    end loop;
    select count(*) into n from jsonb_array_elements(d.candidates) c where d.selected_ids ? (c->>'id');
    if n<>jsonb_array_length(d.selected_ids) then raise exception 'A selected game is missing; reload the draft'; end if;
    insert into public.pool_games(week_id,sport,game_date,kickoff_at,venue,home_team,away_team,favorite_team,spread,point_value,selected_for_pool,published)
      select w.id,'college',((c->>'kickoff_at')::timestamptz at time zone 'America/New_York')::date,
        (c->>'kickoff_at')::timestamptz,c->>'venue',c->>'home_team',c->>'away_team',c->>'favorite_team',(c->>'spread')::numeric,1,true,true
      from jsonb_array_elements(d.candidates) c where d.selected_ids ? (c->>'id');
    update public.pool_weeks set status='published' where id=w.id;
    update public.pool_college_drafts set published_at=now(),version=version+1,updated_at=now() where week_id=w.id returning * into d;
  else raise exception 'Unknown action';
  end if;
  return to_jsonb(d);
end;
$$;
revoke all on function public.manage_college_draft(text,uuid,bigint,integer,jsonb) from public,anon,authenticated;
grant execute on function public.manage_college_draft(text,uuid,bigint,integer,jsonb) to service_role;
