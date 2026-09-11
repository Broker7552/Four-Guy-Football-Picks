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
    message(open()?'Enter only the picks supplied by the selected player. Unchosen games stay unchanged.':'This week’s picks are locked.');controls();
  }
  async function initialize(){
    const current=generation,data=await api({action:'manual_options'});if(current!==generation)return;
    weeks=data.weeks;
    for(const id of ['manual-week','manual-player'])el(id).replaceChildren();
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose player';el('manual-player').append(placeholder);
    for(const player of data.players){const o=document.createElement('option');o.value=player.user_id;o.textContent=player.display_name;el('manual-player').append(o);}
    for(const w of weeks){const o=document.createElement('option');o.value=w.id;o.textContent=w.season+' · Week '+w.week_number;el('manual-week').append(o);}
    el('manual-members').textContent='Only registered pool members appear here. Players must join the pool before their picks can be entered.';
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
