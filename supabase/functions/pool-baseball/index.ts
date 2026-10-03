const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const names=['Ross','Scott','Jim','Ken'];
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),authorization=req.headers.get('Authorization');
 if(!url||!key)return reply({error:'Server configuration incomplete'},503);
 if(!authorization?.startsWith('Bearer '))return reply({error:'Sign in required'},401);
 const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
 const userResponse=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:authorization},signal:AbortSignal.timeout(10000)});
 if(!userResponse.ok)return reply({error:'Sign in required'},401);
 const user=await userResponse.json();
 const db=async(path:string,method='GET',body?:unknown)=>{const r=await fetch(url+'/rest/v1/'+path,{method,headers:method==='POST'&&path.startsWith('pool_baseball_picks')?{...headers,Prefer:'resolution=merge-duplicates'}:method==='PATCH'?{...headers,Prefer:'return=representation'}:headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});if(!r.ok){const x=await r.json().catch(()=>({}));throw Error(x.message||'Database request failed')}const text=await r.text();return text?JSON.parse(text):null};
 try{
  const members=await db('pool_members?select=user_id,display_name');
  if(!members.some((m:any)=>m.user_id===user.id))return reply({error:'Pool membership required'},403);
  const settings=await db('pool_settings?id=eq.1&select=admin_user_id');const admin=settings?.[0]?.admin_user_id===user.id;
  const input=await req.json().catch(()=>({}));
  if(input.action==='save_pick'){
   if(!admin)return reply({error:'Administrator only'},403);
   const series=(await db('pool_baseball_series?id=eq.'+Number(input.series_id)+'&select=*'))?.[0];
   const member=members.find((m:any)=>m.display_name===input.participant_name&&names.includes(m.display_name));
   if(!series||!member||![series.away_mlb_id,series.home_mlb_id].includes(Number(input.picked_mlb_id)))return reply({error:'Invalid series, player, or team'},400);
   if(Date.now()>=new Date(series.lock_at).getTime()||series.winner_mlb_id)return reply({error:'Series picks are locked'},409);
   await db('pool_baseball_picks?on_conflict=series_id,user_id','POST',{series_id:series.id,user_id:member.user_id,picked_mlb_id:Number(input.picked_mlb_id),updated_at:new Date().toISOString()});
  }
  if(input.action==='close_round'){
   if(!admin)return reply({error:'Administrator only'},403);
   if(input.round_key!=='division')return reply({error:'Invalid baseball round'},400);
   const round=await db('pool_baseball_series?season=eq.2026&round_key=eq.division&select=*');
   if(round.length!==4||round.some((s:any)=>Date.now()>=new Date(s.lock_at).getTime()||s.winner_mlb_id))
    return reply({error:'Division Series picks are already locked'},409);
   const saved=await db('pool_baseball_picks?series_id=in.('+round.map((s:any)=>s.id).join(',')+')&select=series_id,user_id');
   const participants=members.filter((m:any)=>names.includes(m.display_name));
   if(participants.length!==4||round.some((s:any)=>participants.some((m:any)=>!saved.some((p:any)=>p.series_id===s.id&&p.user_id===m.user_id))))
    return reply({error:'Enter a pick for Ross, Scott, Jim, and Ken in all four series before closing.'},409);
   const now=new Date().toISOString();
   const updated=await db('pool_baseball_series?season=eq.2026&round_key=eq.division&lock_at=gt.'+encodeURIComponent(now)+'&winner_mlb_id=is.null','PATCH',{lock_at:now});
   if(updated?.length!==round.length)return reply({error:'Could not close every series. Refresh and check the round.'},409);
  }
  let series=await db('pool_baseball_series?season=eq.2026&select=*&order=lock_at');
  // MLB's official postseason schedule supplies final game results. An outage leaves stored results intact.
  let games:any[]=[];let feedError='';
  try{const r=await fetch('https://statsapi.mlb.com/api/v1/schedule?sportId=1&gameTypes=F,D,L,W&startDate=2026-09-29&endDate=2026-10-31',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('MLB schedule unavailable');const feed=await r.json();games=(feed.dates||[]).flatMap((d:any)=>d.games||[])}catch(e){feedError='MLB results temporarily unavailable'}
  for(const s of series){
   if(Date.now()<new Date(s.lock_at).getTime()||s.winner_mlb_id)continue;
   const results=games.filter(g=>g.status?.abstractGameState==='Final'&&[g.teams?.away?.team?.id,g.teams?.home?.team?.id].sort().join(',')===[s.away_mlb_id,s.home_mlb_id].sort().join(','));
   const wins=new Map<number,number>();for(const g of results){const a=g.teams.away,h=g.teams.home;if(a.score===h.score)continue;const winner=a.score>h.score?a.team.id:h.team.id;wins.set(winner,(wins.get(winner)||0)+1)}
   const winner=[...wins].find(([,count])=>count>=s.wins_needed)?.[0]||null;
   try{await db('rpc/settle_baseball_series','POST',{p_series_id:s.id,p_winner_mlb_id:winner})}catch(e){feedError=e instanceof Error?e.message:'Could not settle a series'}
  }
  series=await db('pool_baseball_series?season=eq.2026&select=*&order=lock_at');
  const picks=await db('pool_baseball_picks?select=series_id,user_id,picked_mlb_id,was_anti_clone_flip');
  return reply({series,picks:picks.filter((p:any)=>series.some((s:any)=>s.id===p.series_id)).filter((p:any)=>admin||Date.now()>=new Date(series.find((s:any)=>s.id===p.series_id).lock_at).getTime()).map((p:any)=>({...p,participant_name:members.find((m:any)=>m.user_id===p.user_id)?.display_name})),admin,feedError});
 }catch(e){return reply({error:e instanceof Error?e.message:'Unable to load baseball'},500)}
});
