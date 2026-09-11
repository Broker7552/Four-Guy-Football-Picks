import { fetchCandidates } from './providers.mjs';
import { fetchMetadata } from './metadata.mjs';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});

// JWT verification is also enabled at the gateway. Revalidate the user and
// database-backed administrator role on EVERY request, before reading secrets.
export async function handle(req, env=Deno.env.get, fetcher=fetch) {
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return reply({error:'POST required'},405);
  const url=env('SUPABASE_URL'), key=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!url || !key) return reply({error:'Server configuration is incomplete'},503);
  const authorization=req.headers.get('Authorization');
  if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in required'},401);
  try {
    const userResponse=await fetcher(url+'/auth/v1/user',{headers:{apikey:key,Authorization:authorization},signal:AbortSignal.timeout(10000)});
    if(!userResponse.ok) return reply({error:'Sign in required'},401);
    const user=await userResponse.json();
    if(!user.id) return reply({error:'Sign in required'},401);
    async function db(path,body) {
      const res=await fetcher(url+'/rest/v1/'+path,{method:body===undefined?'GET':'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
      const data=await res.json();
      if(!res.ok) throw new Error(data.message || 'Database request failed');
      return data;
    }
    const settings=await db('pool_settings?id=eq.1&select=admin_user_id');
    if(settings[0]?.admin_user_id!==user.id) return reply({error:'Administrator access required'},403);
    const members=await db('pool_members?user_id=eq.'+encodeURIComponent(user.id)+'&select=role');
    if(members[0]?.role!=='admin') return reply({error:'Administrator access required'},403);
    const input=await req.json();
    if(input.action==='list') return reply({weeks:await db('pool_weeks?select=*&order=season.desc,week_number.desc')});
    const rpc=(action,payload={})=>db('rpc/manage_college_draft',{p_action:action,p_actor:user.id,p_week_id:input.week_id ?? null,p_version:input.version ?? null,p_payload:payload});
    if(input.action==='prepare_next') return reply({week:await rpc('prepare_next')});
    if(!Number.isSafeInteger(input.week_id)) return reply({error:'Choose a week'},400);
    const weeks=await db('pool_weeks?id=eq.'+input.week_id+'&select=*');
    const week=weeks[0];
    if(!week) return reply({error:'Week not found'},404);
    const drafts=await db('pool_college_drafts?week_id=eq.'+week.id+'&select=*');
    const draft=drafts[0] || {week_id:week.id,version:0,candidates:[],selected_ids:[],refreshed_at:null,published_at:null};
    if(input.action==='get') {
      const nfl=await db('pool_games?week_id=eq.'+week.id+'&sport=eq.nfl&selected_for_pool=eq.true&select=id');
      return reply({week,draft,nfl_count:nfl.length,metadata:await fetchMetadata(week,env,fetcher)});
    }
    if(week.week_number<=2 || week.status!=='setup' || !week.spread_lock_at || Date.now()>=Date.parse(week.spread_lock_at) || draft.published_at) return reply({error:'This week is read-only or its spread-lock deadline has passed'},409);
    if(input.version!==draft.version) return reply({error:'The draft changed. Reload before continuing.'},409);
    if(input.action==='refresh') {
      if(draft.refreshed_at && Date.now()-Date.parse(draft.refreshed_at)<15*60000) return reply({draft,message:'Using the recent import. Provider refreshes are available every 15 minutes.'});
      const candidates=await fetchCandidates(week,draft.candidates,env,fetcher);
      return reply({draft:await rpc('refresh',{candidates})});
    }
    if(input.action==='save') return reply({draft:await rpc('save',{selected_ids:input.selected_ids})});
    if(input.action==='publish') return reply({draft:await rpc('publish')});
    return reply({error:'Unknown action'},400);
  } catch(error) {
    // Never log request URLs, Authorization headers, keys, or provider bodies.
    return reply({error:error instanceof Error ? error.message : 'Unable to complete the request'},400);
  }
}

Deno.serve(req=>handle(req));
