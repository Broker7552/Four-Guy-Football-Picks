const normalize = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The pool's week is anchored to its pick deadline, not the NFL's week number.
// Include every game after the deadline through the following Monday night.
export function buildNflGames(events, odds, week) {
  if (!Array.isArray(events) || !Array.isArray(odds)) throw new Error('NFL provider returned an unexpected response');
  const start=Date.parse(week.picks_due_at), end=start+6*86400000;
  const games=[];
  for (const event of events) {
    const kickoff=Date.parse(event.date);
    if (!Number.isFinite(kickoff) || kickoff<=start || kickoff>=end) continue;
    const teams=event.competitions?.[0]?.competitors || [];
    const home=teams.find(t=>t.homeAway==='home')?.team?.displayName;
    const away=teams.find(t=>t.homeAway==='away')?.team?.displayName;
    if (!home || !away) throw new Error('NFL schedule is missing teams');
    const matching=odds.filter(o=>normalize(o.home_team)===normalize(home) && normalize(o.away_team)===normalize(away));
    if (matching.length!==1) throw new Error('NFL spread missing or ambiguous for '+away+' at '+home);
    const market=matching[0].bookmakers?.find(b=>b.key==='draftkings')?.markets?.find(m=>m.key==='spreads');
    const h=market?.outcomes?.find(o=>normalize(o.name)===normalize(home))?.point;
    const a=market?.outcomes?.find(o=>normalize(o.name)===normalize(away))?.point;
    if (!Number.isFinite(h) || !Number.isFinite(a) || h!==-a || h===0) throw new Error('NFL spread unavailable for '+away+' at '+home);
    const day=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short'}).format(kickoff);
    const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(kickoff));
    games.push({week_id:week.id,sport:'nfl',game_date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(kickoff),kickoff_at:new Date(kickoff).toISOString(),venue:event.competitions?.[0]?.venue?.fullName || null,home_team:home,away_team:away,favorite_team:h<0?home:away,spread:Math.min(h,a),point_value:day==='Mon'||(day==='Sun'&&hour>=20)?2:1,selected_for_pool:true,published:true});
  }
  if (!games.length || new Set(games.map(g=>g.away_team+'|'+g.home_team)).size!==games.length) throw new Error('NFL schedule is empty or duplicated');
  return games.sort((a,b)=>a.kickoff_at.localeCompare(b.kickoff_at));
}

export async function fetchNflGames(week, env, fetcher=fetch) {
  const key=env('ODDS_API_KEY');
  if (!key) throw new Error('NFL import requires ODDS_API_KEY');
  const start=Date.parse(week.picks_due_at), events=[];
  // ESPN's date-filtered scoreboard has the complete schedule, even when an
  // odds market is unavailable. Never silently omit a scheduled game.
  const dates=new Set();
  for (let i=0;i<7;i++) dates.add(new Date(start+i*86400000).toISOString().slice(0,10).replaceAll('-',''));
  for (const date of dates) {
    const response=await fetcher('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates='+date+'&limit=250',{signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error('NFL schedule request failed ('+response.status+')');
    const body=await response.json();
    if (!Array.isArray(body.events)) throw new Error('NFL schedule response is incomplete');
    events.push(...body.events);
  }
  const oddsResponse=await fetcher('https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?apiKey='+encodeURIComponent(key)+'&bookmakers=draftkings&markets=spreads&dateFormat=iso',{signal:AbortSignal.timeout(20000)});
  if (!oddsResponse.ok) throw new Error('NFL odds request failed ('+oddsResponse.status+')');
  const unique=[...new Map(events.map(e=>[e.id,e])).values()];
  return buildNflGames(unique,await oddsResponse.json(),week);
}
