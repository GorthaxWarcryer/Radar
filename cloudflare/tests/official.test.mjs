import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_SOURCES, parseOfficialNews, officialSourceStatus, synchronizeOfficial } from '../official.mjs';

const NOW=Date.parse('2026-10-31T13:00:00Z');
const item=(overrides={})=>({properties:{
  newsId:'news123',title:'World of Warcraft: Forever launches',
  newsUrl:'https://worldofwarcraft.blizzard.com/en-us/news/24315820',
  lastUpdated:'2026-10-31T12:00:00Z',
  summary:'<strong>Official</strong> announcement &amp; notes',...overrides}});
test('official Blizzard article parses to a sourced, safe 48-hour story',()=>{
  const out=parseOfficialNews({feed:{contentItems:[item()]}},OFFICIAL_SOURCES[1],NOW);
  assert.equal(out.length,1);
  assert.equal(out[0].source,'Official');
  assert.equal(out[0].sourceName,'World of Warcraft: Forever');
  assert.equal(out[0].id,'official:blizzard:news123');
  assert.equal(out[0].summary,'Official announcement & notes');
  assert.equal(out[0].publishedAt,NOW-3600000);
});
test('unverified links, stale items and malformed feeds are rejected',()=>{
  assert.deepEqual(parseOfficialNews({feed:{contentItems:[item({newsUrl:'https://evil.invalid/news'})]}},OFFICIAL_SOURCES[0],NOW),[]);
  assert.deepEqual(parseOfficialNews({feed:{contentItems:[item({lastUpdated:'2026-10-27T12:00:00Z'})]}},OFFICIAL_SOURCES[0],NOW),[]);
  assert.throws(()=>parseOfficialNews({error:'invalid'},OFFICIAL_SOURCES[0],NOW),/Unexpected Blizzard/);
});
test('official source statuses reflect latest scan and fresh story counts',()=>{
  const statuses=officialSourceStatus([{at:NOW,provider:'official-wow',status:'complete',count:1,error:''}],
    [{sourceId:'wow',publishedAt:NOW-3600000}]);
  assert.equal(statuses[0].status,'complete');
  assert.equal(statuses[0].posts48h,1);
  assert.equal(statuses[1].status,'pending');
});
test('hourly official synchronizer records verified posts, preserving provider identity',async()=>{
  const statements=[];
  const db={prepare(sql){return {bind(...args){return{sql,args,run:async()=>{statements.push({sql,args})}}}}},
    batch:async items=>{statements.push(...items);return items.map(()=>({success:true}));}};
  const fetcher=async()=>({ok:true,json:async()=>({feed:{contentItems:[item()]}})});
  const results=await synchronizeOfficial({DB:db},fetcher,NOW);
  assert.deepEqual(results.map(x=>x.status),['complete','complete']);
  assert.ok(statements.some(x=>x.sql.startsWith('INSERT INTO official')&&
    String(x.args[0]).startsWith('official:blizzard:')));
});
test('failed provider is recorded as error without inventing stories',async()=>{
  const statements=[];
  const db={prepare(sql){return {bind(...args){return{sql,args,run:async()=>statements.push({sql,args})}}}},
    batch:async items=>{statements.push(...items);}};
  const results=await synchronizeOfficial({DB:db},async()=>({ok:false,status:429}),NOW);
  assert.deepEqual(results.map(x=>x.status),['error','error']);
  assert.equal(statements.filter(x=>x.sql.startsWith('INSERT INTO official')).length,0);
});
