import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, summary, pollYoutubeViews, selectCandidates } from '../scripts/github-hot-bridge.mjs';
const H=3600000, T=Date.parse('2026-10-31T10:00:00Z');
const item=(id,views,age=1,seen=T)=>({id,title:'Video '+id,
  publishedAt:T-age*H,views,hotLatestViews:views,hotMeasuredAt:seen,width:640,height:360});

test('initial 6k views in one hour is 6k/h estimated',()=>{
  const v=calculate({videos:[item('a',6000)]},{},T).videos[0];
  assert.equal(v.vph,6000);assert.equal(v.estimate,true);
});
test('new genuine measurement replaces initial estimate',()=>{
  const one=calculate({videos:[item('a',6000)]},{},T);
  const next={...item('a',8000,1,T+H),publishedAt:T-H};
  const v=calculate({videos:[next]},one,T+H).videos[0];
  assert.equal(v.vph,2000);assert.equal(v.estimate,false);assert.equal(v.intervalMinutes,60);
});
test('polling unchanged Site data cannot fabricate measured rate',()=>{
  const first=calculate({videos:[item('a',6000)]},{},T);
  const next=calculate({videos:[item('a',6000)]},first,T+H).videos[0];
  assert.equal(next.estimate,true);assert.equal(next.samples.length,1);
});
test('prior snapshot from Site can be used even without GitHub history',()=>{
  const v={...item('a',8000),hotPriorAt:T-H,hotPriorViews:6000,publishedAt:T-2*H};
  const x=calculate({videos:[v]},{},T).videos[0];
  assert.equal(x.vph,2000);assert.equal(x.estimate,false);
});
test('an overnight pair is real but labeled by interval',()=>{
  const v={...item('a',15000),hotPriorAt:T-9*H,hotPriorViews:6000,publishedAt:T-11*H};
  const x=calculate({videos:[v]},{},T).videos[0];
  assert.equal(x.vph,1000);assert.equal(x.intervalMinutes,540);
});
test('25 hour old upload and below threshold are both excluded',()=>{
  const x=calculate({videos:[item('old',6000,25),item('low',4999)]},{},T);
  assert.equal(x.videos.length,0);
});
test('shorts separate from long-form',()=>{
  const x=calculate({videos:[{...item('a',8000),height:1138},item('b',6000)]},{},T);
  assert.deepEqual(x.rankings.shortsHot,['a']);assert.deepEqual(x.rankings.hot,['b']);
});
test('missing timestamp cannot become invented sample',()=>{
  const v=item('a',6000);delete v.hotMeasuredAt;delete v.lastSeen;
  assert.equal(calculate({videos:[v]},{},T).videos.length,0);
});
test('GitHub summary explains it is not original Site',()=>{
  const text=summary(calculate({videos:[item('a',6000)]},{},T));
  assert.match(text,/does not override its UI/i);assert.match(text,/Estimated since upload/);
});


const ID1='abcABC123_-', ID2='QWEasd123_-', ID3='Zxy9876_asD';
const createAPI=(views={})=>async uri=>{
  const u=new URL(uri), ids=u.searchParams.get('id').split(',');
  assert.equal(u.hostname,'www.googleapis.com');
  assert.equal(u.searchParams.get('part'),'statistics');
  assert.equal(u.searchParams.get('key'),'test-secret-not-for-logs');
  return {ok:true,status:200,json:async()=>({items:ids.filter(id=>views[id]!=null)
    .map(id=>({id,statistics:{viewCount:String(views[id])}}))})};
};
test('missing YouTube API key does not generate synthetic observations',async()=>{
  const r=await pollYoutubeViews([{id:ID1}],'');
  assert.equal(r.status,'missing-key'); assert.equal(r.requests,0);assert.deepEqual(r.observations,[]);
});
test('YouTube statistics endpoint returns actual snapshots, without querying search',async()=>{
  const r=await pollYoutubeViews([{id:ID1},{id:ID2}], 'test-secret-not-for-logs',
    {fetcher:createAPI({[ID1]:8000,[ID2]:6100}),clock:()=>T});
  assert.equal(r.status,'connected');assert.equal(r.requests,1);
  assert.equal(r.observations.length,2);assert.deepEqual(r.observations.map(x=>x.views),[8000,6100]);
});
test('YouTube API batches 120 video IDs into exactly 3 calls of 50',async()=>{
  const ids=Array.from({length:120},(_,i)=>String(i).padStart(11,'0'));
  let calls=0;const requested=[];
  const fake=async u=>{
    calls++;const idsInQuery=new URL(u).searchParams.get('id').split(',');
    requested.push(idsInQuery.length);
    return {ok:true,status:200,json:async()=>({items:idsInQuery.map(id=>({id,statistics:{viewCount:'9000'}}))})};
  };
  const r=await pollYoutubeViews(ids.map(id=>({id})), 'test-secret-not-for-logs',{fetcher:fake,clock:()=>T});
  assert.equal(calls,3);assert.deepEqual(requested,[50,50,20]);assert.equal(r.observations.length,120);
});
test('YouTube HTTP error sanitized without leaking API key or URL',async()=>{
  await assert.rejects(
    pollYoutubeViews([{id:ID1}],'test-secret-not-for-logs',
      {fetcher:async()=>({ok:false,status:403})}),
    e=>e.message.includes('HTTP 403')&&!e.message.includes('test-secret-not-for-logs'));
});
test('new hourly YouTube observation produces real measured VPH',async()=>{
  const feed={videos:[{...item(ID1,6000),publishedAt:T-H}]};
  const first=calculate(feed,{},T);
  const api=await pollYoutubeViews([{id:ID1}],'test-secret-not-for-logs',
    {fetcher:createAPI({[ID1]:8000}),clock:()=>T+H});
  const second=calculate(feed,first,T+H,api);
  assert.equal(second.youtubeApi.status,'connected');
  assert.equal(second.videos[0].vph,2000);
  assert.equal(second.videos[0].velocityType,'measured-hourly');
  assert.equal(second.videos[0].views,8000);
  assert.equal(second.videos[0].latestObservedAt,T+H);
});
test('near-threshold candidates retain real observations and enter HOT later',async()=>{
  const base={...item(ID1,4500),publishedAt:T-H};
  const first=calculate({videos:[base]}, {}, T);
  assert.equal(first.videos.length,0);
  assert.equal(first.watchSamples[ID1].length,1);
  const api=await pollYoutubeViews([{id:ID1}],'test-secret-not-for-logs',
    {fetcher:createAPI({[ID1]:6600}),clock:()=>T+H});
  const second=calculate({videos:[base]},first,T+H,api);
  assert.equal(second.videos.length,1);
  assert.equal(second.videos[0].vph,2100);
  assert.equal(second.videos[0].estimate,false);
});
test('only within-24h videos eligible for hourly YouTube polling',()=>{
 const feed={videos:[{...item(ID1,12000),publishedAt:T-25*H},
    {...item(ID2,9000),publishedAt:T-1*H},
    {...item(ID3,6000),isLivestream:true,publishedAt:T-1*H}]};
 assert.deepEqual(selectCandidates(feed,T).map(v=>v.id),[ID2]);
});
test('published report makes API connection state explicit',()=>{
 const r=calculate({videos:[item(ID1,6000)]},{},T);
 assert.match(summary(r),/missing-key/);
 assert.match(summary(r),/No new YouTube view-count measurements/);
});
