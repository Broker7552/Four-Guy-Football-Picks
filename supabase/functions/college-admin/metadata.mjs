const key=value=>String(value || '').toLowerCase().replace(/[^a-z0-9]/g,'');
const cache=new Map();
export function buildMetadata(teams,polls,ratings,season,maxWeek) {
  const entries=teams.map(t=>({name:t.school,aliases:[t.school,...(t.alternateNames || [])],conference:t.conference || null,classification:t.classification || null,ap:null,sp:null}));
  const lookup=name=>{const matches=entries.filter(t=>t.aliases.some(a=>key(a)===key(name)));return matches.length===1?matches[0]:null;};
  const latest=polls.filter(p=>p.season===season && p.seasonType==='regular' && p.week<=maxWeek && p.polls?.some(x=>x.poll==='AP Top 25'))
    .sort((a,b)=>b.week-a.week)[0];
  const ap=latest?.polls.find(p=>p.poll==='AP Top 25')?.ranks || [];
  for(const rank of ap) {const team=lookup(rank.school);if(team && Number.isInteger(rank.rank) && rank.rank>=1 && rank.rank<=25) team.ap=rank.rank;}
  for(const rating of ratings) {const team=lookup(rating.team);if(team && rating.year===season && Number.isInteger(rating.ranking) && rating.ranking>0) team.sp=rating.ranking;}
  return {teams:entries,season,ap_week:latest?.week ?? null,ap_available:entries.some(t=>t.ap),sp_available:entries.some(t=>t.sp),fetched_at:new Date().toISOString()};
}
export async function fetchMetadata(week,env,fetcher=fetch) {
  const cacheKey=week.season+':'+week.week_number;
  const saved=cache.get(cacheKey);
  if(saved && Date.now()<saved.expires) return saved.data;
  const apiKey=env('CFBD_API_KEY');
  if(!apiKey) return {teams:[],warnings:['Conference and ranking data unavailable: CFBD key is not configured.']};
  const warnings=[];
  async function get(path,label) {
    try {
      const res=await fetcher('https://api.collegefootballdata.com/'+path,{headers:{Authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(15000)});
      if(!res.ok) throw new Error();
      const data=await res.json();if(!Array.isArray(data))throw new Error();return data;
    } catch {warnings.push(label+' unavailable. Games remain accessible in All.');return [];}
  }
  const [teams,polls,ratings]=await Promise.all([get('teams','Conferences'),get('rankings?year='+week.season,'AP rankings'),get('ratings/sp?year='+week.season,'SP+ ratings')]);
  const data={...buildMetadata(teams,polls,ratings,week.season,week.week_number),warnings};
  if(!data.ap_available && !warnings.some(w=>w.startsWith('AP'))) warnings.push('AP rankings are not yet available for this season/week.');
  if(!data.sp_available && !warnings.some(w=>w.startsWith('SP+'))) warnings.push('SP+ ratings are not yet available for this season.');
  cache.set(cacheKey,{data,expires:Date.now()+(warnings.length?60000:3600000)});
  return data;
}
