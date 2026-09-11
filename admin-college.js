/* Weekly college selection only. Existing login, picks and NFL code is unchanged. */
(() => {
  const el=id=>document.getElementById(id);
  let state=null, selected=new Set(), busy=false, dirty=false, generation=0;
  const time=value=>value ? new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(value))+' ET' : 'TBD';
  const message=text=>{el('college-message').textContent=text;};
  const editable=()=>state && state.week.week_number>2 && state.week.status==='setup' && !state.draft.published_at && Date.now()<Date.parse(state.week.spread_lock_at);
  function controls() {
    el('college-week').disabled=busy;
    el('college-next').disabled=busy;
    el('college-reload').disabled=busy;
    for(const id of ['college-refresh','college-save','college-review']) el(id).disabled=busy || !editable();
    el('college-confirm').disabled=busy || !editable();
    el('college-count').textContent=selected.size+' College '+(selected.size===1?'Game':'Games')+(dirty?' — unsaved selections':'');
    el('college-rows').querySelectorAll('input').forEach(input=>{input.disabled=busy || !editable();});
  }
  async function api(body) {
    const {data,error}=await sb.functions.invoke('college-admin',{body});
    if(error) {
      let detail;
      try { detail=await error.context.json(); } catch {}
      throw new Error(detail?.error || error.message || 'Unable to load college games');
    }
    if(data?.error) throw new Error(data.error);
    return data;
  }
  async function task(fn) {
    if(busy) return;
    const current=generation;
    busy=true; controls(); message('Working…');
    try { await fn(); }
    catch(error) { if(current===generation) message(error.message); }
    finally { if(current===generation) {busy=false;controls();} }
  }
  function render() {
    const rows=el('college-rows'); rows.replaceChildren();
    el('college-preview').hidden=true;
    if(!state) { controls(); return; }
    const {week,draft,nfl_count}=state;
    el('college-deadlines').textContent='Spread lock: '+time(week.spread_lock_at)+' · Picks due: '+time(week.picks_due_at);
    el('college-source').textContent='Schedule: CollegeFootballData · Spreads: DraftKings via The Odds API · Last import: '+(draft.refreshed_at?time(draft.refreshed_at):'Not loaded');
    el('college-nfl').textContent=nfl_count+' NFL games currently selected for this week. College selection does not change NFL games.';
    for(const game of draft.candidates) {
      const tr=document.createElement('tr');
      const selectCell=document.createElement('td');
      const checkbox=document.createElement('input'); checkbox.type='checkbox'; checkbox.checked=selected.has(game.id);
      checkbox.setAttribute('aria-label','Select '+game.away_team+' at '+game.home_team);
      checkbox.addEventListener('change',()=>{checkbox.checked?selected.add(game.id):selected.delete(game.id);dirty=true;el('college-preview').hidden=true;controls();});
      selectCell.append(checkbox);tr.append(selectCell);
      const values=[game.away_team+' @ '+game.home_team,time(game.kickoff_at),game.favorite_team && game.spread!==null ? game.favorite_team+' '+game.spread : 'Unavailable',game.issue || 'Ready'];
      for(const value of values) {const td=document.createElement('td');td.textContent=value;tr.append(td);}
      rows.append(tr);
    }
    if(!draft.candidates.length) {const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent=editable()?'Choose “Load / refresh games” to retrieve the upcoming weekend’s schedule.':'No editable college draft for this week.';tr.append(td);rows.append(tr);}
    controls();
  }
  async function loadWeek() {
    const current=generation;
    const data=await api({action:'get',week_id:Number(el('college-week').value)});
    if(current!==generation) return;
    state=data;selected=new Set(data.draft.selected_ids);dirty=false;render();
    message(editable()?'Select any number of college games. Save your draft, then review it before publishing.':'This week is read-only. Published games and past deadlines cannot be changed here.');
  }
  async function listWeeks(preferred) {
    const current=generation;
    const {weeks}=await api({action:'list'});
    if(current!==generation) return;
    el('college-week').replaceChildren();
    for(const week of weeks) {const option=document.createElement('option');option.value=week.id;option.textContent=week.season+' · Week '+week.week_number+' · '+week.status;el('college-week').append(option);}
    if(preferred) el('college-week').value=preferred;
    if(weeks.length) await loadWeek(); else message('No configured pool weeks found.');
  }
  async function save() {
    const data=await api({action:'save',week_id:state.week.id,version:state.draft.version,selected_ids:[...selected]});
    state.draft=data.draft;selected=new Set(data.draft.selected_ids);dirty=false;
  }
  el('adminBtn').addEventListener('click',()=>task(()=>listWeeks(state?.week.id)));
  el('college-reload').addEventListener('click',()=>task(()=>listWeeks(state?.week.id)));
  el('college-week').addEventListener('change',()=>task(loadWeek));
  el('college-next').addEventListener('click',()=>task(async()=>{
    const {week}=await api({action:'prepare_next'});await listWeeks(week.id);
  }));
  el('college-save').addEventListener('click',()=>task(async()=>{await save();render();message('Draft saved. Current Picks has not changed.');}));
  el('college-refresh').addEventListener('click',()=>task(async()=>{
    if(dirty) await save();
    const data=await api({action:'refresh',week_id:state.week.id,version:state.draft.version});
    state.draft=data.draft;render();message(data.message || 'Games refreshed. Your saved selections were preserved.');
  }));
  el('college-review').addEventListener('click',()=>task(async()=>{
    if(dirty) await save();
    render();
    const games=state.draft.candidates.filter(g=>selected.has(g.id));
    if(games.some(g=>g.issue || !g.kickoff_at || !g.favorite_team || g.spread===null)) throw new Error('Deselect or resolve games marked unavailable before publishing.');
    if(!state.draft.refreshed_at || Date.now()-Date.parse(state.draft.refreshed_at)>86400000) throw new Error('Refresh the games before publishing.');
    el('college-preview-text').textContent='Publish '+selected.size+' college games for Week '+state.week.week_number+'? These spreads will be fixed and the games will appear on Current Picks. '+state.nfl_count+' selected NFL games will remain unchanged.';
    const list=el('college-preview-games');list.replaceChildren();
    for(const game of games) {const li=document.createElement('li');li.textContent=game.away_team+' @ '+game.home_team+' · '+time(game.kickoff_at)+' · '+game.favorite_team+' '+game.spread;list.append(li);}
    el('college-preview').hidden=false;message('Review the games below, then confirm publication.');
  }));
  el('college-cancel').addEventListener('click',()=>{el('college-preview').hidden=true;});
  el('college-confirm').addEventListener('click',()=>task(async()=>{
    await api({action:'publish',week_id:state.week.id,version:state.draft.version});
    await listWeeks(state.week.id);message('College games published.');
  }));
  sb.auth.onAuthStateChange(event=>{
    if(event==='SIGNED_OUT') {generation++;state=null;selected=new Set();busy=false;dirty=false;el('college-week').replaceChildren();render();message('');for(const id of ['college-deadlines','college-source','college-nfl']) el(id).textContent='';}
  });
})();
