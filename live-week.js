(()=>{
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ORDER=['Ross','Scott','Jim','Ken'];
  const record=s=>`${s.wins}-${s.losses}${s.pushes?'-'+s.pushes+' P':''}`;
  const pickFor=(data,gameId,name)=>data.picks.find(p=>p.game_id===gameId&&p.participant_name===name)?.picked_team||'—';
  const pickMark=(g,pick)=>{if(!g.completed||!g.ats_winner||g.ats_winner==='Push'||pick==='—')return'';return pick===g.ats_winner?' ✓':' ✕';};
  const spreadNumber=g=>{const n=Number.parseFloat(String(g.spread??'').replace(/[^0-9.+-]/g,''));return Number.isFinite(n)?Math.abs(n):null;};
  const atsMargin=(g,pick)=>{if(pick==='—'||(g.status!=='in'&&!g.completed)||g.away_score===null||g.home_score===null)return null;const pts=spreadNumber(g);if(pts===null)return null;let a,b;if(pick===g.away_team){a=+g.away_score;b=+g.home_score}else if(pick===g.home_team){a=+g.home_score;b=+g.away_score}else return null;return pick===g.favorite_team?(a-b)-pts:(a-b)+pts;};
  const fmt=n=>n===null?'':Math.abs(n)<.0001?' (Even)':` (${n>0?'+':''}${Math.round(n*10)/10})`;
  const pc=n=>n===null?'':Math.abs(n)<.0001?'pick-push':n>0?'pick-cover':'pick-behind';
  const cards=rows=>'<div class="live-stand-grid">'+ORDER.map(name=>rows.find(s=>s.name===name)).filter(Boolean).map(s=>`<div><b>${esc(s.name)}</b><br>${record(s)}<br><span class="muted">${s.points} pts</span></div>`).join('')+'</div>';
  function ensureUI(){
    let btn=document.getElementById('liveWeekBtn');
    const nav=document.querySelector('#app nav'); if(!nav)return;
    if(!btn){btn=document.createElement('button');btn.id='liveWeekBtn';btn.type='button';btn.textContent='Week 3 Live';btn.onclick=()=>{show('live-week');loadLiveWeek();};nav.appendChild(btn);} const week3=[...nav.querySelectorAll('button')].find(b=>b.textContent.trim()==='Week 3'); if(week3&&week3.nextSibling!==btn) nav.insertBefore(btn,week3.nextSibling);
    if(!document.getElementById('live-week')){const section=document.createElement('section');section.id='live-week';section.className='tab';section.innerHTML='<div class="card"><h2>Week 3 Live</h2><p id="live-week-status" class="muted">Loading published picks and scores…</p><div id="live-week-standings"></div><div id="live-week-games"></div></div>';document.getElementById('app').appendChild(section);}
    if(!document.getElementById('week3-live-style')){const style=document.createElement('style');style.id='week3-live-style';style.textContent='#live-week .scoreline{font-size:1.05rem;font-weight:800;margin:5px 0}#live-week .live-badge{display:inline-block;padding:3px 7px;border-radius:999px;background:#eef4ff;font-size:.8rem;font-weight:800}#live-week .game-live{border-left:5px solid #1769d2}#live-week .game-final{border-left:5px solid #2d7a46}#live-week .game-pre{border-left:5px solid #aebbd0}#live-week .picks-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:10px}#live-week .picks-grid div{background:#f7f9fc;border-radius:8px;padding:7px}#live-week .pick-cover{color:#16833b;font-weight:800}#live-week .pick-behind{color:#c62828;font-weight:800}#live-week .pick-push{color:#111;font-weight:800}.live-stand-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:12px 0 20px}.live-stand-grid div{background:#f7f9fc;border:1px solid #e1e7f0;border-radius:10px;padding:10px;text-align:center}.projection-box{border:1px solid #dce3ee;border-radius:12px;padding:14px;margin:4px 0 22px;background:#fff}.projection-box h3{margin:0 0 4px}.projection-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px}.projection-grid div{display:flex;justify-content:space-between;align-items:center;background:#f7f9fc;border-radius:8px;padding:9px 10px}.projection-grid strong{font-size:1.1rem}.projection-table>div{display:grid;grid-template-columns:1.4fr repeat(4,.75fr);gap:5px;align-items:center;padding:8px 4px;border-bottom:1px solid #e8edf4}.projection-table span{text-align:center}.projection-head{font-size:.82rem;color:#667085;font-weight:800}.scenario-title{margin:18px 0 2px}.scenario-list{display:grid;gap:8px}.scenario-game{background:#f7f9fc;border-radius:8px;padding:10px}.scenario-game>div{font-size:.9rem;margin-top:5px}';document.head.appendChild(style);}
  }
  const gameWeight=g=>{const t=String(g.status_detail||'').toLowerCase();return g.sport==='nfl'&&(t.includes('sunday night')||t.includes('monday night'))?2:1;};
  function projection(data){
    const nfl=data.games.filter(g=>g.sport==='nfl'), remaining=data.games.filter(g=>!g.completed);
    const nflCompleted=nfl.filter(g=>g.completed).length;
    if(!nfl.length||!nflCompleted||!remaining.length)return '';
    const nowPts=Object.fromEntries(ORDER.map(n=>[n,Number(data.standings.find(s=>s.name===n)?.points||0)]));
    const places=Object.fromEntries(ORDER.map(n=>[n,[0,0,0,0]]));
    const N=10000;
    for(let i=0;i<N;i++){
      const pts={...nowPts};
      remaining.forEach(g=>{
        const winner=Math.random()<.5?g.away_team:g.home_team,w=gameWeight(g);
        ORDER.forEach(n=>{if(pickFor(data,g.id,n)===winner)pts[n]+=w;});
      });
      const ranked=ORDER.slice().sort((a,b)=>pts[b]-pts[a]);
      let pos=0;
      while(pos<ranked.length){
        let end=pos+1;while(end<ranked.length&&pts[ranked[end]]===pts[ranked[pos]])end++;
        const share=1/(end-pos);
        for(let j=pos;j<end;j++)for(let p=pos;p<end;p++)places[ranked[j]][p]+=share;
        pos=end;
      }
    }
    const pct=(n,p)=>Math.round(places[n][p]/N*100);
    const rows=ORDER.slice().sort((a,b)=>pct(b,0)-pct(a,0));
    const scenarioGames=remaining.filter(g=>ORDER.some(n=>pickFor(data,g.id,n)!=='—')).slice(0,4);
    const scenarios=scenarioGames.map(g=>{
      const sides=[g.away_team,g.home_team].map(team=>{
        const helped=ORDER.filter(n=>pickFor(data,g.id,n)===team);
        return '<div><b>'+esc(team)+' covers:</b> '+(helped.length?esc(helped.join(', ')):'No one')+' gains '+gameWeight(g)+' pt'+(gameWeight(g)===1?'':'s')+'</div>';
      }).join('');
      return '<div class="scenario-game"><b>'+esc(g.away_team)+' @ '+esc(g.home_team)+'</b>'+sides+'</div>';
    }).join('');
    return '<div class="projection-box"><h3>Projected Finish</h3><p class="muted">10,000 remaining-game simulations · tied places are split across positions</p><div class="projection-table"><div class="projection-head"><span>Player</span><span>1st</span><span>2nd</span><span>3rd</span><span>4th</span></div>'+rows.map(n=>'<div><b>'+esc(n)+'</b><span>'+pct(n,0)+'%</span><span>'+pct(n,1)+'%</span><span>'+pct(n,2)+'%</span><span>'+pct(n,3)+'%</span></div>').join('')+'</div>'+(scenarios?'<h3 class="scenario-title">Remaining Game Scenarios</h3><p class="muted">Who gains pool points depending on which side covers.</p><div class="scenario-list">'+scenarios+'</div>':'')+'</div>';
  }
  function render(data){
    document.getElementById('live-week-status').textContent='Published Week 3 picks · scores refresh automatically about every minute.';
    document.getElementById('live-week-standings').innerHTML='<h3>Week 3 standings so far</h3>'+cards(data.standings)+projection(data);
    document.getElementById('live-week-games').innerHTML=[['college','COLLEGE FOOTBALL'],['nfl','NFL']].map(([sport,label])=>'<h3>'+label+'</h3>'+data.games.filter(g=>g.sport===sport).slice().sort((a,b)=>Number(a.completed)-Number(b.completed)).map(g=>{const cls=g.completed?'game-final':g.status==='in'?'game-live':'game-pre';const score=(g.away_score!==null&&g.home_score!==null)?`${esc(g.away_team)} ${g.away_score} @ ${esc(g.home_team)} ${g.home_score}`:`${esc(g.away_team)} @ ${esc(g.home_team)}`;const ats=g.completed&&g.ats_winner?`ATS: ${esc(g.ats_winner==='Push'?'Push':g.ats_winner+' covered')}`:(g.status==='in'&&g.ats_winner?`Current cover: ${esc(g.ats_winner)}`:'');return `<div class="card ${cls}"><div><span class="live-badge">${esc(g.status_detail||(g.completed?'Final':'Scheduled'))}</span></div><div class="scoreline">${score}</div><div class="muted">Line: ${esc(g.favorite_team)} ${esc(g.spread)}${ats?' · '+ats:''}</div><div class="picks-grid">${ORDER.map(name=>{const p=pickFor(data,g.id,name),m=atsMargin(g,p);return `<div><b>${name}</b>: <span class="${pc(m)}">${esc(p)}${fmt(m)}${pickMark(g,p)}</span></div>`;}).join('')}</div></div>`;}).join('')).join('');
  }
  async function loadLiveWeek(){ensureUI();try{document.getElementById('live-week-status').textContent='Refreshing Week 3…';const {data,error}=await sb.functions.invoke('pool-live',{body:{week_number:3}});if(error)throw error;if(data?.error)throw new Error(data.error);render(data);}catch(e){document.getElementById('live-week-status').textContent='Unable to load Week 3 live view: '+(e?.message||'unknown error');}}
  window.loadLiveWeek=loadLiveWeek;
  function start(){ensureUI();setTimeout(ensureUI,500);setTimeout(ensureUI,1500);setInterval(()=>{if(document.getElementById('live-week')?.classList.contains('show'))loadLiveWeek();},60000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();