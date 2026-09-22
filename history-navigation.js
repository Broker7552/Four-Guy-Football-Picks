(()=>{
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ORDER=['Ross','Scott','Jim','Ken'];
  const W1=[['Ross','9–7','9 pts','+$2'],['Scott','8–8','8 pts','−$10'],['Jim','8–8','8 pts','−$10'],['Ken','10–6','10 pts','+$18']];
  const PRIZES=[18,2,-6,-14];
  function styles(){if(document.getElementById('fg-history2-style'))return;const s=document.createElement('style');s.id='fg-history2-style';s.textContent='.fg-hist-cards{display:grid;gap:12px}.fg-hist-game{border:1px solid #dce3ee;border-radius:12px;padding:14px;background:#fff}.fg-hist-match{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.fg-hist-match span{color:#667085;text-align:right;white-space:nowrap}.fg-hist-picks{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px}.fg-hist-picks div{background:#f7f9fc;border-radius:8px;padding:8px;font-size:14px}.fg-hist-picks span{font-size:13px}.fg-pick-win{background:#ecfdf3!important;color:#16803c}.fg-pick-loss{background:#fff1f2!important;color:#b42318}@media(max-width:650px){.fg-hist-picks{grid-template-columns:repeat(2,1fr)}.fg-hist-match{display:block}.fg-hist-match span{display:block;text-align:left;margin-top:5px}}.fg-history-select{font:inherit;padding:10px 12px;border:1px solid #aebbd0;border-radius:8px;background:#fff;color:#10213b;margin-left:6px}.fg-hist-table{min-width:720px}.fg-hist-table td,.fg-hist-table th{vertical-align:top}.fg-current-label{font-weight:800}';document.head.appendChild(s);}
  function payout(rows){const out={};const ranked=ORDER.map(name=>({name,points:Number(rows.find(s=>s.name===name)?.points||0)})).sort((a,b)=>b.points-a.points);let i=0;while(i<ranked.length){let j=i+1;while(j<ranked.length&&ranked[j].points===ranked[i].points)j++;const share=PRIZES.slice(i,j).reduce((a,b)=>a+b,0)/(j-i);for(let k=i;k<j;k++)out[ranked[k].name]=share;i=j}return out;}
  const money=n=>(n>0?'+':n<0?'−':'')+'$'+Math.abs(n).toFixed(Number.isInteger(n)?0:2);
  async function completedWeeks(){const {data,error}=await sb.from('pool_weeks').select('id,season,week_number,status').eq('season',2026).eq('status','graded').order('week_number',{ascending:false});if(error)throw error;return data||[];}
  async function weekData(n){
    const {data:w,error}=await sb.from('pool_weeks').select('*').eq('season',2026).eq('week_number',n).single();if(error)throw error;
    const {data:g,error:ge}=await sb.from('pool_games').select('*').eq('week_id',w.id).eq('selected_for_pool',true).order('kickoff_at');if(ge)throw ge;
    const {data:live,error:le}=await sb.functions.invoke('pool-live',{body:{week_number:n}});if(le)throw le;if(live?.error)throw new Error(live.error);
    const by={};for(const x of live?.picks||[]){const gid=x.game_id??x.gameId,nm=x.participant_name??x.participant??x.name,pick=x.picked_team??x.pick;if(gid&&nm)(by[gid]??={})[nm]=pick;}
    return {w,g,p:by,live};
  }
  function week1HTML(){
    const H=(globalThis.FG_WEEK1_HIST||[]),winner=g=>g[6]+g[4]>g[7]?g[3]:g[6]+g[4]<g[7]?g[5]:'Push';
    const games=H.map(g=>'<div class="fg-hist-game"><div class="fg-hist-match"><b>'+esc(g[3])+' vs '+esc(g[5])+'</b><span>'+esc(g[3])+' '+esc(g[4])+'</span></div><div class="muted">Final: '+esc(g[3])+' '+g[6]+'–'+g[7]+' '+esc(g[5])+' · ATS: '+esc(winner(g))+'</div><div class="fg-hist-picks">'+ORDER.map(n=>{const v=g[8][n],ok=winner(g)==='Push'||v===winner(g);return '<div class="'+(ok?'fg-pick-win':'fg-pick-loss')+'"><b>'+n+'</b><br><span>'+esc(v)+' '+(winner(g)==='Push'?'':ok?'✓':'✕')+'</span></div>';}).join('')+'</div></div>').join('');
    return '<h2>Week 1 — Historical Record</h2><p class="muted">Final Week 1 standings, money and picks.</p><div class="fg-standings">'+W1.map((x,i)=>'<div class="fg-standing"><small>'+(i+1)+'</small><b>'+x[0]+'</b><div>'+x[1]+' · '+x[2]+' · <span class="'+(x[3].startsWith('+')?'fg-positive':'fg-negative')+'">'+x[3]+'</span></div></div>').join('')+'</div><h3 style="margin-top:28px">Week 1 Games</h3><div class="fg-hist-cards">'+games+'</div>';
  }
  async function renderHistory(n){
    const card=document.querySelector('#history>.card');if(!card)return;if(n===1){card.innerHTML=week1HTML();return;}
    card.innerHTML='<h2>Week '+n+' — Historical Record</h2><p class="muted">Loading final Week '+n+' results…</p>';
    try{
      const d=await weekData(n),rows=d.live?.standings||[],pay=payout(rows),liveGames=d.live?.games||[];
      const games=d.g.map(x=>{const lg=liveGames.find(z=>z.id===x.id)||{},winner=lg.ats_winner||null,final=(lg.away_score!=null&&lg.home_score!=null)?'<div class="muted">Final: '+esc(x.away_team)+' '+lg.away_score+'–'+lg.home_score+' '+esc(x.home_team)+' · ATS: '+esc(winner||'—')+'</div>':'';return '<div class="fg-hist-game"><div class="fg-hist-match"><b>'+esc(x.away_team)+' @ '+esc(x.home_team)+'</b><span>'+esc(x.favorite_team)+' '+esc(x.spread)+'</span></div>'+final+'<div class="fg-hist-picks">'+ORDER.map(name=>{const v=d.p[x.id]?.[name]||'—',push=winner==='Push',ok=winner&&v===winner;return '<div class="'+(winner?(push?'':ok?'fg-pick-win':'fg-pick-loss'):'')+'"><b>'+name+'</b><br><span>'+esc(v)+(winner&&!push?' '+(ok?'✓':'✕'):'')+'</span></div>';}).join('')+'</div></div>';}).join('');
      const sorted=ORDER.map(name=>rows.find(s=>s.name===name)||{name,wins:0,losses:0,pushes:0,points:0}).sort((a,b)=>Number(b.points)-Number(a.points));
      card.innerHTML='<h2>Week '+n+' — Historical Record</h2><p class="muted">Final Week '+n+' standings, money and picks.</p><div class="fg-standings">'+sorted.map((s,i)=>'<div class="fg-standing"><small>'+(i+1)+'</small><b>'+esc(s.name)+'</b><div>'+s.wins+'–'+s.losses+(s.pushes?'–'+s.pushes+' P':'')+' · '+s.points+' pts · <span class="'+(pay[s.name]>0?'fg-positive':pay[s.name]<0?'fg-negative':'')+'">'+money(pay[s.name]||0)+'</span></div></div>').join('')+'</div><h3 style="margin-top:28px">Week '+n+' Games</h3><div class="fg-hist-cards">'+games+'</div>';
    }catch(e){card.innerHTML='<h2>Week '+n+' — Historical Record</h2><p>Unable to load Week '+n+' history.</p>';}
  }
  function rebuildNav(){
    const nav=document.querySelector('#app nav');if(!nav)return;const buttons=[...nav.querySelectorAll('button')];
    let glance=buttons.find(b=>['week at a glance','dashboard'].includes(b.textContent.trim().toLowerCase()));if(!glance){glance=document.createElement('button');glance.type='button';}glance.textContent='Week at a Glance';glance.onclick=()=>show('home');
    let roster=buttons.find(b=>['current picks','week 3','current games','weekly picks','games roster'].includes(b.textContent.trim().toLowerCase()));if(!roster){roster=document.createElement('button');roster.type='button';}roster.textContent='Games Roster';roster.onclick=()=>show('picks');
    let live=buttons.find(b=>['week 3 live','weekly live'].includes(b.textContent.trim().toLowerCase()));if(!live){live=document.createElement('button');live.type='button';}live.textContent='Weekly Live';live.onclick=()=>{show('live-week');if(window.loadLiveWeek)loadLiveWeek();};
    let stand=buttons.find(b=>b.textContent.trim().toLowerCase()==='standings');if(!stand){stand=document.createElement('button');stand.type='button';stand.textContent='Standings';stand.onclick=()=>{show('standings');if(window.loadStandings)loadStandings();};}
    let hist=buttons.find(b=>b.textContent.toLowerCase().includes('historical'));if(!hist){hist=document.createElement('button');hist.type='button';}hist.textContent='Historical';hist.onclick=()=>{show('history');const v=Number(document.getElementById('history-week-select')?.value||1);renderHistory(v);};
    const rules=buttons.find(b=>b.textContent.trim()==='Rules'),admin=buttons.find(b=>b.id==='adminBtn');nav.innerHTML='';[glance,roster,live,stand,hist,rules,admin].filter(Boolean).forEach(b=>nav.appendChild(b));
  }
  async function selector(){
    const card=document.querySelector('#history>.card');if(!card)return;let wrap=document.getElementById('history-week-picker');if(!wrap){wrap=document.createElement('div');wrap.id='history-week-picker';wrap.className='notice';wrap.innerHTML='<label><b>Historical week</b> <select id="history-week-select" class="fg-history-select"></select></label>';card.parentNode.insertBefore(wrap,card);}
    const sel=document.getElementById('history-week-select');try{const weeks=await completedWeeks(),nums=[...new Set([...weeks.map(w=>w.week_number),1])].sort((a,b)=>b-a);sel.innerHTML=nums.map(n=>'<option value="'+n+'">Week '+n+'</option>').join('');sel.onchange=()=>renderHistory(Number(sel.value));await renderHistory(nums[0]);}catch{sel.innerHTML='<option value="1">Week 1</option>';sel.onchange=()=>renderHistory(1);renderHistory(1);}
  }
  async function currentWeek(){try{const {data}=await sb.from('pool_weeks').select('week_number').in('status',['setup','published','open','picks_open']).order('week_number',{ascending:false}).limit(1);const n=data?.[0]?.week_number;if(n){const h=document.querySelector('#picks h2');if(h)h.textContent='Week '+n+' — Current Week';}}catch{}}
  function start(){styles();rebuildNav();selector();currentWeek();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,100));else setTimeout(start,100);
})();