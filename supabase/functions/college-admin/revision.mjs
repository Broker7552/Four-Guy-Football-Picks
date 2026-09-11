import { fetchCandidates } from './providers.mjs';

// Keep published and manually edited candidates intact when refreshing the source list.
export function mergeRevisionCandidates(current, imported, selectedIds) {
  const selected=new Set(selectedIds);
  const preserved=current.filter(g=>g.game_id || g.manual_override || selected.has(g.id));
  const ids=new Set(preserved.map(g=>g.id));
  return [...preserved,...imported.filter(g=>!ids.has(g.id))];
}

export async function revisionAction(input,week,db,user,env,fetcher) {
  const action=input.action.slice('revision_'.length);
  const rpc=(action,payload={})=>db('rpc/manage_college_revision',{p_action:action,p_actor:user.id,p_week_id:week.id,p_version:input.version ?? null,p_payload:payload});
  if(action==='open' || action==='discard') return {draft:await rpc(action)};
  if(action==='save') return {draft:await rpc('save',{candidates:input.candidates,selected_ids:input.selected_ids})};
  if(action==='review') return {review:await rpc('review')};
  if(action==='publish') return {draft:await rpc('publish',{token:input.token,acknowledge_picks:input.acknowledge_picks===true})};
  if(action==='refresh') {
    const draft=await rpc('get');
    if(draft.version!==input.version) throw new Error('The revision changed. Reload it before continuing');
    if(draft.refreshed_at && Date.now()-Date.parse(draft.refreshed_at)<15*60000) return {draft,message:'Using the recent schedule import.'};
    const imported=await fetchCandidates(week,[],env,fetcher);
    return {draft:await rpc('refresh',{candidates:mergeRevisionCandidates(draft.candidates,imported,draft.selected_ids),selected_ids:draft.selected_ids})};
  }
  throw new Error('Unknown revision action');
}
