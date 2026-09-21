(()=>{
  const ORDER=['Ross','Scott','Jim','Ken'];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function ensure(){
    const home=document.getElementById('home'); if(!home)return;
    let card=document.getElementById('dashboard-overview');
    if(!card){
      home.innerHTML='<div class="card" id="dashboard-overview"><h2>Week at a Glance</h2><p id="dash-status" class="muted">Loading current standings…</p><div id="dash-progress"></div><div id="dash-grid"></div></div>';
      if(!document.getElementById('dashboard-style')){
        const st=document.createElement('style');st.id='dashboard-style';
        st.textContent='#dash-progress{font-weight:800;margin:10px 0 14px}.dash-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.dash-player{background:#f7f9fc;border:1px solid #e1e7f0;border-radius:11px;padding:13px;text-align:center}.dash-player b{font-size:1.08rem}.dash-score{font-size:1.45rem;font-weight:900;margin:5px 0}.dash-detail{font-size:.9rem;color:#667085}.dash-season{margin-top:7px;padding-top:7px;border-top:1px solid #e1e7f0;font-weight:700}.money-pos{color:#16833b!important}.money-neg{color:#c62828!important}.money-zero{color:#111!important}.money-amount{display:inline-block;white-space:nowrap}@media(max-width:650px){.dash-grid{grid-template-columns:repeat(2,1fr)}}';
        document.head.appendChild(st);
      }
    }
  }
  async function loadDashboard(){
    ensure(); const status=document.getElementById('dash-status'); if(!status)return;
    try{
      status.textContent='Refreshing standings…';
      const weeks=await sb.from('pool_weeks').select('week_number').eq('season',2026).lte('week_number',week?.week_number||99).order('week_number');
      if(weeks.error)throw weeks.error;
      const nums=(weeks.data||[]).map(x=>x.week_number);
      const current=week?.week_number||Math.max(...nums,1);
      const results=await Promise.all(nums.map(async n=>{try{const {data,error}=await sb.functions.invoke('pool-live',{body:{week_number:n}});return error||data?.error?null:data}catch{return null}}));
      const cur=results[nums.indexOf(current)]||results.filter(Boolean).at(-1);
      if(!cur)throw new Error('Current standings are not available yet.');
      const season=Object.fromEntries(ORDER.map(n=>[n,0]));
      const dollars=Object.fromEntries(ORDER.map(n=>[n,0]));
      results.filter(Boolean).forEach(d=>{
        (d.standings||[]).forEach(s=>{if(season[s.name]!==undefined)season[s.name]+=Number(s.points||0)});
        const games=d.games||[]; if(!games.length||games.some(g=>!g.completed))return;
        const rows=ORDER.map(name=>({name,points:Number((d.standings||[]).find(s=>s.name===name)?.points||0)})).sort((a,b)=>b.points-a.points);
        const prizes=[24,-4,-8,-12]; let i=0;
        while(i<rows.length){let j=i+1;while(j<rows.length&&rows[j].points===rows[i].points)j++;const share=prizes.slice(i,j).reduce((a,b)=>a+b,0)/(j-i);for(let k=i;k<j;k++)dollars[rows[k].name]+=share;i=j}
      });
      const completed=(cur.games||[]).filter(g=>g.completed).length,total=(cur.games||[]).length;
      const moneyThrough=nums.reduce((last,n,idx)=>{const d=results[idx];const games=d?.games||[];return games.length&&games.every(g=>g.completed)?Math.max(last,n):last;},0);
      document.getElementById('dash-progress').textContent='Week '+current+' · '+completed+' of '+total+' games complete';
      document.getElementById('dash-grid').innerHTML='<div class="dash-grid">'+ORDER.map(name=>{
        const s=(cur.standings||[]).find(x=>x.name===name)||{wins:0,losses:0,pushes:0,points:0};
        const rec=s.wins+'-'+s.losses+(s.pushes?'-'+s.pushes+' P':'');
        const money=dollars[name];
        const cls=money>0?'money-pos':money<0?'money-neg':'money-zero';
        const amount=(money>0?'+':money<0?'−':'')+'$'+Math.abs(money).toFixed(2);
        return '<div class="dash-player"><b>'+esc(name)+'</b><div class="dash-score">'+Number(s.points||0)+' pts</div><div class="dash-detail">Week '+current+': '+rec+'</div><div class="dash-season">Season: <span style="color:#16833b">'+season[name]+' pts</span><br>Money through Week '+moneyThrough+': <span class="money-amount '+cls+'">'+amount+'</span></div></div>';
      }).join('')+'</div>';
      status.textContent='Current weekly standings, season points and cumulative dollars';
    }catch(e){status.textContent='Dashboard unavailable: '+(e?.message||'unknown error')}
  }
  window.loadDashboard=loadDashboard;
  const oldShow=window.show; window.show=function(x){oldShow(x);if(x==='home')loadDashboard()};
  const start=()=>{ensure();setTimeout(loadDashboard,800);setInterval(()=>{if(document.getElementById('home')?.classList.contains('show')&&!document.getElementById('app')?.classList.contains('hidden'))loadDashboard()},60000)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();