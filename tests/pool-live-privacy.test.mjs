import assert from 'node:assert/strict';

let handler;
globalThis.Deno={
  env:{get:name=>({SUPABASE_URL:'https://pool.test',SUPABASE_SERVICE_ROLE_KEY:'server-key'}[name])},
  serve:fn=>{handler=fn}
};
await import('../supabase/functions/pool-live/index.ts');

const originalFetch=globalThis.fetch;
const originalNow=Date.now;
const clock=Date.parse('2026-11-18T17:00:00Z');
Date.now=()=>clock;
const request=()=>new Request('https://pool.test/functions/v1/pool-live',{
  method:'POST',headers:{Authorization:'Bearer member-token'},
  body:JSON.stringify({week_number:12})
});
async function run(revealAt){
  const paths=[];
  globalThis.fetch=async (input)=>{
    const url=new URL(input);
    paths.push(url.pathname+url.search);
    if(url.pathname==='/auth/v1/user')return Response.json({id:'player-1'});
    if(url.pathname==='/rest/v1/pool_members')return Response.json(url.searchParams.has('user_id')
      ?[{user_id:'player-1',display_name:'Ross',role:'player'}]
      :[{user_id:'player-1',display_name:'Ross'},{user_id:'player-2',display_name:'Jim'}]);
    if(url.pathname==='/rest/v1/rpc/apply_pool_anti_clone_flips')return Response.json({});
    if(url.pathname==='/rest/v1/pool_weeks')return Response.json([{
      id:11,season:2026,week_number:12,status:'published',
      picks_due_at:new Date(clock-1000).toISOString(),picks_visible_at:revealAt
    }]);
    if(url.pathname==='/rest/v1/pool_games')return Response.json([{
      id:1,sport:'nfl',home_team:'Home',away_team:'Away',
      favorite_team:'Home',spread:-3.5,point_value:1,kickoff_at:'2026-11-22T18:00:00Z'
    }]);
    if(url.pathname==='/rest/v1/pool_picks')return Response.json([
      {game_id:1,user_id:'player-1',picked_team:'Home'},
      {game_id:1,user_id:'player-2',picked_team:'Away'}
    ]);
    if(url.pathname==='/rest/v1/pool_week_results')return Response.json([]);
    if(url.hostname==='site.api.espn.com')return Response.json({events:[]});
    throw new Error('Unexpected request '+url);
  };
  const response=await handler(request());
  assert.equal(response.status,200);
  return {data:await response.json(),paths};
}
try{
  const before=await run(new Date(clock+1000).toISOString());
  assert.deepEqual(before.data.picks,[]);
  assert.ok(before.data.standings.every(row=>row.points===0));
  assert.ok(!before.paths.some(path=>path.includes('pool_picks')||path.includes('pool_week_results')||path.includes('apply_pool_anti_clone_flips')));
  const after=await run(new Date(clock-1000).toISOString());
  assert.equal(after.data.picks.length,2);
  assert.ok(after.paths.some(path=>path.includes('pool_picks')));
  console.log('PASS: no choices or derived points before reveal; picks available after reveal.');
}finally{
  globalThis.fetch=originalFetch;
  Date.now=originalNow;
}
