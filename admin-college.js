/* Weekly college selection only. Existing login, picks and NFL code is unchanged. */
(() => {
  const el=id=>document.getElementById(id);
  let state=null, selected=new Set(), busy=false, dirty=false, generation=0;
  let visibleIds=new Set(), editingId=null, revisionReview=null;
  const filterIds=['college-conference','college-ranked','college-verified','college-search','college-sort','college-selected-only'];
  function filters(){return {conference:el('college-conference').value,ranked:el('college-ranked').value,verified:el('college-verified').checked,search:el('college-search').value,sort:el('college-sort').value,selected:el('college-selected-only').checked};}
  const time=value=>value ? new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(value))+' ET' : 'TBD';
  const message=text=>{el('college-message').textContent=text;};
  const editable=()=>state && (state.revision || (state.week.week_number>2 && state.week.status==='setup' && !state.draft.published_at && Date.now()<Date.parse(state.week.spread_lock_at)));
  function controls() {
    el('college-edit-published').hidden=!(state && !state.revision && state.week.week_number>1 && ['published','open','picks_open'].includes(state.week.status));
    el('college-edit-published').disabled=busy;
    el('college-discard-revision').hidden=!state?.revision;
    el('college-discard-revision').disabled=busy;
    el('college-edit-save').disabled=busy;
    el('college-week').disabled=busy;
    el('college-next').disabled=busy;
    el('college-reload').disabled=busy;
    for(const id of ['college-refresh','college-save','college-review']) el(id).disabled=busy || !editable();
    el('college-confirm').disabled=busy || !editable() || (state?.revision && (!revisionReview || (revisionReview.changes.some(c=>c.pick_count>0) && !el('college-ack-picks').checked)));
    el('college-count').textContent=selected.size+' College '+(selected.size===1?'Game':'Games')+(dirty?' — unsaved selections':'');
    const hidden=[...selected].filter(id=>!visibleIds.has(id)).length;
    el('college-visible').textContent=visibleIds.size+' of '+(state?.draft.candidates.length || 0)+' games shown'+(hidden?' · '+hidden+' selected games hidden by filters':'')+'. Filters never remove selections.';
    filterIds.forEach(id=>el(id).disabled=busy);
    el('college-rows').querySelectorAll('input').forEach(input=>{input.disabled=busy || !editable();});
    el('college-rows').querySelectorAll('button').forEach(button=>{button.disabled=busy || !state?.revision;});
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
    el('college-preview').hidden=true;revisionReview=null;
    if(!state) { visibleIds=new Set();el('college-ratings').textContent='';controls(); return; }
    const {week,draft,nfl_count}=state;
    el('college-deadlines').textContent='Spread lock: '+time(week.spread_lock_at)+' · Picks due: '+time(week.picks_due_at);
    el('college-source').textContent='Schedule: CollegeFootballData · Spreads: DraftKings via The Odds API · Last import: '+(draft.refreshed_at?time(draft.refreshed_at):'Not loaded');
    el('college-nfl').textContent=nfl_count+' NFL games currently selected for this week. College selection does not change NFL games.';
    const metadata=state.metadata || {};
    el('college-ratings').textContent=(metadata.ap_available?'AP Top 25: '+metadata.season+' week '+metadata.ap_week:'AP rankings unavailable')+' · '+(metadata.sp_available?'SP+: '+metadata.season+' season ratings; Top 50 means SP+ rank 1–50':'SP+ ratings unavailable')+'. '+(metadata.warnings || []).join(' ');
    const displayed=CollegeView.view(draft.candidates,metadata,filters(),selected);
    visibleIds=new Set(displayed.map(row=>row.game.id));
    for(const row of displayed) {
      const {game,home,away}=row;
      const tr=document.createElement('tr');
      const selectCell=document.createElement('td');
      const checkbox=document.createElement('input'); checkbox.type='checkbox'; checkbox.checked=selected.has(game.id);
      checkbox.setAttribute('aria-label','Select '+game.away_team+' at '+game.home_team);
      checkbox.addEventListener('change',()=>{checkbox.checked?selected.add(game.id):selected.delete(game.id);dirty=true;el('college-preview').hidden=true;if(el('college-selected-only').checked)render();else controls();});
      selectCell.append(checkbox);tr.append(selectCell);
      const label=(team,name)=>(team.ap?'#'+team.ap+' ':'')+name+(team.sp?' (SP+ #'+team.sp+')':'');
      const conference=team=>team.conference || 'Conference unavailable';
      const tag=row.featured===0?'Ranked vs ranked':row.featured===1?'Major conference + verified spread':'';
      const values=[label(away,game.away_team)+' @ '+label(home,game.home_team)+(tag?' — '+tag:''),conference(away)+' / '+conference(home),time(game.kickoff_at),game.favorite_team && game.spread!==null ? game.favorite_team+' '+game.spread : 'Unavailable',row.verified?'Verified spread':game.issue || 'Line needs refresh'];
      for(const value of values) {const td=document.createElement('td');td.textContent=value;tr.append(td);}
      if(state.revision) {const button=document.createElement('button');button.type='button';button.textContent='Edit game';button.disabled=busy;button.addEventListener('click',()=>openGameEditor(game));tr.lastChild.append(document.createElement('br'),button);}
      rows.append(tr);
    }
    if(!displayed.length) {const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent=draft.candidates.length?'No games match these filters. Clear filters to see the full schedule.':editable()?'Choose “Load / refresh games” to retrieve the upcoming weekend’s schedule.':'No editable college draft for this week.';tr.append(td);rows.append(tr);}
    controls();
  }
  async function loadWeek() {
    const current=generation;
    const data=await api({action:'get',week_id:Number(el('college-week').value)});
    if(current!==generation) return;
    state=data;selected=new Set(data.draft.selected_ids);dirty=false;editingId=null;el('college-game-editor').hidden=true;render();
    message(state.revision?'Editing a revision. Published games remain live until you review and republish. Removed games and their picks are retained.':editable()?'Select any number of college games. Save your draft, then review it before publishing.':'This week is read-only. Choose Edit published week to revise its college games.');
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
    const data=await api({action:state.revision?'revision_save':'save',week_id:state.week.id,version:state.draft.version,selected_ids:[...selected],...(state.revision?{candidates:state.draft.candidates}:{})});
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
    const data=await api({action:state.revision?'revision_refresh':'refresh',week_id:state.week.id,version:state.draft.version});
    state.draft=data.draft;render();message(data.message || 'Games refreshed. Your saved selections were preserved.');
  }));
  el('college-review').addEventListener('click',()=>task(async()=>{
    if(dirty) await save();
    render();
    if(state.revision) {
      const data=await api({action:'revision_review',week_id:state.week.id,version:state.draft.version});
      revisionReview=data.review;
      el('college-preview-text').textContent='Republish Week '+state.week.week_number+' with the changes below? NFL games, picks, scores and deadlines will be preserved. Removed games stay on record. Replaced matchups get a new game record; existing picks stay with the original matchup.';
      const list=el('college-preview-games');list.replaceChildren();
      const describe=g=>g?g.away_team+' @ '+g.home_team+' · '+time(g.kickoff_at)+' · '+g.favorite_team+' '+g.spread+' · Venue: '+(g.venue || 'Not specified'):'';
      for(const change of revisionReview.changes) {const li=document.createElement('li');li.textContent=change.action.toUpperCase()+': '+describe(change.before)+(change.after?' → '+describe(change.after):'')+' · '+change.pick_count+' existing picks'+(change.pick_count?' — WARNING: this change affects a game with saved picks. Picks will be retained.':'');list.append(li);}
      if(!revisionReview.changes.length) {const li=document.createElement('li');li.textContent='No college game changes.';list.append(li);}
      el('college-pick-warning').hidden=!revisionReview.changes.some(c=>c.pick_count>0);
      el('college-ack-picks').checked=false;
      el('college-confirm').textContent='Confirm republish';el('college-preview').hidden=false;
      message('Review every change before republishing. No published data has changed.');return;
    }
    el('college-pick-warning').hidden=true;el('college-confirm').textContent='Confirm publication';
    const games=state.draft.candidates.filter(g=>selected.has(g.id));
    if(games.some(g=>g.issue || !g.kickoff_at || !g.favorite_team || g.spread===null)) throw new Error('Deselect or resolve games marked unavailable before publishing.');
    if(!state.draft.refreshed_at || Date.now()-Date.parse(state.draft.refreshed_at)>86400000) throw new Error('Refresh the games before publishing.');
    el('college-preview-text').textContent='Publish '+selected.size+' college games for Week '+state.week.week_number+'? These spreads will be fixed and the games will appear on Current Picks. '+state.nfl_count+' selected NFL games will remain unchanged.';
    const list=el('college-preview-games');list.replaceChildren();
    for(const game of games) {const li=document.createElement('li');li.textContent=game.away_team+' @ '+game.home_team+' · '+time(game.kickoff_at)+' · '+game.favorite_team+' '+game.spread;list.append(li);}
    el('college-preview').hidden=false;message('Review the games below, then confirm publication.');
  }));
  el('college-cancel').addEventListener('click',()=>{el('college-preview').hidden=true;});
  filterIds.forEach(id=>el(id).addEventListener(id==='college-search'?'input':'change',render));
  el('college-clear').addEventListener('click',()=>{el('college-conference').value='All';el('college-ranked').value='all';el('college-search').value='';el('college-verified').checked=false;el('college-selected-only').checked=false;el('college-sort').value='featured';render();});
  el('college-confirm').addEventListener('click',()=>task(async()=>{
    await api({action:state.revision?'revision_publish':'publish',week_id:state.week.id,version:state.draft.version,...(state.revision?{token:revisionReview?.token,acknowledge_picks:el('college-ack-picks').checked}:{})});
    await listWeeks(state.week.id);message('College games published.');
  }));

  el('college-edit-published').addEventListener('click',()=>task(async()=>{
    await api({action:'revision_open',week_id:state.week.id});await loadWeek();
  }));
  el('college-discard-revision').addEventListener('click',()=>task(async()=>{
    await api({action:'revision_discard',week_id:state.week.id,version:state.draft.version});await loadWeek();message('Revision discarded. Published games remain unchanged.');
  }));
  el('college-ack-picks').addEventListener('change',controls);
  function openGameEditor(game) {
    editingId=game.id;
    for(const key of ['home_team','away_team','favorite_team','spread','venue']) el('college-edit-'+key).value=game[key] ?? '';
    el('college-edit-kickoff_at').value=CollegeRevisionTime.toEastern(game.kickoff_at);
    el('college-game-editor').hidden=false;
    el('college-preview').hidden=true;revisionReview=null;
    el('college-game-editor').scrollIntoView({block:'nearest'});
  }
  el('college-edit-cancel').addEventListener('click',()=>{editingId=null;el('college-game-editor').hidden=true;});
  el('college-edit-save').addEventListener('click',()=>{
    if(busy || !state?.revision || !editingId) return;
    try {
      const game=state.draft.candidates.find(g=>g.id===editingId), next={...game};
      for(const key of ['home_team','away_team','favorite_team','venue']) next[key]=el('college-edit-'+key).value.trim();
      next.spread=Number(el('college-edit-spread').value);
      next.kickoff_at=el('college-edit-kickoff_at').value===CollegeRevisionTime.toEastern(game.kickoff_at)?game.kickoff_at:CollegeRevisionTime.fromEastern(el('college-edit-kickoff_at').value);
      if(!next.venue) next.venue=game.venue || null;
      if(!next.home_team || !next.away_team || next.home_team===next.away_team || ![next.home_team,next.away_team].includes(next.favorite_team) || !Number.isFinite(next.spread) || next.spread>=0) throw new Error('Enter different teams, a favorite matching one team, and a negative spread.');
      Object.assign(game,next,{manual_override:true,issue:''});dirty=true;
      editingId=null;el('college-game-editor').hidden=true;render();message('Game changed in the draft only. Save, review, then republish to apply it.');
    } catch(error) {message(error.message);}
  });

  sb.auth.onAuthStateChange(event=>{
    if(event==='SIGNED_OUT') {generation++;state=null;selected=new Set();busy=false;dirty=false;el('college-week').replaceChildren();render();message('');for(const id of ['college-deadlines','college-source','college-nfl']) el(id).textContent='';}
  });
})();
