/* Records and logos for the actual scheduled games on the picks roster. */
(()=>{
  const cache=new Map();
  let apPoll;
  const clean=name=>String(name||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const dateKey=value=>{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
    const get=type=>parts.find(part=>part.type===type)?.value;
    return get('year')+get('month')+get('day');
  };
  const sportPath=sport=>sport==='nfl'?'football/nfl':'football/college-football';
  // Confirmed broadcasts for the published Week 5 roster. Schedule metadata
  // supplies broadcasts for later weeks and can change closer to kickoff.
  const confirmed={77:'NFL Network',78:'CBS',79:'FOX',80:'FOX',81:'CBS',82:'FOX',83:'CBS',84:'FOX',85:'CBS',86:'FOX',87:'CBS',88:'CBS',89:'CBS',90:'NBC',91:'ESPN',92:'FOX',93:'ABC',94:'ESPN',95:'ABC',96:'ACC Network',97:'CBS',98:'SEC Network',99:'ABC'};
  function eventNetwork(event){
    const competition=event?.competitions?.[0]||{};
    const broadcasts=(competition.broadcasts||[]).flatMap(b=>b.names||[]);
    const geo=(competition.geoBroadcasts||[]).filter(b=>b.type?.shortName==='TV'||b.type?.shortName==='Streaming').map(b=>b.media?.shortName);
    return [...broadcasts,...geo,competition.broadcast,event?.broadcast].find(x=>typeof x==='string'&&x.trim())||'';
  }
  function gameNetwork(game,event){return confirmed[game.id]||eventNetwork(event)||game.network||game.tv_network||game.broadcast_network||'';}
  window.fgNetworkForGame=gameNetwork;
  function setNetwork(card,network){
    if(!network)return;
    let badge=card.querySelector('.fg-network');
    if(!badge){badge=document.createElement('span');badge.className='fg-network';card.prepend(badge);}
    badge.textContent=network;
  }
  function schedule(sport,date){
    const key=sport+':'+date;
    if(!cache.has(key)){
      const url='https://site.api.espn.com/apis/site/v2/sports/'+sportPath(sport)+'/scoreboard?dates='+date+'&limit=500';
      cache.set(key,fetch(url).then(r=>{if(!r.ok)throw new Error('Schedule unavailable');return r.json()}).then(data=>data.events||[]).catch(()=>[]));
    }
    return cache.get(key);
  }
  function rankings(){
    if(!apPoll){
      apPoll=fetch('https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings')
        .then(r=>{if(!r.ok)throw new Error('Poll unavailable');return r.json()})
        .then(data=>{
          const ap=data.rankings?.find(p=>p.name==='AP Top 25');
          return new Map((ap?.ranks||[]).map(rank=>[String(rank.team.id),rank.current]));
        }).catch(()=>new Map());
    }
    return apPoll;
  }
  function teamMatches(name,team){
    return [team.school,team.location,team.displayName,team.shortDisplayName].some(alias=>clean(alias)===clean(name));
  }
  function competitor(event,name){
    return event.competitions?.[0]?.competitors?.find(c=>teamMatches(name,c.team||{}));
  }
  function updateCard(game,events,apRanks){
    const card=document.querySelector('#games .card[data-game-id="'+game.id+'"]');
    if(!card)return;
    // Match both sides so a common school name cannot pick an unrelated event.
    const event=events.find(e=>competitor(e,game.away_team)&&competitor(e,game.home_team));
    if(!event)return;
    setNetwork(card,gameNetwork(game,event));
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
      if(game.sport==='college'){
        const rank=apRanks.get(String(side.team?.id));
        let badge=button.querySelector('.fg-ap-rank');
        if(rank&&rank<=25){
          if(!badge){badge=document.createElement('span');badge.className='fg-ap-rank';button.append(badge);}
          badge.textContent='AP #'+rank;
        }else if(badge)badge.remove();
      }
    });
  }
  async function refresh(games){
    const current=[...(games||[])];
    if(!document.getElementById('fg-ap-style')){
      const style=document.createElement('style');
      style.id='fg-ap-style';
      style.textContent='#games section[aria-labelledby="college-heading"] button.pick{padding-top:20px!important;min-height:96px!important}.fg-ap-rank{position:absolute;top:5px;left:0;right:0;text-align:center;color:#435b79;font-size:12px;font-weight:800;line-height:1.2}';
      document.head.append(style);
    }
    for(const game of current){
      const card=document.querySelector('#games .card[data-game-id="'+game.id+'"]');
      if(!card)continue;
      setNetwork(card,gameNetwork(game));
      card.querySelectorAll('.fg-team-record').forEach(record=>{record.textContent='Record: —'});
      const kickoff=card.querySelector('.muted');
      if(kickoff&&game.kickoff_at){
        const day=new Date(game.kickoff_at).toLocaleDateString('en-US',{timeZone:'America/New_York',weekday:'long'});
        if(!kickoff.textContent.includes(day))kickoff.textContent=kickoff.textContent.replace(/^Kickoff:\s*(?:\w+\s*·\s*)?/, 'Kickoff: '+day+' · ');
      }
    }
    const apRanksPromise=rankings();
    await Promise.all(current.filter(g=>g.kickoff_at).map(async game=>{
      const [events,apRanks]=await Promise.all([schedule(game.sport,dateKey(game.kickoff_at)),apRanksPromise]);
      updateCard(game,events,apRanks);
    }));
  }
  window.refreshRosterMetadata=refresh;
  if(window.fgRosterGames)refresh(window.fgRosterGames);
  if(typeof module!=='undefined'&&module.exports)module.exports={clean,dateKey,teamMatches,competitor};
})();
