(()=>{
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const WEEK1={Ken:{wins:10,losses:6,pushes:0,points:10},Ross:{wins:9,losses:7,pushes:0,points:9},Scott:{wins:8,losses:8,pushes:0,points:8},Jim:{wins:8,losses:8,pushes:0,points:8}};
  const pickFor=(data,gameId,name)=>data.picks.find(p=>p.game_id===gameId&&p.participant_name===name)?.picked_team||'—';
  const pickMark=(g,pick)=>{
    if(!g.completed||!g.ats_winner||g.ats_winner==='Push'||pick==='—') return '';
    return pick===g.ats_winner?' ✓':' ✕';
  };
  const record=s=>`${s.wins}-${s.losses}${s.pushes?'-'+s.pushes+' P':''}`;
  const rankRows=rows=>[...rows].sort((a,b)=>(b.points-a.points)||(b.wins-a.wins)||(a.losses-b.losses)||a.name.localeCompare(b.name));
  const cards=rows=>'<div class="stand-grid">'+rankRows(rows).map((s,i)=>`<div><b>${i+1}. ${esc(s.name)}</b><br>${record(s)}<br><span class="muted">${s.points} pts${s.missing?' · pick missing':''}</span></div>`).join('')+'</div>';
  function seasonRows(data){
    return data.standings.map(s=>{
      const b=WEEK1[s.name]||{wins:0,losses:0,pushes:0,points:0};
      return {name:s.name,wins:b.wins+s.wins,losses:b.losses+s.losses,pushes:b.pushes+(s.pushes||0),points:b.points+s.points,missing:s.missing};
    });
  }
  function ensureUI(){
    if(document.getElementById('live-week')) return;
    const nav=document.querySelector('#app nav');
    const adminBtn=document.getElementById('adminBtn');
    const btn=document.createElement('button');
    btn.id='liveWeekBtn'; btn.textContent='Week 2 Live'; btn.type='button';
    btn.onclick=()=>{show('live-week');loadLiveWeek();};
    nav.insertBefore(btn,adminBtn||null);
    const section=document.createElement('section');
    section.id='live-week'; section.className='tab';
    section.innerHTML=`<div class="card"><h2>Week 2 Live</h2><p id="live-week-status" class="muted">Loading published picks and scores…</p><div id="live-week-standings"></div><div id="live-week-games"></div></div>`;
    document.getElementById('app').appendChild(section);
    const style=document.createElement('style');
    style.textContent=`#live-week .scoreline{font-size:1.05rem;font-weight:800;margin:5px 0}#live-week .live-badge{display:inline-block;padding:3px 7px;border-radius:999px;background:#eef4ff;font-size:.8rem;font-weight:800}#live-week .game-live{border-left:5px solid #1769d2}#live-week .game-final{border-left:5px solid #2d7a46}#live-week .game-pre{border-left:5px solid #aebbd0}#live-week .picks-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:10px}#live-week .picks-grid div{background:#f7f9fc;border-radius:8px;padding:7px}.stand-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:8px;margin:12px 0 20px}.stand-grid div{background:#f7f9fc;border:1px solid #e1e7f0;border-radius:10px;padding:10px;text-align:center}.season-divider{border:0;border-top:1px solid #dfe6ef;margin:22px 0}@media(max-width:650px){.stand-grid{grid-template-columns:repeat(2,1fr)}#live-week .picks-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }
  function renderStandingsPage(data){
    const section=document.getElementById('standings');
    if(!section) return;
    const current=rankRows(data.standings);
    const season=seasonRows(data);
    section.innerHTML=`<div class="card"><h2>Standings</h2><h3>Week ${esc(data.week.week_number)} standings so far</h3><p class="muted">Updates as games are completed.</p>${cards(current)}<hr class="season-divider"><h3>Season total</h3><p class="muted">Week 1 final results plus the current Week ${esc(data.week.week_number)} results.</p>${cards(season)}</div>`;
  }
  function render(data){
    const status=document.getElementById('live-week-status');
    status.textContent='Published Week '+data.week.week_number+' picks · scores refresh automatically about every minute.';
    document.getElementById('live-week-standings').innerHTML='<h3>Week '+esc(data.week.week_number)+' standings so far</h3>'+cards(data.standings);
    renderStandingsPage(data);
    const groups=[['college','COLLEGE FOOTBALL'],['nfl','NFL']];
    document.getElementById('live-week-games').innerHTML=groups.map(([sport,label])=>{
      const rows=data.games.filter(g=>g.sport===sport);
      return `<h3>${label}</h3>`+rows.map(g=>{
        const cls=g.completed?'game-final':g.status==='in'?'game-live':'game-pre';
        const score=(g.away_score!==null&&g.home_score!==null)?`${esc(g.away_team)} ${g.away_score} · ${esc(g.home_team)} ${g.home_score}`:`${esc(g.away_team)} @ ${esc(g.home_team)}`;
        const ats=g.completed&&g.ats_winner?`ATS: ${esc(g.ats_winner==='Push'?'Push':g.ats_winner+' covered')}`:(g.status==='in'&&g.ats_winner?`Current cover: ${esc(g.ats_winner)}`:'');
        return `<div class="card ${cls}"><div><span class="live-badge">${esc(g.status_detail|| (g.completed?'Final':'Scheduled'))}</span></div><div class="scoreline">${score}</div><div class="muted">Line: ${esc(g.favorite_team)} ${esc(g.spread)}${ats?' · '+ats:''}</div><div class="picks-grid">${data.participants.map(name=>{const p=pickFor(data,g.id,name);return `<div><b>${esc(name)}</b>: ${esc(p)}${pickMark(g,p)}</div>`}).join('')}</div></div>`;
      }).join('');
    }).join('');
  }
  async function loadLiveWeek(){
    ensureUI();
    const status=document.getElementById('live-week-status');
    try{
      status.textContent='Refreshing Week 2…';
      const {data,error}=await sb.functions.invoke('pool-live',{body:{week_number:2}});
      if(error) throw error;
      if(data?.error) throw new Error(data.error);
      render(data);
    }catch(e){status.textContent='Unable to load Week 2 live view: '+(e?.message||'unknown error');}
  }
  function wireStandings(){
    document.querySelectorAll('#app nav button').forEach(b=>{
      if(b.textContent.trim()==='Standings'&&!b.dataset.liveStandings){
        b.dataset.liveStandings='1';
        b.addEventListener('click',()=>setTimeout(loadLiveWeek,0));
      }
    });
  }
  window.loadLiveWeek=loadLiveWeek;
  const start=()=>{ensureUI();wireStandings();loadLiveWeek();setInterval(()=>{const live=document.getElementById('live-week')?.classList.contains('show');const stand=document.getElementById('standings')?.classList.contains('show');if(live||stand)loadLiveWeek();},60000);};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();