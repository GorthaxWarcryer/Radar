import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeGrowth, eligibleVideo, hot, minViews, normalizeRedditPost, parseDuration, popular } from '../src/core.mjs';
import { createStore } from '../src/db.mjs';
const now = Date.now();
const v = (id, views, kind = 'long', hours = 2, isVod = false, perHour = 100) => ({id,title:id,publishedAt:now-hours*3600000,views,kind,isVod, growth:{perHour}});
test('Popular ranks by TOTAL views, not views gained',()=>{
  const result=popular([v('a',5100,'long',2,false,3000),v('b',30000,'long',2,false,200)],'long',now);
  assert.deepEqual(result.map(x=>x.id),['b','a']);
});
test('HOT ranks by measured views per hour',()=>{
  const result=hot([v('a',5100,'long',2,false,3000),v('b',30000,'long',2,false,200)],'long',now);
  assert.deepEqual(result.map(x=>x.id),['a','b']);
});
test('Archived livestreams, old videos and below 5,000 are excluded',()=>{
  assert.equal(minViews,5000);
  assert.equal(eligibleVideo(v('a',5000,'long',3,true),now),false);
  assert.equal(eligibleVideo(v('b',4999,'long',3),now),false);
  assert.equal(eligibleVideo(v('c',10000,'long',51),now),false);
  assert.equal(eligibleVideo(v('d',5000,'long',23),now),true);
});
test('Growth remains unknown with only one snapshot',()=>{
  assert.equal(computeGrowth([{at:now,views:2000}],now),null);
  assert.equal(computeGrowth([{at:now-3600000,views:2000},{at:now,views:4000}],now).perHour,2000);
});
test('YouTube duration and Reddit Top-day evidence',()=>{
  assert.equal(parseDuration('PT2M43S'),163);
  assert.equal(parseDuration('PT1H5M'),3900);
  const p=normalizeRedditPost({id:'abc',title:'Class changes discussion',created_utc:Math.round(now/1000)-1200,permalink:'/r/wow/comments/abc/',score:107,num_comments:23},'wow','top',now);
  assert.equal(p.sort,'top');
  assert.match(p.listingUrl,/top\/\?t=day$/);
  assert.equal(p.score,107);
});
test('SQLite retains snapshots and saved notes on re-open',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azeroth-radar-test-'));
  const fp=path.join(dir,'test.sqlite');const old=now-3600000;
  const s=createStore(fp);
  s.importData({videos:[v('abc',6500)]},old);
  s.importData({videos:[v('abc',8500)]},now);
  s.save({id:'abc',kind:'video',title:'Tracked video',url:'https://example.com',note:'Review later'});
  s.db.close();
  const reopened=createStore(fp);
  const feed=reopened.feed({now});
  assert.equal(feed.popular.long.length,1);
  assert.equal(feed.popular.long[0].views,8500);
  assert.equal(feed.hot.long[0].growth.perHour,2000);
  assert.equal(feed.saved[0].note,'Review later');
  reopened.db.close();fs.rmSync(dir,{recursive:true,force:true});
});

test('Reddit import refuses posts without fresh Top/Hot evidence',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azeroth-radar-reddit-'));
  const s=createStore(path.join(dir,'test.sqlite'));
  const base={id:'reddit:a',title:'Discussion',publishedAt:now-1200000,score:30,comments:8,subreddit:'wow',url:'https://www.reddit.com/r/wow/comments/a/'};
  s.importData({reddit:[base]},now);
  assert.equal(s.feed({now}).stories.length,0);
  s.importData({reddit:[{...base,sort:'top',listingUrl:'https://www.reddit.com/r/wow/top/?t=day',observedAt:now}]},now);
  assert.equal(s.feed({now}).stories.length,1);
  s.db.close(); fs.rmSync(dir,{recursive:true,force:true});
});
