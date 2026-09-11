const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const instant = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const easternDate = value => new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));

// Only exact provider names/aliases are matched. Never fuzzy-match a betting line.
export function buildCandidates(schedule, teams, odds, week, previous = [], now = Date.now()) {
  if (![schedule, teams, odds].every(Array.isArray)) throw new Error('Unexpected provider response');
  const aliases = new Map();
  for (const team of teams) {
    const names = [team.school, ...(team.alternateNames || [])].filter(Boolean);
    for (const name of [...names, ...names.map(n => team.mascot ? n+' '+team.mascot : n)]) {
      const key=normalize(name);
      const ids=aliases.get(key) || new Set(); ids.add(String(team.id)); aliases.set(key,ids);
    }
  }
  const identify = name => { const ids=aliases.get(normalize(name)); return ids?.size===1 ? [...ids][0] : null; };
  const cutoff=Date.parse(week.picks_due_at);
  // Date window is derived from the pool's deadlines, not a provider's week numbering.
  const end=cutoff+4*86400000;
  const candidates=[];
  for (const game of schedule) {
    const kickoff=instant(game.startDate);
    if (!kickoff || Date.parse(kickoff)<cutoff || Date.parse(kickoff)>=end || game.completed) continue;
    if (!game.id || !game.homeTeam || !game.awayTeam) throw new Error('Incomplete schedule response');
    const matching=odds.filter(e => identify(e.home_team)===String(game.homeId) && identify(e.away_team)===String(game.awayId)
      && instant(e.commence_time) && easternDate(e.commence_time)===easternDate(kickoff));
    const row={id:String(game.id),home_team:game.homeTeam,away_team:game.awayTeam,venue:game.venue || null,
      kickoff_at:game.startTimeTBD ? null : kickoff,scheduled_date:easternDate(kickoff),favorite_team:null,spread:null,
      bookmaker:'DraftKings',odds_event_id:null,line_updated_at:null,issue:''};
    const event=matching.length===1 ? matching[0] : null;
    if (!event) row.issue=matching.length>1 ? 'Ambiguous provider match' : 'No matching odds event';
    else {
      row.odds_event_id=event.id;
      const book=event.bookmakers?.find(b=>b.key==='draftkings');
      const market=book?.markets?.find(m=>m.key==='spreads');
      const home=market?.outcomes?.find(o=>o.name===event.home_team);
      const away=market?.outcomes?.find(o=>o.name===event.away_team);
      row.line_updated_at=instant(market?.last_update || book?.last_update);
      if (typeof home?.point!=='number' || typeof away?.point!=='number' || !Number.isFinite(home.point) || !Number.isFinite(away.point) || home.point!==-away.point) row.issue='Spread unavailable';
      else if (home.point===0) row.issue='Pick’em: automatic-favorite rule needs resolution';
      else if (!row.line_updated_at || now-Date.parse(row.line_updated_at)>86400000 || Date.parse(row.line_updated_at)>now+300000) row.issue='Spread timestamp is missing or stale';
      else {
        row.favorite_team=home.point<0 ? game.homeTeam : game.awayTeam;
        row.spread=Math.min(home.point,away.point);
      }
      if (!game.startTimeTBD && Math.abs(Date.parse(kickoff)-Date.parse(event.commence_time))>15*60000) row.issue='Providers disagree on kickoff time';
    }
    if (game.startTimeTBD) row.issue='Kickoff time TBD';
    candidates.push(row);
  }
  // Preserve disappeared rows so saved selections are never silently lost.
  for (const row of previous) if (!candidates.some(c=>c.id===row.id)) candidates.push({...row,issue:'No longer in the upcoming schedule'});
  if (new Set(candidates.map(c=>c.id)).size!==candidates.length) throw new Error('Duplicate schedule game IDs');
  return candidates.sort((a,b)=>(a.kickoff_at || a.scheduled_date).localeCompare(b.kickoff_at || b.scheduled_date));
}

export async function fetchCandidates(week, previous, env, fetcher=fetch) {
  const cfbd=env('CFBD_API_KEY'), oddsKey=env('ODDS_API_KEY');
  if (!cfbd || !oddsKey) throw new Error('Import setup needed: add CFBD_API_KEY and ODDS_API_KEY to Supabase Edge Function secrets.');
  async function get(url,headers,label) {
    let response;
    try { response=await fetcher(url,{headers,signal:AbortSignal.timeout(20000)}); }
    catch { throw new Error(label+' is unavailable. The saved draft has not changed.'); }
    if (!response.ok) throw new Error(label+' request failed ('+response.status+'). Check the provider key and quota.');
    const body=await response.json();
    if (!Array.isArray(body)) throw new Error(label+' returned an unexpected response.');
    return body;
  }
  const [schedule,teams,odds]=await Promise.all([
    get('https://api.collegefootballdata.com/games?year='+encodeURIComponent(week.season)+'&seasonType=regular',{Authorization:'Bearer '+cfbd},'CollegeFootballData schedule'),
    get('https://api.collegefootballdata.com/teams',{Authorization:'Bearer '+cfbd},'CollegeFootballData teams'),
    get('https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds?apiKey='+encodeURIComponent(oddsKey)+'&bookmakers=draftkings&markets=spreads&dateFormat=iso',{},'The Odds API')
  ]);
  return buildCandidates(schedule,teams,odds,week,previous);
}
