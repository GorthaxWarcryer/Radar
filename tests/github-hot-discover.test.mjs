import test from 'node:test';
import assert from 'node:assert/strict';
import {durationSeconds,normalizeDiscovery,discover,merge} from '../scripts/github-hot-discover.mjs';
const T=Date.parse('2026-10-31T10:00:00Z'),H=3600000;
const good={
 id:'1GEmk7Fci2E',
 snippet:{title:'The Best Addons in WoW Forever',channelTitle:'Creator',
   publishedAt:new Date(T-H).toISOString(),defaultAudioLanguage:'en'},
 statistics:{viewCount:'7400'},
 contentDetails:{duration:'PT13M'}
};
test('ISO 8601 YouTube durations parsed',()=>{
 assert.equal(durationSeconds('PT1H30M5S'),5405);
 assert.equal(durationSeconds('PT13M'),780);
});
test('normalize qualified English Warcraft upload',()=>{
 const x=normalizeDiscovery(good,T);
 assert.equal(x.id,good.id);assert.equal(x.views,7400);assert.equal(x.isShort,false);
 assert.equal(x.hotMeasuredAt,T);
});
test('never include archived streams, Russian or unrelated content',()=>{
 assert.equal(normalizeDiscovery({...good,liveStreamingDetails:{actualEndTime:'2026-10-31T00:00:00Z'}},T),null);
 assert.equal(normalizeDiscovery({...good,snippet:{...good.snippet,title:'Варкрафт обновления'}},T),null);
 assert.equal(normalizeDiscovery({...good,snippet:{...good.snippet,title:'¿WoW apocalíptico?'}},T),null);
 assert.equal(normalizeDiscovery({...good,snippet:{...good.snippet,title:'New Coffee Review'}},T),null);
});
test('only videos with real valid publication timestamp and counts',()=>{
 assert.equal(normalizeDiscovery({...good,statistics:{viewCount:'unknown'}},T),null);
 assert.equal(normalizeDiscovery({...good,snippet:{...good.snippet,publishedAt:'BAD'}},T),null);
});
test('quota-bounded discovery uses 3 searches and one batched video details call',async()=>{
 const calls=[];
 const fetcher=async u=>{
   const url=new URL(u);calls.push(url.pathname);
   assert.equal(url.searchParams.get('key'),'fake-secret');
   if(url.pathname.endsWith('/search'))return {ok:true,json:async()=>({
     items:[{id:{videoId:good.id}}]})};
   return {ok:true,json:async()=>({items:[good]})};
 };
 const x=await discover('fake-secret',{fetcher,now:T,queries:['A','B','C']});
 assert.equal(x.stats.searches,3);
 assert.equal(x.stats.detailCalls,1);
 assert.equal(x.videos.length,1);
 assert.equal(calls.length,4);
});
test('missing key rejected without making calls',async()=>{
 await assert.rejects(discover('',{fetcher:async()=>{throw Error('must not call')}}),/missing/);
});
test('merge retains recent previously discovered videos',()=>{
 const old=normalizeDiscovery(good,T-H/2), newer={...old,views:9000,hotMeasuredAt:T};
 const x=merge({videos:[old]},[newer],T);
 assert.equal(x.videos.length,1);
 assert.equal(x.videos[0].views,9000);
});
