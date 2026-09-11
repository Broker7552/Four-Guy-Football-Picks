begin;
do $$
declare actor uuid; d jsonb; r jsonb; c jsonb; before_game jsonb; new_id bigint;
begin
  select admin_user_id into actor from public.pool_settings where id=1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  insert into public.pool_weeks(id,week_number,season,status,representative_user_id,spread_lock_at,picks_due_at,picks_visible_at)
    overriding system value values(-407552,99,2099,'published',actor,now()-interval '1 day',now()+interval '7 days',now()+interval '7 days 1 second');
  insert into public.pool_games(id,week_id,sport,game_date,kickoff_at,home_team,away_team,favorite_team,spread,selected_for_pool,published,final_home_score)
    overriding system value values(-407552,-407552,'college',current_date+8,now()+interval '8 days','Test Home','Test Away','Test Home',-3,true,true,21);
  insert into public.pool_games(id,week_id,sport,game_date,kickoff_at,home_team,away_team,favorite_team,spread,selected_for_pool,published)
    overriding system value values(-407553,-407552,'nfl',current_date+8,now()+interval '8 days','NFL Home','NFL Away','NFL Home',-4,true,true);
  begin
    perform public.manage_college_revision('open','00000000-0000-0000-0000-000000000000',-407552);
    raise exception 'TEST unauthorized action accepted';
  exception when others then if sqlerrm<>'Administrator access required' then raise; end if; end;
  d=public.manage_college_revision('open',actor,-407552);
  select to_jsonb(g) into before_game from public.pool_games g where id=-407552;
  if (d->'selected_ids')<> '["db:-407552"]'::jsonb then raise exception 'TEST opening did not preserve selections'; end if;
  c=jsonb_set(d->'candidates','{0,spread}','-7');
  d=public.manage_college_revision('save',actor,-407552,(d->>'version')::integer,jsonb_build_object('candidates',c,'selected_ids',d->'selected_ids'));
  if (select to_jsonb(g) from public.pool_games g where id=-407552)<>before_game then raise exception 'TEST draft changed live data'; end if;
  r=public.manage_college_revision('review',actor,-407552,(d->>'version')::integer);
  -- A pick submitted after review invalidates the review token.
  insert into public.pool_picks(id,game_id,user_id,picked_team) overriding system value values(-407552,-407552,actor,'Test Away');
  begin
    perform public.manage_college_revision('publish',actor,-407552,(d->>'version')::integer,jsonb_build_object('token',r->>'token','acknowledge_picks',true));
    raise exception 'TEST stale review accepted';
  exception when others then if sqlerrm<>'Games or affected pick counts changed. Review again before republishing' then raise; end if; end;
  r=public.manage_college_revision('review',actor,-407552,(d->>'version')::integer);
  if r->'changes'->0->>'pick_count'<>'1' then raise exception 'TEST missing pick warning'; end if;
  begin
    perform public.manage_college_revision('publish',actor,-407552,(d->>'version')::integer,jsonb_build_object('token',r->>'token'));
    raise exception 'TEST warning bypassed';
  exception when others then if sqlerrm<>'Acknowledge the warning about existing picks before republishing' then raise; end if; end;
  perform public.manage_college_revision('publish',actor,-407552,(d->>'version')::integer,jsonb_build_object('token',r->>'token','acknowledge_picks',true));
  if (select spread<>-7 or final_home_score<>21 from public.pool_games where id=-407552) or not exists(select 1 from public.pool_picks where id=-407552 and picked_team='Test Away') then raise exception 'TEST update damaged score or pick'; end if;
  d=public.manage_college_revision('open',actor,-407552);
  c=jsonb_set(d->'candidates','{0,away_team}','"Replacement Away"');
  d=public.manage_college_revision('save',actor,-407552,(d->>'version')::integer,jsonb_build_object('candidates',c,'selected_ids',d->'selected_ids'));
  r=public.manage_college_revision('review',actor,-407552,(d->>'version')::integer);
  if r->'changes'->0->>'action'<>'replace' then raise exception 'TEST replacement not identified'; end if;
  perform public.manage_college_revision('publish',actor,-407552,(d->>'version')::integer,jsonb_build_object('token',r->>'token','acknowledge_picks',true));
  if not exists(select 1 from public.pool_games where id=-407552 and away_team='Test Away' and not selected_for_pool and final_home_score=21) or not exists(select 1 from public.pool_picks where id=-407552 and game_id=-407552) then raise exception 'TEST replacement damaged original'; end if;
  select id into new_id from public.pool_games where week_id=-407552 and away_team='Replacement Away';
  if new_id is null or exists(select 1 from public.pool_picks where game_id=new_id) then raise exception 'TEST replacement inherited picks'; end if;
  d=public.manage_college_revision('open',actor,-407552);
  d=public.manage_college_revision('save',actor,-407552,(d->>'version')::integer,jsonb_build_object('candidates',d->'candidates','selected_ids','[]'::jsonb));
  r=public.manage_college_revision('review',actor,-407552,(d->>'version')::integer);
  perform public.manage_college_revision('publish',actor,-407552,(d->>'version')::integer,jsonb_build_object('token',r->>'token'));
  if exists(select 1 from public.pool_games where week_id=-407552 and sport='college' and selected_for_pool) or not exists(select 1 from public.pool_games where id=new_id) then raise exception 'TEST remove failed'; end if;
  if not exists(select 1 from public.pool_games where id=-407553 and selected_for_pool and spread=-4) then raise exception 'TEST NFL changed'; end if;
  if (select spread_lock_at>=now() or status<>'published' from public.pool_weeks where id=-407552) then raise exception 'TEST week changed'; end if;
end $$;
rollback;
select 'Passed: admin authorization, draft isolation, stale review, pick acknowledgement, updates, replacements, removals, score/pick/NFL/deadline preservation. All test data rolled back.' as result;
