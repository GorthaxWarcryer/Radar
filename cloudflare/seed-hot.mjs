/**
 * Non-destructive deploy-time HOT backfill. Bridges the GitHub->Cloudflare
 * hourly sync gap for newly recovered uploads. No YouTube API or AI calls.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {fromGithubVideo} from './transform.mjs';

const quote=value=>"'"+String(value).replace(/'/g,"''")+"'";
export function buildHotSeedStatements(feed,now=Date.now()) {
  if(!feed||!Array.isArray(feed.videos)||!Array.isArray(feed.catalog))
    throw Error('Invalid HOT companion feed');
  const ranked=[...feed.videos.slice(0,60),...feed.catalog.slice(0,40)];
  const ids=new Map();
  // HOT is first, so preserve its full sample history where available.
  for(const item of ranked)if(item?.id&&!ids.has(item.id))ids.set(item.id,item);
  const statements=['-- Non-destructive Azeroth Radar HOT/Popular deploy backfill'];
  let count=0;
  for(const source of ids.values()) {
    const video=fromGithubVideo(source,now);
    if(!video)continue;
    const at=Number(video.observedAt)||Number(source.hotMeasuredAt)||Number(feed.generatedAt);
    if(!Number.isFinite(at)||at<=0||at>now)continue;
    const row=[video.id,JSON.stringify(video),at];
    statements.push('INSERT INTO videos(id,payload,last_seen) VALUES('+row.map(quote).join(',')+
      ') ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen'+
      ' WHERE excluded.last_seen>=videos.last_seen;');
    const sample=(source.samples||[]).filter(s=>Number.isFinite(s.capturedAt)&&
      Number.isSafeInteger(s.views)&&s.views>=0&&s.capturedAt<=now).slice(-4);
    for(const observation of sample) {
      statements.push('INSERT OR IGNORE INTO video_samples(id,at,views,source) VALUES('+
        [video.id,observation.capturedAt,observation.views,observation.source||'github-deploy'].map(quote).join(',')+');');
    }
    count++;
  }
  statements.push('SELECT 1;');
  return {count,sql:statements.join('\n')+'\n'};
}
if(process.argv[1]?.endsWith('/seed-hot.mjs')) {
  const feed=JSON.parse(readFileSync('./docs/hot/latest.json','utf8'));
  const result=buildHotSeedStatements(feed);
  writeFileSync('./.hot-videos-seed.sql',result.sql,{mode:0o600});
  console.log('Prepared '+result.count+' fresh HOT/Popular video records for non-destructive D1 backfill.');
}
