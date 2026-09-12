/* Administrator-only proxy entry; existing private picks are never downloaded. */
(() => {
  const el=id=>document.getElementById(id);
  let busy=false,review=null,weeks=[],games=[],generation=0;
  const message=text=>el('manual-message').textContent=text;
  const choices=()=>[...el('manual-games').querySelectorAll('select')].filter(x=>x.value).map(x=>({game_id:Number(x.dataset.game),picked_team:x.value}));
  const time=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'long',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))+' ET';
  const open=()=>{const w=weeks.find(w=>w.id===Number(el('manual-week').value));return w && Date.now()<Date.parse(w.picks_due_at);};
  function controls(){
    el('manual-panel').querySelectorAll('button,select,input').forEach(x=>x.disabled=busy);
    el('manual-review').disabled=busy || !open() || !el('manual-player').value;
    el('manual-confirm').disabled=busy || !review || !open() || (review.existing_count>0 && !el('manual-ack').checked);
    el('manual-games').querySelectorAll('select').forEach(x=>x.disabled=busy || !open());
  }
  function invalidate(){review=null;el('manual-preview').hidden=true;controls();}
  async function api(body){
    const {data,error}=await sb.functions.invoke('college-admin',{body});
    if(error){let detail;try{detail=await error.context.json();}catch{}throw new Error(detail?.error || error.message);}
    if(data?.error)throw new Error(data.error);return data;
  }
  async function task(fn){if(busy)return;busy=true;controls();const current=generation;try{await fn();}catch(e){if(current===generation)message(e.message);}finally{if(current===generation){busy=false;controls();}}}
  async function loadGames(){
    invalidate();const current=generation;
    if(!el('manual-week').value)return;
    const data=await api({action:'manual_get',week_id:Number(el('manual-week').value)});
    if(current!==generation)return;
    games=data.games;const w=weeks.find(w=>w.id===Number(el('manual-week').value));
    el('manual-deadline').textContent='Picks due: '+time(w.picks_due_at)+'. Administrator entry uses the same deadline.';
    el('manual-games').replaceChildren();
    for(const game of games){
      const row=document.createElement('div');row.style.margin='12px 0';
      const label=document.createElement('label');label.textContent=game.away_team+' @ '+game.home_team+' · '+game.favorite_team+' '+game.spread+' ';
      const select=document.createElement('select');select.dataset.game=game.id;
      for(const [value,text] of [['','Leave unchanged'],[game.away_team,game.away_team],[game.home_team,game.home_team]]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
      select.addEventListener('change',invalidate);label.append(select);row.append(label);el('manual-games').append(row);
    }
    message(open()?'Enter only the picks supplied by the selected player. Unchosen games stay unchanged.':'This week’s production picks are locked. Use the Week 2 Test Run panel below for post-deadline testing.');controls();
  }
  async function initialize(){
    const current=generation,data=await api({action:'manual_options'});if(current!==generation)return;
    weeks=data.weeks;
    for(const id of ['manual-week','manual-player'])el(id).replaceChildren();
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose player';el('manual-player').append(placeholder);
    for(const player of data.players){const o=document.createElement('option');o.value=player.user_id;o.textContent=player.display_name;el('manual-player').append(o);}
    for(const w of weeks){const o=document.createElement('option');o.value=w.id;o.textContent=w.season+' · Week '+w.week_number;el('manual-week').append(o);}
    el('manual-members').textContent='Production entry only lists real registered pool accounts. Use the test panel below to simulate Scott, Ross, Ken and Jim before Week 3.';
    await loadGames();
  }
  el('adminBtn').addEventListener('click',()=>task(initialize));
  el('manual-reload').addEventListener('click',()=>task(initialize));
  el('manual-week').addEventListener('change',()=>task(loadGames));
  el('manual-player').addEventListener('change',()=>{el('manual-games').querySelectorAll('select').forEach(x=>x.value='');invalidate();message('Player changed. Enter this player’s picks.');});
  el('manual-review').addEventListener('click',()=>task(async()=>{
    const picks=choices();invalidate();
    const data=await api({action:'manual_review',week_id:Number(el('manual-week').value),player_id:el('manual-player').value,picks});
    review={...data.review,picks,player:el('manual-player').value,week:Number(el('manual-week').value)};
    const name=el('manual-player').selectedOptions[0].textContent;
    el('manual-review-text').textContent='Save '+picks.length+' picks for '+name+'? '+review.existing_count+' of these games already have a saved pick. Other players’ picks and omitted games stay unchanged.';
    el('manual-review-list').replaceChildren();
    for(const pick of picks){const g=games.find(g=>g.id===pick.game_id),li=document.createElement('li');li.textContent=g.away_team+' @ '+g.home_team+': '+pick.picked_team;el('manual-review-list').append(li);}
    el('manual-warning').hidden=review.existing_count===0;el('manual-ack').checked=false;el('manual-preview').hidden=false;message('Review these picks before saving.');
  }));
  el('manual-ack').addEventListener('change',controls);
  el('manual-cancel').addEventListener('click',invalidate);
  el('manual-confirm').addEventListener('click',()=>task(async()=>{
    if(!review)return;
    const data=await api({action:'manual_save',week_id:review.week,player_id:review.player,picks:review.picks,token:review.token,acknowledge:el('manual-ack').checked});
    await loadGames();message('Picks saved. '+data.saved+' picks added or changed.');
  }));
  sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){generation++;busy=false;review=null;weeks=[];games=[];el('manual-games').replaceChildren();el('manual-preview').hidden=true;message('');}});
})();

