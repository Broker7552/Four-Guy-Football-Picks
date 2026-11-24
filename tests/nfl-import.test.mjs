import assert from 'node:assert/strict';
import {buildNflGames} from '../supabase/functions/college-admin/nfl.mjs';

const event=(id,date,away,home)=>({id,date,competitions:[{competitors:[{homeAway:'away',team:{displayName:away}},{homeAway:'home',team:{displayName:home}}]}]});
const odds=(away,home,homePoint)=>({away_team:away,home_team:home,bookmakers:[{key:'draftkings',markets:[{key:'spreads',outcomes:[{name:away,point:-homePoint},{name:home,point:homePoint}]}]}]});
const week={id:12,picks_due_at:'2026-11-25T22:00:00Z'};
const events=[
  event('wed','2026-11-26T01:00:00Z','Green Bay Packers','Los Angeles Rams'),
  event('thu','2026-11-26T18:00:00Z','Chicago Bears','Detroit Lions'),
  event('sun','2026-11-30T01:20:00Z','Las Vegas Raiders','Cleveland Browns'),
  event('mon','2026-12-01T01:15:00Z','Carolina Panthers','Tampa Bay Buccaneers'),
  event('old','2026-11-25T18:00:00Z','Other Away','Other Home')
];
const lines=[odds('Green Bay Packers','Los Angeles Rams',-2.5),odds('Chicago Bears','Detroit Lions',2.5),odds('Las Vegas Raiders','Cleveland Browns',-4.5),odds('Carolina Panthers','Tampa Bay Buccaneers',-3)];
const games=buildNflGames(events,lines,week);
assert.equal(games.length,4);
assert.deepEqual(games.map(g=>g.point_value),[1,1,2,2]);
assert.equal(games[0].favorite_team,'Los Angeles Rams');
assert.equal(games[1].favorite_team,'Chicago Bears');
assert.throws(()=>buildNflGames(events,lines.slice(1),week),/spread missing/);
assert.throws(()=>buildNflGames(events,[...lines,lines[0]],week),/ambiguous/);
console.log('NFL schedule import checks passed');
