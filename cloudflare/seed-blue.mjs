/**
 * Deploy-time one-shot blue post backfill. No API credentials are read here.
 * SQL is applied using Wrangler's authenticated remote D1 command in CI.
 */
import {writeFileSync} from 'node:fs';
import {fetchBluePosts} from './blue-posts.mjs';
const out='./.blue-posts-seed.sql';
const quote=value=>"'"+String(value).replace(/'/g,"''")+"'";
let statements=['-- Azeroth Radar: non-destructive, source-verified blue post backfill'];
try{
  const now=Date.now();
  const posts=await fetchBluePosts(fetch,now);
  for(const p of posts)statements.push(
    'INSERT INTO official(id,payload,last_seen) VALUES('+
      [p.id,JSON.stringify(p),now].map(quote).join(',')+
      ') ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen;');
  statements.push('INSERT INTO scans(at,provider,status,count,error) VALUES('+
    [now,'blizzard-blue','complete',posts.length,''].map(quote).join(',')+');');
  console.log('Preparing '+posts.length+' fresh WoW Forever blue posts for D1 backfill');
}catch(err){
  console.warn('Blue post feed unavailable; deployment continues and hourly cron will retry: '+
    String(err?.message||err).slice(0,180));
}
statements.push('SELECT 1;');
writeFileSync(out,statements.join('\n')+'\n',{mode:0o600});
