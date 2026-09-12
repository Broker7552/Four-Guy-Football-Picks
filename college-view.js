/* Pure administrator view logic; never edits candidate records or selections. */
(function(root){
  const key=s=>String(s || '').toLowerCase().replace(/[^a-z0-9]/g,'');
  const major=['SEC','Big Ten','ACC','Big 12'];
  function group(team) {
    if(key(team.name)==='notredame')return 'Independents';
    const c=key(team.conference);
    if(['sec','southeastern'].includes(c))return 'SEC';
    if(['bigten','big10'].includes(c))return 'Big Ten';
    if(['acc','atlanticcoast'].includes(c))return 'ACC';
    if(['big12','bigtwelve'].includes(c))return 'Big 12';
    if(c.includes('independent') && key(team.classification)==='fbs')return 'Independents';
    return key(team.classification)==='fbs'?'Other FBS':'Other';
  }
  function decorate(g,metadata={}) {
    const find=name=>{const matches=(metadata.teams || []).filter(t=>(t.aliases || [t.name]).some(a=>key(a)===key(name)));return matches.length===1?matches[0]:{name};};
    const home=find(g.home_team),away=find(g.away_team);
    const verified=!g.issue && !!g.favorite_team && Number.isFinite(g.spread) && g.spread<0 && !!g.line_updated_at
      && Date.now()-Date.parse(g.line_updated_at)<=86400000 && Date.parse(g.line_updated_at)<=Date.now()+300000;
    const both=!!home.ap && !!away.ap;
    const featured=both?0:verified && [home,away].some(t=>major.includes(group(t)) || group(t)==='Independents')?1:2;
    return {game:g,home,away,verified,featured};
  }
  function view(games,metadata,filters={},selected=new Set()) {
    const rows=games.map(g=>decorate(g,metadata)).filter(r=>
      (!filters.conference || filters.conference==='All' || [r.home,r.away].some(t=>group(t)===filters.conference)) &&
      (!filters.ranked || filters.ranked==='all' || (filters.ranked==='ap'?!!(r.home.ap || r.away.ap):filters.ranked==='both'?!!r.home.ap && !!r.away.ap:[r.home,r.away].some(t=>t.sp && t.sp<=50))) &&
      (!filters.verified || r.verified) && (!filters.selected || selected.has(r.game.id)) &&
      (!filters.search || [r.home,r.away].some(t=>[t.name,...(t.aliases || [])].some(n=>key(n).includes(key(filters.search))))));
    const rank=(r,type)=>Math.min(r.home[type] || 10000,r.away[type] || 10000);
    const kickoff=r=>Date.parse(r.game.kickoff_at) || Number.MAX_SAFE_INTEGER;
    const spread=r=>Number.isFinite(r.game.spread)?Math.abs(r.game.spread):Number.MAX_SAFE_INTEGER;
    rows.sort((a,b)=>{
      let diff=0;
      switch(filters.sort || 'featured') {
        case 'featured':diff=a.featured-b.featured || (a.featured<2?rank(a,'ap')-rank(b,'ap'):0);break;
        case 'ap':diff=rank(a,'ap')-rank(b,'ap');break;
        case 'sp':diff=rank(a,'sp')-rank(b,'sp');break;
        case 'conference':diff=[group(a.home),group(a.away)].sort().join('/').localeCompare([group(b.home),group(b.away)].sort().join('/'));break;
        case 'spread':diff=spread(a)-spread(b);break;
      }
      return diff || kickoff(a)-kickoff(b) || a.game.id.localeCompare(b.game.id);
    });
    return rows;
  }
  const api={group,decorate,view};if(typeof module!=='undefined' && module.exports)module.exports=api;else root.CollegeView=api;
})(globalThis);

