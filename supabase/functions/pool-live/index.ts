const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const norm=(v='')=>String(v).toLowerCase().replace(/[^a-z0-9]/g,'');

function espnStatus(event:any){
  const s=event?.status?.type||{};
  return {state:s.state||'pre',completed:!!s.completed,detail:s.shortDetail||s.detail||''};
}
function competitionTeams(event:any){
  const comp=event?.competitions?.[0];
  const cs=comp?.competitors||[];
  const home=cs.find((x:any)=>x.homeAway==='home');
  const away=cs.find((x:any)=>x.homeAway==='away');
  return {home,away,competition:comp};
}
function networkForEvent(event:any){
  const c=event?.competitions?.[0]||{};
  const broadcasts=(c.broadcasts||[]).flatMap((b:any)=>b.names||[]);
  const geo=(c.geoBroadcasts||[]).filter((b:any)=>['TV','Streaming'].includes(b.type?.shortName)).map((b:any)=>b.media?.shortName);
  return [...broadcasts,...geo,c.broadcast,event?.broadcast].find((x:any)=>typeof x==='string'&&x.trim())||null;
}
function teamNames(c:any){
  const t=c?.team||{};
  return [t.displayName,t.shortDisplayName,t.name,t.abbreviation,t.location].filter(Boolean).map(norm);
}
function matchEvent(game:any, events:any[]){
  const gh=norm(game.home_team), ga=norm(game.away_team);
  let best=null;
  for(const e of events){
    const {home,away}=competitionTeams(e);
    if(!home||!away) continue;
    const hn=teamNames(home), an=teamNames(away);
    const exactHome=hn.includes(gh), exactAway=an.includes(ga);
    const looseHome=hn.some((x:string)=>x===gh||x.includes(gh)||gh.includes(x));
    const looseAway=an.some((x:string)=>x===ga||x.includes(ga)||ga.includes(x));
    const score=(exactHome?3:looseHome?1:0)+(exactAway?3:looseAway?1:0);
    if(score>=6) return e;
    if(score>=2 && (!best||score>best.score)) best={e,score};
  }
  return best?.score>=4?best.e:null;
}
async function scoreboard(sport:string,dates:string[]){
  const league=sport==='nfl'?'nfl':'college-football';
  const all:any[]=[];
  for(const d of [...new Set(dates)]){
    try{
      const url=`https://site.api.espn.com/apis/site/v2/sports/football/${league}/scoreboard?dates=${d.replaceAll('-','')}&limit=250`;
      const r=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Four-Guy-Football-Picks/1.0'}});
      if(r.ok){const j=await r.json(); if(Array.isArray(j.events)) all.push(...j.events);}
    }catch{}
  }
  return all;
}
function gameResult(game:any,event:any){
  if(!event) return {status:'unavailable',status_detail:'Score unavailable',home_score:null,away_score:null,completed:false,ats_winner:null,ats_margin:null};
  const {home,away}=competitionTeams(event);
  const st=espnStatus(event);
  const hs=Number.parseInt(home?.score,10), as=Number.parseInt(away?.score,10);
  const homeScore=Number.isFinite(hs)?hs:null, awayScore=Number.isFinite(as)?as:null;
  let atsWinner=null, atsMargin=null;
  if(homeScore!==null&&awayScore!==null&&game.spread!==null){
    const spread=Number(game.spread);
    if(game.favorite_team===game.home_team){
      const adjusted=homeScore+spread-awayScore; atsMargin=adjusted; atsWinner=adjusted>0?game.home_team:adjusted<0?game.away_team:'Push';
    } else if(game.favorite_team===game.away_team){
      const adjusted=awayScore+spread-homeScore; atsMargin=adjusted; atsWinner=adjusted>0?game.away_team:adjusted<0?game.home_team:'Push';
    }
  }
  return {status:st.state,status_detail:st.detail,home_score:homeScore,away_score:awayScore,completed:st.completed,ats_winner:atsWinner,ats_margin:atsMargin};
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return reply({error:'POST required'},405);
  const url=Deno.env.get('SUPABASE_URL'), key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization=req.headers.get('Authorization');
  if(!url||!key) return reply({error:'Server configuration incomplete'},503);
  if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in required'},401);
  const h={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  const userRes=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:authorization},signal:AbortSignal.timeout(10000)});
  if(!userRes.ok) return reply({error:'Sign in required'},401);
  const user=await userRes.json();
  const memberRes=await fetch(url+'/rest/v1/pool_members?user_id=eq.'+encodeURIComponent(user.id)+'&select=display_name,role',{headers:h});
  const members=await memberRes.json();
  if(!memberRes.ok||!members?.[0]) return reply({error:'Pool membership required'},403);
  const input=await req.json().catch(()=>({}));
  const weekNumber=Number.isInteger(input.week_number)?input.week_number:2;
  const db=async(path:string)=>{const r=await fetch(url+'/rest/v1/'+path,{headers:h,signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok)throw new Error(j.message||'Database request failed');return j;};
  try{
    const weeks=await db(`pool_weeks?season=eq.2026&week_number=eq.${weekNumber}&select=*`);
    const week=weeks[0]; if(!week) return reply({error:'Week not found'},404);
    if(!['published','open','picks_open','graded'].includes(week.status)) return reply({error:'Week picks are not published yet'},409);
    // Resolve unanimous picks once after the deadline before exposing live picks.
    if(week.picks_due_at && (Date.now()>=new Date(week.picks_due_at).getTime() || week.picks_closed_early) && week.status!=='graded'){
      const flip=await fetch(url+'/rest/v1/rpc/apply_pool_anti_clone_flips',{
        method:'POST',headers:h,body:JSON.stringify({p_week_id:week.id}),signal:AbortSignal.timeout(15000)
      });
      if(!flip.ok){const problem=await flip.json().catch(()=>({}));throw new Error(problem.message||'Unable to apply the unanimous-pick rule');}
    }
    const games=await db(`pool_games?week_id=eq.${week.id}&selected_for_pool=eq.true&select=id,sport,home_team,away_team,favorite_team,spread,point_value,kickoff_at,venue&order=kickoff_at`);
    const memberRows=await db(`pool_members?select=user_id,display_name`);
    const ids=games.map((g:any)=>g.id).join(',')||'0';
    const rawPicks=await db(`pool_picks?game_id=in.(${ids})&select=game_id,user_id,picked_team`);
    const picks=rawPicks.map((p:any)=>({game_id:p.game_id,participant_name:memberRows.find((m:any)=>m.user_id===p.user_id)?.display_name||'',picked_team:p.picked_team})).filter((p:any)=>p.participant_name);
    const dates=games.map((g:any)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(g.kickoff_at)));
    const collegeDates=games.filter((g:any)=>g.sport==='college').map((g:any,i:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(g.kickoff_at)));
    const nflDates=games.filter((g:any)=>g.sport==='nfl').map((g:any)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(g.kickoff_at)));
    const [collegeEvents,nflEvents]=await Promise.all([scoreboard('college',collegeDates),scoreboard('nfl',nflDates)]);
    const rows=games.map((g:any)=>{const e=matchEvent(g,g.sport==='nfl'?nflEvents:collegeEvents);return {...g,...gameResult(g,e),network:networkForEvent(e)};});
    const participants=['Scott','Ross','Ken','Jim'];
    const snapshots=week.status==='graded'?await db(`pool_week_result_snapshots?week_id=eq.${week.id}&select=participant_name,wins,losses,pushes,points,payout`):[];
    const calculated=participants.map(name=>{
      let wins=0,losses=0,pushes=0,points=0,pending=0;
      for(const g of rows){
        const p=picks.find((x:any)=>x.game_id===g.id&&x.participant_name===name);
        if(!p){pending++;continue;} if(!g.completed){continue;} if(g.ats_winner==='Push'){pushes++;points+=1;continue;} const win=p.picked_team===g.ats_winner; if(win){wins++;points+=Number(g.point_value||1);} else losses++;
      }
      return {name,wins,losses,pushes,points,missing:picks.filter((x:any)=>x.participant_name===name).length<games.length};
    }).sort((a,b)=>b.points-a.points||b.wins-a.wins||a.losses-b.losses);
    const standings=snapshots.length?snapshots.map((s:any)=>({name:s.participant_name,wins:s.wins,losses:s.losses,pushes:s.pushes,points:s.points,payout:Number(s.payout)})):calculated;
    return reply({week:{id:week.id,week_number:week.week_number,season:week.season,published_at:week.published_at||null},week_number:week.week_number,viewer:members[0].display_name,participants,games:rows,picks,standings,refreshed_at:new Date().toISOString()});
  }catch(e){return reply({error:e instanceof Error?e.message:'Unable to load live week'},500);}
});
