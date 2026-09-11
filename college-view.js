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