/* Public-facing visual enhancement: stadium banner, college logos in pick buttons, and TV network badges. */
(()=>{
  const logoIds={
    'Villanova':222,'Louisville':97,'Missouri':142,'Kansas':2305,'Oklahoma':201,'Michigan':130,
    'Arizona State':9,'Texas A&M':245,'Arizona':12,'BYU':252,'Alabama':333,'Kentucky':96,
    'Tennessee':2633,'Georgia Tech':59,'Ohio State':194,'Texas':251,'Arkansas':8,'Utah':254
  };
  const networks={
    'Villanova @ Louisville':'ACC Network',
    'Missouri @ Kansas':'FOX',
    'Oklahoma @ Michigan':'FOX',
    'Arizona State @ Texas A&M':'ABC',
    'Arizona @ BYU':'FOX',
    'Alabama @ Kentucky':'ABC',
    'Tennessee @ Georgia Tech':'ESPN',
    'Ohio State @ Texas':'ABC',
    'Arkansas @ Utah':'ESPN'
  };
  const logo=name=>logoIds[name]?`https://a.espncdn.com/i/teamlogos/ncaa/500/${logoIds[name]}.png`:'';
  function addStyles(){
    if(document.getElementById('fg-visual-style'))return;
    const s=document.createElement('style');s.id='fg-visual-style';s.textContent=`
      body{background:#f4f7fb;color:#0b2448}
      header.fg-hero{position:relative;overflow:hidden;background:
        radial-gradient(circle at 9% 16%,rgba(255,255,255,.95) 0 3px,rgba(255,255,255,.45) 4px 9px,transparent 10px),
        radial-gradient(circle at 91% 16%,rgba(255,255,255,.95) 0 3px,rgba(255,255,255,.45) 4px 9px,transparent 10px),
        linear-gradient(180deg,#06264c 0%,#071a31 58%,#174b2b 59%,#0a351e 100%);padding:14px 16px 16px;text-align:center;border-bottom:4px solid #c8141e;box-shadow:0 8px 25px rgba(4,21,44,.22)}
      header.fg-hero:after{content:"";position:absolute;left:-10%;right:-10%;bottom:-28px;height:90px;background:repeating-linear-gradient(90deg,transparent 0 12%,rgba(255,255,255,.16) 12.2% 12.5%);transform:perspective(220px) rotateX(55deg);transform-origin:bottom;pointer-events:none}
      .fg-football{width:150px;height:64px;margin:0 auto -14px;display:block;filter:drop-shadow(0 6px 4px rgba(0,0,0,.4))}
      .fg-title{position:relative;z-index:2;margin:0;font:900 clamp(36px,8vw,78px)/.92 Impact,Haettenschweiler,'Arial Narrow Bold',sans-serif;letter-spacing:2px;color:#fff;-webkit-text-stroke:2px #0b0d15;text-shadow:0 4px 0 #c8141e,0 8px 0 #091a33,0 10px 12px rgba(0,0,0,.45)}
      .fg-ribbon{position:relative;z-index:2;display:inline-block;margin-top:9px;padding:7px 30px;background:linear-gradient(#e41f2a,#aa0710);color:#fff;font:800 clamp(16px,3.2vw,30px)/1.1 Georgia,serif;letter-spacing:2px;border:2px solid #7d060c;box-shadow:0 4px 0 #071a31;text-transform:uppercase}
      .fg-tagline{position:relative;z-index:2;margin:10px 0 0;font-weight:800;letter-spacing:3px;font-size:clamp(10px,2vw,15px);color:#fff;text-transform:uppercase}
      header.fg-hero #who{position:absolute;right:14px;top:12px;z-index:4;background:rgba(4,30,60,.88);border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:8px 10px;color:#fff;font-weight:700}
      header.fg-hero #who button{padding:5px 8px;background:#fff;color:#0b2448;border-radius:7px;font-size:12px}
      #app nav{display:flex;gap:8px;overflow-x:auto;padding:10px 0 2px}
      #app nav button{white-space:nowrap;background:#fff;color:#16345e;border:1px solid #d6e0ed;box-shadow:0 2px 5px rgba(8,34,65,.06)}
      #app nav button:hover{background:#eaf3ff}
      #picks>.card{border-radius:18px;box-shadow:0 8px 24px rgba(23,53,91,.08)}
      #games>.card,#games section>.card{position:relative;border-radius:14px;padding:18px 18px 16px;margin:14px 0;border:1px solid #dce5ef;box-shadow:0 3px 10px rgba(23,53,91,.05)}
      #games .fg-network{position:absolute;right:16px;top:14px;font:900 15px/1 Arial,sans-serif;letter-spacing:.2px;color:#0b2448;background:#edf3fa;border:1px solid #d7e1ed;border-radius:8px;padding:7px 9px}
      #games .fg-network[data-network="ESPN"]{color:#d71920;background:#fff0f1;border-color:#f4c7ca}
      #games .fg-network[data-network="FOX"]{color:#173f78;background:#eef5ff}
      #games .fg-network[data-network="ABC"]{color:#fff;background:#111;border-color:#111;border-radius:50%;padding:8px}
      #games .fg-network[data-network="ACC Network"]{color:#fff;background:#153d77}
      #games .card>b{display:block;padding-right:125px;font-size:17px;margin-bottom:5px}
      #games .pick{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:52px;padding:9px 15px;vertical-align:middle}
      #games .pick .fg-team-logo{width:38px;height:38px;object-fit:contain;flex:0 0 38px}
      #games .pick.chosen .fg-team-logo{filter:drop-shadow(0 1px 1px rgba(0,0,0,.2))}
      @media(max-width:600px){header.fg-hero{padding-top:20px}.fg-football{width:112px;height:50px}.fg-title{-webkit-text-stroke:1.5px #0b0d15}.fg-ribbon{padding:6px 15px}.fg-tagline{letter-spacing:1.7px}.fg-title{font-size:48px}header.fg-hero #who{font-size:13px;right:8px;top:7px;padding:6px 7px}#games .card>b{padding-right:95px}.fg-network{font-size:13px!important}.pick{max-width:47%;min-width:44%;margin:5px 1%!important;padding:8px!important}.pick .fg-team-logo{width:32px!important;height:32px!important;flex-basis:32px!important}}
    `;document.head.append(s);
  }
  function buildHero(){
    const h=document.querySelector('header');if(!h || h.classList.contains('fg-hero'))return;
    h.classList.add('fg-hero');
    h.innerHTML=`<svg class="fg-football" viewBox="0 0 180 80" aria-hidden="true"><ellipse cx="90" cy="40" rx="78" ry="31" fill="#a9481f" stroke="#5b1c0c" stroke-width="4"/><path d="M33 18q57 20 114 0M33 62q57-20 114 0" fill="none" stroke="#fff" stroke-width="9" opacity=".96"/><path d="M71 39h38M77 29v20M86 27v24M95 27v24M104 29v20" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg><div class="fg-title">FOUR GUY</div><div class="fg-ribbon">★ FOOTBALL PICKS ★</div><div class="fg-tagline">Picks • Trash Talk • Bragging Rights</div><div id="who"></div>`;
  }
  function decorateGames(){
    const root=document.getElementById('games');if(!root)return;
    root.querySelectorAll('.card').forEach(card=>{
      const matchup=card.querySelector('b')?.textContent?.trim();if(!matchup)return;
      const parts=matchup.split(' @ ');if(parts.length!==2)return;
      const network=networks[matchup];
      if(network && !card.querySelector('.fg-network')){const badge=document.createElement('span');badge.className='fg-network';badge.dataset.network=network;badge.textContent=network;card.append(badge);}
      const buttons=[...card.querySelectorAll('button.pick')];
      buttons.forEach((button,i)=>{
        if(button.querySelector('.fg-team-logo'))return;
        const team=parts[i] || '';
        const src=logo(team);if(!src)return;
        const img=document.createElement('img');img.className='fg-team-logo';img.src=src;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';button.prepend(img);
      });
    });
  }
  function start(){
    addStyles();buildHero();decorateGames();
    const games=document.getElementById('games');if(games)new MutationObserver(decorateGames).observe(games,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
