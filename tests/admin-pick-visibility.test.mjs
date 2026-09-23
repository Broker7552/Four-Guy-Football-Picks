import assert from 'node:assert/strict';

globalThis.Deno={env:{get:()=>undefined},serve:()=>{}};
const {handle}=await import('../supabase/functions/college-admin/index.ts');
const env=name=>({SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'server-key'}[name]);
const request=()=>new Request('https://fn.test',{method:'POST',headers:{Authorization:'Bearer user'},body:JSON.stringify({action:'manual_get',week_id:3})});
const paths=[];
const fetcher=async url=>{
  const path=new URL(url).pathname+new URL(url).search;paths.push(path);
  if(path==='/auth/v1/user')return Response.json({id:'admin'});
  if(path.includes('pool_settings'))return Response.json([{admin_user_id:'admin'}]);
  if(path.includes('pool_members'))return Response.json([{role:'admin'}]);
  if(path.includes('pool_weeks'))return Response.json([{id:3}]);
  if(path.includes('pool_games'))return Response.json([{id:10,home_team:'Home',away_team:'Away'}]);
  if(path.includes('pool_picks'))return Response.json([{game_id:10,user_id:'player',picked_team:'Away'}]);
  throw new Error('Unexpected request '+path);
};
const response=await handle(request(),env,fetcher);
assert.equal(response.status,200);
assert.deepEqual((await response.json()).picks,[{game_id:10,user_id:'player',picked_team:'Away'}]);
assert.ok(paths.some(path=>path.includes('pool_picks?game_id=in.(10)')),'Only published game picks are fetched');

paths.length=0;
const denied=await handle(request(),env,async url=>{
  const path=new URL(url).pathname+new URL(url).search;paths.push(path);
  return Response.json(path==='/auth/v1/user'?{id:'player'}:[{admin_user_id:'admin'}]);
});
assert.equal(denied.status,403);
assert.ok(!paths.some(path=>path.includes('pool_picks')),'Players cannot access others’ private picks');
