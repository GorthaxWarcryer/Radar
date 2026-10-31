import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{synchronize} from '../worker.mjs';
import {fromGithubVideo,buildFeed,normalizeIncomingStory} from '../transform.mjs';

const H=3600000,T=Date.parse('2026-10-31T10:00:00Z');
const video={id:'1GEmk7Fci2E',title:'WoW Forever Addons',channel:'Example',
  publishedAt:T-H,isShort:false,samples:[{capturedAt:T,views:6000}],views:6000};
test('new upload appears immediately in HOT using views divided by age',()=>{
 const entry=fromGithubVideo(video,T);
 assert.equal(entry.views,6000);assert.equal(entry.growth.perHour,6000);
 assert.equal(entry.growth.kind,'estimated-since-upload');
 const feed=buildFeed({videos:[entry],now:T});
 assert.equal(feed.hot.long.length,1);
 assert.equal(feed.popular.long.length,1);
});
test('measured increase correctly replaces initial estimate',()=>{
 const v={...video,samples:[{capturedAt:T,views:6000},{capturedAt:T+H,views:8000}]};
 const entry=fromGithubVideo(v,T+H);
 assert.equal(entry.growth.perHour,2000);
 assert.equal(entry.growth.kind,'measured-hourly');
});
test('HOT expires at 24h, Popular preserves earlier 48h uploads',()=>{
 const a=fromGithubVideo({...video,publishedAt:T-25*H,samples:[{capturedAt:T-24*H,views:12000}]},T);
 const feed=buildFeed({videos:[a],now:T});
 assert.equal(feed.hot.long.length,0);
 assert.equal(feed.popular.long.length,1);
});
test('Reddit Stories require actual hot/top membership evidence',()=>{
 const p={id:'reddit:test',title:'An interesting Warcraft post',url:'https://www.reddit.com/r/wow/comments/test/',
   publishedAt:T-H,sort:'hot',listingUrl:'https://www.reddit.com/r/wow/hot/',observedAt:T};
 assert.ok(normalizeIncomingStory(p,'Reddit',T));
 assert.equal(normalizeIncomingStory({...p,listingUrl:''},'Reddit',T),null);
 assert.equal(normalizeIncomingStory({...p,observedAt:T-3*H},'Reddit',T),null);
});
test('saves stay private on public feed',()=>{
 const saved=[{id:'x',title:'Private memo',note:'Do not display'}];
 assert.equal(buildFeed({saved,privateSaved:false,now:T}).saved.length,0);
 assert.equal(buildFeed({saved,privateSaved:true,now:T}).saved.length,1);
});
test('Worker without D1 returns controlled 503, not demo data',async()=>{
 const response=await worker.fetch(new Request('https://example.com/api/health'),{});
 assert.equal(response.status,503);
});
test('Worker disallows anonymous administrative import',async()=>{
 const response=await worker.fetch(new Request('https://example.com/api/import',{method:'POST',
   headers:{'content-type':'application/json'},body:JSON.stringify({saved:[{id:'x'}]})}),
   {DB:{},ADMIN_TOKEN:'a'.repeat(48)});
 assert.equal(response.status,401);
});
test('hourly sync writes genuine GitHub timestamp and samples into D1',async()=>{
 const writes=[],rowQueries=[];
 const DB={
   prepare(sql){const entry={sql,bind(...args){return{sql,args}}};rowQueries.push(entry);return entry},
   async batch(xs){writes.push(...xs);return xs.map(()=>({success:true}))}
 };
 const github={generatedAt:T,videos:[video],watchSamples:{
   '1GEmk7Fci2E':[{capturedAt:T,views:6000,source:'youtube-data-api'}]}};
 const fetcher=async()=>({ok:true,json:async()=>github});
 const result=await synchronize({DB},fetcher,T+10000);
 assert.equal(result.status,'complete');assert.equal(result.videos,1);
 assert.equal(result.samples,1);
 assert.ok(writes.some(x=>x.sql.startsWith('INSERT OR IGNORE INTO video_samples')&&x.args[1]===T));
 assert.ok(writes.some(x=>x.sql.startsWith('INSERT INTO meta')&&x.args[0]==='lastCloudflareSyncAt'));
});
test('unknown website paths do not expose an administrative API',async()=>{
 const req=new Request('https://example.com/api/not-real');
 const DB={};
 const response=await worker.fetch(req,{DB});
 assert.equal(response.status,404);
});

test('D1 catalog stores 30-hour Popular candidates without promoting them into HOT',async()=>{
  const writes=[];
  const DB={prepare(sql){return{bind(...args){return{sql,args}}}},async batch(rows){writes.push(...rows);return rows.map(()=>({success:true}))}};
  const older={...video,id:'1JhKzviW1h8',publishedAt:T-30*H,views:17000,samples:[{capturedAt:T,views:17000}]};
  const feed={generatedAt:T,videos:[video],catalog:[older]};
  const out=await synchronize({DB},async()=>({ok:true,json:async()=>feed}),T);
  assert.equal(out.videos,2);
  assert.ok(writes.some(row=>row.sql.startsWith('INSERT INTO videos')&&row.args.some(x=>typeof x==='string'&&x.includes('1JhKzviW1h8'))));
  const normalized=fromGithubVideo(older,T);
  const ranking=buildFeed({videos:[normalized],now:T});
  assert.equal(ranking.hot.long.length,0);
  assert.equal(ranking.popular.long.length,1);
});
test('all newly added research and channel mutations reject anonymous requests',async()=>{
  for(const [path,payload] of [
    ['/api/research/status',{id:'video',status:'Published'}],
    ['/api/channels',{id:'UCbLj9QP9FAaHs_647QckGtg'}],
    ['/api/discovery/settings',{queries:['WoW Forever']}],
    ['/api/hide-video',{id:'1GEmk7Fci2E',hidden:true}]
  ]) {
    const r=await worker.fetch(new Request('https://example.com'+path,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)
    }),{DB:{},ADMIN_TOKEN:'z'.repeat(48)});
    assert.equal(r.status,401,path);
  }
});
test('former billable AI endpoint is removed completely',async()=>{
  const r=await worker.fetch(new Request('https://example.com/api/content/develop',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({id:'opportunity:forever:paladin'})
  }),{DB:{},ADMIN_TOKEN:'x'.repeat(48),OPENAI_API_KEY:'unused'.repeat(20),AI_IDEAS_ENABLED:'true'});
  assert.equal(r.status,404);
});
test('public discovery config is bounded and does not expose credentials',async()=>{
  const DB={prepare(sql){return {bind(){return {all:async()=>({results:[]})}}}}};
  const r=await worker.fetch(new Request('https://example.com/api/discovery/config'),{DB});
  assert.equal(r.status,200);
  const body=await r.json();
  assert.ok(body.queries.includes('WoW Forever'));
  assert.equal(body.channels.length,0);
  assert.equal(JSON.stringify(body).includes('API_TOKEN'),false);
});
