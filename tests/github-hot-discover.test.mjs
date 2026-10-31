import test from 'node:test';
import assert from 'node:assert/strict';
import {durationSeconds,normalizeDiscovery,discover,merge} from '../scripts/github-hot-discover.mjs';
const T=Date.parse('2026-10-31T10:00:00Z'),H=3600000;
const good={
 id:'1GEmk7Fci2E',
 snippet:{title:'The Best Addons in WoW Forever',channelTitle:'Creator',
   publishedAt:new Date(T-H).toISOString(),defaultAudioLanguage:'en',channelId:'UCcreator0000000000000001'},
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
test('quota-bounded discovery uses three searches, one official playlist and one details batch',async()=>{
 const calls=[];
 const fetcher=async u=>{
   const url=new URL(u);calls.push(url.pathname);
   assert.equal(url.searchParams.get('key'),'fake-secret');
   if(url.pathname.endsWith('/playlistItems'))return {ok:true,json:async()=>({items:[]})};
   if(url.pathname.endsWith('/search'))return {ok:true,json:async()=>({
     items:[{id:{videoId:good.id}}]})};
   return {ok:true,json:async()=>({items:[good]})};
 };
 const x=await discover('fake-secret',{fetcher,now:T,queries:['A','B','C']});
 assert.equal(x.stats.searches,3);
 assert.equal(x.stats.officialPlaylistCalls,1);
 assert.equal(x.stats.detailCalls,1);
 assert.equal(x.videos.length,1);
 assert.equal(calls.length,5);
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

test('direct official channel uploads are discovered without a topical keyword',async()=>{
  const officialId='UCbLj9QP9FAaHs_647QckGtg';
  const uploadId='abcABC123_-';
  const upload={...good,id:uploadId,snippet:{...good.snippet,title:'New Cinematic Trailer',
    channelTitle:'World of Warcraft',channelId:officialId}};
  const fetcher=async uri=>{
    const u=new URL(uri);
    if(u.pathname.endsWith('/search'))return {ok:true,json:async()=>({items:[]})};
    if(u.pathname.endsWith('/playlistItems')){
      assert.equal(u.searchParams.get('playlistId'),'UUbLj9QP9FAaHs_647QckGtg');
      return {ok:true,json:async()=>({items:[{contentDetails:{videoId:uploadId}}]})};
    }
    return {ok:true,json:async()=>({items:[upload]})};
  };
  const result=await discover('fake-secret',{fetcher,now:T});
  assert.equal(result.videos.length,1);
  assert.equal(result.videos[0].channelId,officialId);
  assert.equal(result.stats.officialUploads,1);
});
test('display name imitation never grants official verified channel identity',()=>{
  const spoof={...good,snippet:{...good.snippet,channelTitle:'World of Warcraft',
    channelId:'UCcreator0000000000000001'}};
  const x=normalizeDiscovery(spoof,T);
  assert.equal(x.channelId,'UCcreator0000000000000001');
  assert.notEqual(x.channelId,'UCbLj9QP9FAaHs_647QckGtg');
});
