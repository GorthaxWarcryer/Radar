import test from 'node:test';
import assert from 'node:assert/strict';
import {durationSeconds,normalizeDiscovery,discover,merge,discoveryQueriesForTime,VERIFIED_RECOVERY_VIDEO_IDS} from '../scripts/github-hot-discover.mjs';
import {readFileSync} from 'node:fs';
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

test('priority WoW discovery runs hourly, full discovery every 3h including overnight',()=>{
  const terms=['WoW Forever','World of Warcraft Forever','WoW Classic'];
  const plan=iso=>discoveryQueriesForTime(terms,Date.parse(iso));
  assert.deepEqual(plan('2026-11-03T19:08:00Z').queries,terms.slice(0,1)); // 21:08 Kyiv
  assert.equal(plan('2026-11-03T19:08:00Z').mode,'priority');
  assert.deepEqual(plan('2026-11-03T21:08:00Z').queries,terms); // 23:08 Kyiv
  assert.equal(plan('2026-11-03T21:08:00Z').mode,'full');
  assert.equal(plan('2026-11-03T23:08:00Z').queries.length,1); // 01:08 Kyiv
  assert.equal(plan('2026-11-04T00:08:00Z').mode,'full'); // 02:08 Kyiv
  let searches=0;
  for(let hour=0;hour<24;hour++)
    searches+=discoveryQueriesForTime(terms,Date.parse('2026-11-04T00:00:00+02:00')+hour*3600000).queries.length;
  assert.equal(searches,40,'24/7 priority+full scans use 40 YouTube search.list requests/day');
});

test('GitHub discovery and view measurement cron entries cover all 24 hours',()=>{
 const discovery=readFileSync(new URL('../.github/workflows/github-youtube-discovery.yml',import.meta.url),'utf8');
 const sampling=readFileSync(new URL('../.github/workflows/github-hot-companion.yml',import.meta.url),'utf8');
 assert.match(discovery,/cron: '8 \* \* \* \*'/);
 assert.match(sampling,/cron: '17 \* \* \* \*'/);
 assert.match(discovery,/timezone: Europe\/Kyiv/);
 assert.match(sampling,/timezone: Europe\/Kyiv/);
});

test('completed official 30-minute Premiere is discovered rather than excluded as a livestream',()=>{
 const eventAt=Date.parse('2026-11-03T17:00:00Z');
 const now=Date.parse('2026-11-03T21:00:00Z');
 const premiere={id:'n2Wg46fwmb0',
   snippet:{title:'Launch Overview | World of Warcraft: Forever',
     channelTitle:'World of Warcraft',channelId:'UCbLj9QP9FAaHs_647QckGtg',
     publishedAt:'2026-11-02T20:26:00Z',liveBroadcastContent:'none',
     defaultAudioLanguage:'en'},
   statistics:{viewCount:'45700',likeCount:'1200'},
   contentDetails:{duration:'PT30M'},
   liveStreamingDetails:{scheduledStartTime:'2026-11-03T17:00:00Z',
     actualStartTime:'2026-11-03T17:00:00Z',actualEndTime:'2026-11-03T17:30:00Z'}
 };
 const item=normalizeDiscovery(premiere,now);
 assert.ok(item,'Completed Premiere should be accepted');
 assert.equal(item.isOfficialPremiere,true);
 assert.equal(item.publishedAt,eventAt,'HOT age must start at actual public Premiere');
 assert.equal(item.views,45700);
 assert.equal(item.channelId,'UCbLj9QP9FAaHs_647QckGtg');
 assert.equal(normalizeDiscovery({...premiere,snippet:{...premiere.snippet,liveBroadcastContent:'live'}},now),null);
 assert.equal(normalizeDiscovery({...premiere,snippet:{...premiere.snippet,channelId:'UCnotTheOfficialChannel12'}},now),null);
 assert.equal(normalizeDiscovery({...premiere,snippet:{...premiere.snippet,title:'WoW Forever Livestream Archive'}},now),null);
});
test('recovery video ID is requested directly even when YouTube search and uploads playlist omit it',async()=>{
 const now=Date.parse('2026-11-03T21:00:00Z');
 const id='n2Wg46fwmb0';
 assert.ok(VERIFIED_RECOVERY_VIDEO_IDS.includes(id));
 const calls=[];
 const fetcher=async u=>{
   const url=new URL(u);calls.push(url);
   if(url.pathname.endsWith('/playlistItems'))return {ok:true,json:async()=>({items:[]})};
   if(url.pathname.endsWith('/search'))return {ok:true,json:async()=>({items:[]})};
   const vids=url.searchParams.get('id').split(',');
   assert.ok(vids.includes(id));
   return {ok:true,json:async()=>({items:[{
     id,
     snippet:{title:'Launch Overview | World of Warcraft: Forever',
       channelTitle:'World of Warcraft',channelId:'UCbLj9QP9FAaHs_647QckGtg',
       publishedAt:'2026-11-02T20:26:00Z',liveBroadcastContent:'none'},
     statistics:{viewCount:'15000'},contentDetails:{duration:'PT30M'},
     liveStreamingDetails:{actualStartTime:'2026-11-03T17:00:00Z',
       actualEndTime:'2026-11-03T17:30:00Z'}
   }]})};
 };
 const result=await discover('key',{fetcher,now,queries:['WoW Forever']});
 assert.equal(result.videos.some(v=>v.id===id),true);
 assert.equal(result.stats.recoveryVideos,1);
 assert.equal(result.stats.officialPremieres,1);
 assert.equal(calls.filter(c=>c.pathname.endsWith('/videos')).length,1);
});
