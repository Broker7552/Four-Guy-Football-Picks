(()=>{
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pickFor=(data,gameId,name)=>data.picks.find(p=>p.game_id===gameId&&p.participant_name===name)?.picked_team||'—';
  const pickMark=(g,pick)=>{
    if(!g.completed||!g.ats_winner||g.ats_winner==='Push'||pick==='—') return '';
    return pick===g.ats_winner?' ✓':' ✕';
  };
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
    style.textContent=`#live-week .scoreline{font-size:1.05rem;font-weight:800;margin:5px 0}#live-week .live-badge{display:inline-block;padding:3px 7px;border-radius:999px;background:#eef4ff;font-size:.8rem;font-weight:800}#live-week .game-live{border-left:5px solid #1769d2}#live-week .game-final{border-left:5px solid #2d7a46}#live-week .game-pre{border-left:5px solid #aebbd0}#live-week .picks-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:10px}#live-week .picks-grid div{background:#f7f9fc;border-radius:8px;padding:7px}#live-week .stand-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:8px;margin:12px 0 20px}#live-week .stand-grid div{background:#f7f9fc;border:1px solid #e1e7f0;border-radius:10px;padding:10px;text-align:center}@media(max-width:650px){#live-week .stand-grid{grid-template-columns:repeat(2,1fr)}#live-week .picks-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }
  function render(data){
    const status=document.getElementById('live-week-status');
    status.textContent='Published Week '+data.week.week_number+' picks · scores refresh automatically about every minute.';
    document.getElementById('live-week-standings').innerHTML='<h3>Week 2 standings so far</h3><div class="stand-grid">'+data.standings.map((s,i)=>`<div><b>${i+1}. ${esc(s.name)}</b><br>${s.wins}-${s.losses}${s.pushes?'-'+s.pushes+' P':''}<br><span class="muted">${s.points} pts${s.missing?' · pick missing':''}</span></div>`).join('')+'</div>';
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
  window.loadLiveWeek=loadLiveWeek;
  const start=()=>{ensureUI();setInterval(()=>{if(document.getElementById('live-week')?.classList.contains('show'))loadLiveWeek();},60000);};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
