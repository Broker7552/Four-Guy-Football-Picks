(()=>{
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const W1=[['Ross','9–7','−$4'],['Scott','8–8','−$10'],['Jim','8–8','−$10'],['Ken','10–6','+$24']];
  function styles(){if(document.getElementById('fg-history2-style'))return;const s=document.createElement('style');s.id='fg-history2-style';s.textContent='.fg-hist-cards{display:grid;gap:12px}.fg-hist-game{border:1px solid #dce3ee;border-radius:12px;padding:14px;background:#fff}.fg-hist-match{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.fg-hist-match span{color:#667085;text-align:right;white-space:nowrap}.fg-hist-picks{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px}.fg-hist-picks div{background:#f7f9fc;border-radius:8px;padding:8px;font-size:14px}.fg-hist-picks span{font-size:13px}.fg-pick-win{background:#ecfdf3!important;color:#16803c}.fg-pick-loss{background:#fff1f2!important;color:#b42318}@media(max-width:650px){.fg-hist-picks{grid-template-columns:repeat(2,1fr)}.fg-hist-match{display:block}.fg-hist-match span{display:block;text-align:left;margin-top:5px}}.fg-history-select{font:inherit;padding:10px 12px;border:1px solid #aebbd0;border-radius:8px;background:#fff;color:#10213b;margin-left:6px}.fg-hist-table{min-width:720px}.fg-hist-table td,.fg-hist-table th{vertical-align:top}.fg-current-label{font-weight:800}';document.head.appendChild(s);}
  async function week2(){
    const {data:w,error}=await sb.from('pool_weeks').select('*').eq('season',2026).eq('week_number',2).single();if(error)throw error;
    const {data:g,error:ge}=await sb.from('pool_games').select('*').eq('week_id',w.id).eq('selected_for_pool',true).order('kickoff_at');if(ge)throw ge;
    const {data:live,error:le}=await sb.functions.invoke('pool-live',{body:{week_number:2}});if(le)throw le;
    const by={};const lp=live?.picks||live?.pick_rows||live?.data?.picks||[];
    lp.forEach(x=>{const gid=x.game_id??x.gameId;const n=x.participant_name??x.participant??x.name;const pick=x.picked_team??x.pick;if(gid&&n)(by[gid]??={})[n]=pick;});
    return {w,g,p:by,live};
  }
  function week1HTML(){
    const H=(globalThis.FG_WEEK1_HIST||[]);
    const winner=g=>g[6]+g[4]>g[7]?g[3]:g[6]+g[4]<g[7]?g[5]:'Push';
    const games=H.map(g=>'<div class="fg-hist-game"><div class="fg-hist-match"><b>'+esc(g[3])+' vs '+esc(g[5])+'</b><span>'+esc(g[3])+' '+esc(g[4])+'</span></div><div class="muted">Final: '+esc(g[3])+' '+g[6]+'–'+g[7]+' '+esc(g[5])+' · ATS: '+esc(winner(g))+'</div><div class="fg-hist-picks">'+['Ross','Scott','Jim','Ken'].map(n=>{const v=g[8][n],ok=winner(g)==='Push'||v===winner(g);return '<div class="'+(ok?'fg-pick-win':'fg-pick-loss')+'"><b>'+n+'</b><br><span>'+esc(v)+' '+(winner(g)==='Push'?'':ok?'✓':'✕')+'</span></div>';}).join('')+'</div></div>').join('');
    return '<h2>Week 1 — Historical Record</h2><p class="muted">Final Week 1 standings, money and picks.</p><div class="fg-standings">'+W1.map((x,i)=>'<div class="fg-standing"><small>'+(i+1)+'</small><b>'+x[0]+'</b><div>'+x[1]+' · <span class="'+(x[2].startsWith('+')?'fg-positive':'fg-negative')+'">'+x[2]+'</span></div></div>').join('')+'</div><h3 style="margin-top:28px">Week 1 Games</h3><div class="fg-hist-cards">'+games+'</div>';
  }
  async function renderHistory(n){
    const card=document.querySelector('#history>.card');if(!card)return;
    if(n===1){card.innerHTML=week1HTML();return;}
    card.innerHTML='<h2>Week 2 — Historical Record</h2><p class="muted">Loading final Week 2 results…</p>';
    try{
      const d=await week2(),players=['Ross','Scott','Jim','Ken'];
      const finalStats={Ross:['15–7','16 pts'],Jim:['10–12','10 pts'],Scott:['8–14','10 pts'],Ken:['8–14','9 pts']};
      const games=d.g.map(x=>'<div class="fg-hist-game"><div class="fg-hist-match"><b>'+esc(x.away_team)+' @ '+esc(x.home_team)+'</b><span>'+esc(x.favorite_team)+' '+esc(x.spread)+'</span></div><div class="fg-hist-picks">'+players.map(n=>'<div><b>'+n+'</b><br><span>'+esc(d.p[x.id]?.[n]||'—')+'</span></div>').join('')+'</div></div>').join('');
      card.innerHTML='<h2>Week 2 — Historical Record</h2><p class="muted">Final Week 2 standings and picks.</p><div class="fg-standings">'+players.map((n,i)=>'<div class="fg-standing"><small>'+(i+1)+'</small><b>'+n+'</b><div>'+finalStats[n][0]+' · '+finalStats[n][1]+'</div></div>').join('')+'</div><h3 style="margin-top:28px">Week 2 Games</h3><div class="fg-hist-cards">'+games+'</div>';
    }catch(e){card.innerHTML='<h2>Week 2 — Historical Record</h2><p>Unable to load Week 2 history.</p>';}
  }
  function rebuildNav(){
    const nav=document.querySelector('#app nav');if(!nav)return;
    [...nav.querySelectorAll('button')].forEach(b=>{const t=b.textContent.trim().toLowerCase();if(t.includes('week 1 historical')||t.includes('week 2 live')||t==='dashboard'||/^week 2\b/.test(t))b.remove();});
    let current=[...nav.querySelectorAll('button')].find(b=>b.textContent.trim().toLowerCase()==='current picks');if(current){current.textContent='Week 3';current.onclick=()=>show('picks');}
    let hist=[...nav.querySelectorAll('button')].find(b=>b.textContent.toLowerCase().includes('historical'));if(!hist){hist=document.createElement('button');hist.type='button';hist.textContent='Historical';hist.onclick=()=>show('history');const rules=[...nav.querySelectorAll('button')].find(b=>b.textContent.trim()==='Rules');nav.insertBefore(hist,rules||null);}
    let stand=[...nav.querySelectorAll('button')].find(b=>b.textContent.trim()==='Standings');if(!stand){stand=document.createElement('button');stand.type='button';stand.textContent='Standings';stand.onclick=()=>show('standings');nav.insertBefore(stand,hist.nextSibling);}
    hist.onclick=()=>{show('history');renderHistory(Number(document.getElementById('history-week-select')?.value||2));};
  }
  function selector(){
    const card=document.querySelector('#history>.card');if(!card)return;
    let wrap=document.getElementById('history-week-picker');if(!wrap){wrap=document.createElement('div');wrap.id='history-week-picker';wrap.className='notice';wrap.innerHTML='<label><b>Historical week</b> <select id="history-week-select" class="fg-history-select"><option value="2">Week 2</option><option value="1">Week 1</option></select></label>';card.parentNode.insertBefore(wrap,card);}
    const sel=document.getElementById('history-week-select');sel.onchange=()=>renderHistory(Number(sel.value));
  }
  function currentWeek(){
    const h=document.querySelector('#picks h2');if(h)h.textContent='Week 3 — Current Week';
  }
  function start(){styles();rebuildNav();selector();currentWeek();renderHistory(2);const live=document.getElementById('live-week');if(live)live.remove();const lb=document.getElementById('liveWeekBtn');if(lb)lb.remove();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,100));else setTimeout(start,100);
})();