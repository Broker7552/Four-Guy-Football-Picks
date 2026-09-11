begin;
do $$
declare actor uuid; player uuid:='00000000-0000-4000-8000-000000407552'; r jsonb; picks jsonb;
begin
  select admin_user_id into actor from public.pool_settings where id=1;
  insert into auth.users(id) values(player);
  insert into public.pool_members(user_id,display_name,role) values(player,'Ross','player');
  insert into public.pool_weeks(id,week_number,season,status,representative_user_id,spread_lock_at,picks_due_at,picks_visible_at)
    overriding system value values(-507552,99,2099,'published',actor,now()-interval '1 day',now()+interval '7 days',now()+interval '7 days 1 second');
  insert into public.pool_games(id,week_id,sport,game_date,kickoff_at,home_team,away_team,favorite_team,spread,selected_for_pool,published)
    overriding system value values(-507552,-507552,'college',current_date+8,now()+interval '8 days','Test Home','Test Away','Test Home',-3,true,true),(-507553,-507552,'nfl',current_date+8,now()+interval '8 days','NFL Home','NFL Away','NFL Home',-4,true,true);
  picks=jsonb_build_array(jsonb_build_object('game_id',-507552,'picked_team','Test Away'));
  begin
    perform public.manage_manual_picks('review',player,actor,-507552,picks);
    raise exception 'TEST non-admin was accepted';
  exception when others then if sqlerrm<>'Administrator access required' then raise; end if; end;
  r=public.manage_manual_picks('review',actor,player,-507552,picks);
  if r->>'existing_count'<>'0' or r ? 'picked_team' then raise exception 'TEST incorrect review'; end if;
  perform public.manage_manual_picks('save',actor,player,-507552,picks,r->>'token');
  if not exists(select 1 from public.pool_picks where game_id=-507552 and user_id=player and picked_team='Test Away') then raise exception 'TEST target player pick not saved'; end if;
  if exists(select 1 from public.pool_picks where game_id=-507552 and user_id=actor) then raise exception 'TEST actor pick was changed'; end if;
  picks=jsonb_build_array(jsonb_build_object('game_id',-507552,'picked_team','Test Home'));
  r=public.manage_manual_picks('review',actor,player,-507552,picks);
  if r->>'existing_count'<>'1' or r::text like '%Test Away%' then raise exception 'TEST privacy or warning failure'; end if;
  begin
    perform public.manage_manual_picks('save',actor,player,-507552,picks,r->>'token');
    raise exception 'TEST replacement acknowledgement bypassed';
  exception when others then if sqlerrm<>'Confirm replacement of existing picks' then raise; end if; end;
  perform public.manage_manual_picks('save',actor,player,-507552,picks,r->>'token',true);
  begin
    perform public.manage_manual_picks('save',actor,player,-507552,picks,r->>'token',true);
    raise exception 'TEST stale token accepted';
  exception when others then if sqlerrm<>'Picks or games changed. Review again before saving' then raise; end if; end;
  picks=jsonb_build_array(jsonb_build_object('game_id',-507553,'picked_team','NFL Away'));
  r=public.manage_manual_picks('review',actor,player,-507552,picks);
  perform public.manage_manual_picks('save',actor,player,-507552,picks,r->>'token');
  if not exists(select 1 from public.pool_picks where game_id=-507552 and user_id=player and picked_team='Test Home') then raise exception 'TEST omitted pick changed'; end if;
  begin
    perform public.manage_manual_picks('review',actor,player,-507552,'[{"game_id":-507553,"picked_team":"Invalid"}]');
    raise exception 'TEST invalid team accepted';
  exception when others then if sqlerrm<>'Choose a valid side for a currently published game' then raise; end if; end;
  update public.pool_weeks set picks_due_at=now()-interval '1 second' where id=-507552;
  begin
    perform public.manage_manual_picks('review',actor,player,-507552,picks);
    raise exception 'TEST deadline bypassed';
  exception when others then if sqlerrm<>'Picks are locked for this week' then raise; end if; end;
end $$;
rollback;
select 'Passed: administrator authorization, entry for another member, private review, replacement acknowledgement, stale tokens, omitted picks, invalid teams and deadline enforcement. All fixtures rolled back.' as result;

