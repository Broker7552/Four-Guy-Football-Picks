/* Records and logos for the actual scheduled games on the picks roster. */
(()=>{
  const cache=new Map();
  const clean=name=>String(name||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const dateKey=value=>{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
    const get=type=>parts.find(part=>part.type===type)?.value;
    return get('year')+get('month')+get('day');
  };
  const sportPath=sport=>sport==='nfl'?'football/nfl':'football/college-football';
  function schedule(sport,date){
    const key=sport+':'+date;
    if(!cache.has(key)){
      const url='https://site.api.espn.com/apis/site/v2/sports/'+sportPath(sport)+'/scoreboard?dates='+date+'&limit=500';
      cache.set(key,fetch(url).then(r=>{if(!r.ok)throw new Error('Schedule unavailable');return r.json()}).then(data=>data.events||[]).catch(()=>[]));
    }
    return cache.get(key);
  }
  function teamMatches(name,team){
    return [team.school,team.location,team.displayName,team.shortDisplayName].some(alias=>clean(alias)===clean(name));
  }
  function competitor(event,name){
    return event.competitions?.[0]?.competitors?.find(c=>teamMatches(name,c.team||{}));
  }
  function updateCard(game,events){
    const card=document.querySelector('#games .card[data-game-id="'+game.id+'"]');
    if(!card)return;
    // Match both sides so a common school name cannot pick an unrelated event.
    const event=events.find(e=>competitor(e,game.away_team)&&competitor(e,game.home_team));
    if(!event)return;
    card.querySelectorAll('button.pick').forEach(button=>{
      const side=competitor(event,button.dataset.team);
      if(!side)return;
      const overall=side.records?.find(r=>r.name==='overall'||r.abbreviation==='overall')?.summary;
      const record=button.querySelector('.fg-team-record');
      if(record&&overall)record.textContent='Record: '+overall;
      const url=side.team?.logo;
      if(url){
        let logo=button.querySelector('.fg-team-logo');
        if(!logo){logo=document.createElement('img');logo.className='fg-team-logo';logo.alt='';logo.loading='lazy';button.prepend(logo);}
        if(logo.src!==url)logo.src=url;
      }
    });
  }
  async function refresh(games){
    const current=[...(games||[])];
    for(const game of current){
      const card=document.querySelector('#games .card[data-game-id="'+game.id+'"]');
      if(!card)continue;
      card.querySelectorAll('.fg-team-record').forEach(record=>{record.textContent='Record: —'});
      const kickoff=card.querySelector('.muted');
      if(kickoff&&game.kickoff_at){
        const day=new Date(game.kickoff_at).toLocaleDateString('en-US',{timeZone:'America/New_York',weekday:'long'});
        if(!kickoff.textContent.includes(day))kickoff.textContent=kickoff.textContent.replace(/^Kickoff:\s*(?:\w+\s*·\s*)?/, 'Kickoff: '+day+' · ');
      }
    }
    await Promise.all(current.filter(g=>g.kickoff_at).map(async game=>{
      const events=await schedule(game.sport,dateKey(game.kickoff_at));
      updateCard(game,events);
    }));
  }
  window.refreshRosterMetadata=refresh;
  if(window.fgRosterGames)refresh(window.fgRosterGames);
  if(typeof module!=='undefined'&&module.exports)module.exports={clean,dateKey,teamMatches,competitor};
})();