/* Isolated administrator test run. This never writes to production pool_picks. */
(() => {
  const production=document.getElementById('manual-panel');
  if(!production)return;
  const panel=document.createElement('div');
  panel.className='card';panel.id='test-picks-panel';
  panel.innerHTML='<h2>Week 2 Test Run</h2><p class="notice"><b>Test only:</b> enter Scott, Ross, Ken and Jim picks here, then publish the test to preview the revealed-picks screen. These entries do not change production picks or create accounts for the other players.</p><label>Week <select id="test-week"></select></label> <label>Player <select id="test-player"></select></label> <button id="test-reload" type="button">Reload test</button><p id="test-status" class="muted"></p><div id="test-games"></div><button id="test-save" type="button">Save this player’s test picks</button> <button id="test-publish" type="button">Publish test picks</button> <button id="test-hide" type="button">Hide test picks</button> <button id="test-reset" type="button">Reset Week test</button><p id="test-message" role="status" aria-live="polite"></p><div id="test-live"></div>';
  production.after(panel);
  const el=id=>document.getElementById(id);
  let busy=false,weeks=[],games=[],state={participants:['Scott','Ross','Ken','Jim'],picks:[],is_live:false};
  const message=text=>el('test-message').textContent=text;
  async function api(body){const {data,error}=await sb.functions.invoke('college-admin',{body});if(error){let detail;try{detail=await error.context.json();}catch{}throw new Error(detail?.error || error.message);}if(data?.error)throw new Error(data.error);return data;}
  function controls(){panel.querySelectorAll('button,select').forEach(x=>x.disabled=busy);el('test-save').disabled=busy || !el('test-player').value || !games.length;el('test-publish').disabled=busy || !games.length || state.is_live;el('test-hide').disabled=busy || !state.is_live;}
  async function task(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){message(e.message);}finally{busy=false;controls();}}
  function selectedPicks(){return [...el('test-games').querySelectorAll('select[data-game]')].filter(x=>x.value).map(x=>({game_id:Number(x.dataset.game),picked_team:x.value}));}
  function renderLive(){
    const box=el('test-live');box.replaceChildren();
    if(!state.is_live){box.innerHTML='<p class="muted">Test picks are still private. Use “Publish test picks” when all four players are entered.</p>';return;}
    const title=document.createElement('h3');title.textContent='LIVE TEST — Revealed Picks';box.append(title);
    const wrap=document.createElement('div');wrap.className='scroll';
    const table=document.createElement('table');const head=document.createElement('thead');const hr=document.createElement('tr');
    for(const text of ['Game',...state.participants]){const th=document.createElement('th');th.textContent=text;hr.append(th);}head.append(hr);table.append(head);
    const body=document.createElement('tbody');
    for(const game of games){const tr=document.createElement('tr');const gameCell=document.createElement('td');gameCell.textContent=game.away_team+' @ '+game.home_team+' · '+game.favorite_team+' '+game.spread;tr.append(gameCell);for(const name of state.participants){const td=document.createElement('td');const pick=state.picks.find(p=>p.game_id===game.id&&p.participant_name===name);td.textContent=pick?.picked_team || '—';tr.append(td);}body.append(tr);}table.append(body);wrap.append(table);box.append(wrap);
  }
  function renderEditor(){
    const name=el('test-player').value,box=el('test-games');box.replaceChildren();
    if(!name){box.innerHTML='<p class="muted">Choose a player to enter test picks.</p>';return;}
    for(const game of games){const row=document.createElement('div');row.style.margin='12px 0';const label=document.createElement('label');label.textContent=game.away_team+' @ '+game.home_team+' · '+game.favorite_team+' '+game.spread+' ';const select=document.createElement('select');select.dataset.game=game.id;for(const [value,text] of [['','No test pick'],[game.away_team,game.away_team+(game.favorite_team===game.away_team?' '+game.spread:'')],[game.home_team,game.home_team+(game.favorite_team===game.home_team?' '+game.spread:'')]]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}const saved=state.picks.find(p=>p.game_id===game.id&&p.participant_name===name);select.value=saved?.picked_team || '';label.append(select);row.append(label);box.append(row);}
  }
  async function loadState(){
    if(!el('test-week').value)return;
    const data=await api({action:'test_get',week_id:Number(el('test-week').value)});games=data.games;state=data.state;
    el('test-status').textContent='Week '+data.week.week_number+' · '+(state.is_live?'TEST IS LIVE':'test draft')+' · '+state.picks.length+' saved test picks';
    renderEditor();renderLive();message(state.is_live?'The test is published below. You can hide it, make changes, and publish again.':'Enter each player’s picks, save each player, then publish the test.');
  }
  async function initialize(){
    const data=await api({action:'test_options'});weeks=data.weeks;state.participants=data.participants;
    el('test-week').replaceChildren();for(const w of weeks){const o=document.createElement('option');o.value=w.id;o.textContent=w.season+' · Week '+w.week_number;el('test-week').append(o);}const week2=weeks.find(w=>w.week_number===2);if(week2)el('test-week').value=week2.id;
    el('test-player').replaceChildren();const blank=document.createElement('option');blank.value='';blank.textContent='Choose player';el('test-player').append(blank);for(const name of data.participants){const o=document.createElement('option');o.value=name;o.textContent=name;el('test-player').append(o);}await loadState();
  }
  el('adminBtn').addEventListener('click',()=>task(initialize));
  el('test-reload').addEventListener('click',()=>task(loadState));
  el('test-week').addEventListener('change',()=>task(loadState));
  el('test-player').addEventListener('change',renderEditor);
  el('test-save').addEventListener('click',()=>task(async()=>{const picks=selectedPicks();if(!picks.length)throw new Error('Choose at least one test pick.');await api({action:'test_save',week_id:Number(el('test-week').value),participant:el('test-player').value,picks});await loadState();message(el('test-player').value+' test picks saved.');}));
  el('test-publish').addEventListener('click',()=>task(async()=>{await api({action:'test_publish',week_id:Number(el('test-week').value)});await loadState();message('Test picks are now LIVE in the preview below.');}));
  el('test-hide').addEventListener('click',()=>task(async()=>{await api({action:'test_hide',week_id:Number(el('test-week').value)});await loadState();message('Test picks hidden.');}));
  el('test-reset').addEventListener('click',()=>{if(confirm('Reset all saved test picks for this week? Production picks are not affected.'))task(async()=>{await api({action:'test_reset',week_id:Number(el('test-week').value)});await loadState();message('Week test reset.');});});
  controls();
})();
