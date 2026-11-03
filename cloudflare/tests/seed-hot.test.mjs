import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHotSeedStatements} from '../seed-hot.mjs';
const NOW=Date.parse('2026-11-03T22:20:00Z');
const ID='n2Wg46fwmb0';
test('Deploy backfill inserts recovered official Premiere without deleting other videos',()=>{
 const v={id:ID,title:'Launch Overview | World of Warcraft: Forever',
   channelId:'UCbLj9QP9FAaHs_647QckGtg',channel:'World of Warcraft',
   publishedAt:Date.parse('2026-11-03T17:00:08Z'),views:552514,
   isShort:false,samples:[{capturedAt:NOW-60000,views:552514,source:'youtube-data-api'}]};
 const {count,sql}=buildHotSeedStatements({videos:[v],catalog:[v],generatedAt:NOW},NOW);
 assert.equal(count,1);
 assert.match(sql,/INSERT INTO videos\(id,payload,last_seen\)/);
 assert.match(sql,/Launch Overview/);
 assert.match(sql,/officialSource/);
 assert.match(sql,/INSERT OR IGNORE INTO video_samples/);
 assert.match(sql,/WHERE excluded.last_seen>=videos.last_seen/);
 assert.doesNotMatch(sql,/DELETE FROM/);
});
test('Deploy backfill rejects invalid sources and stale video timestamps',()=>{
 assert.throws(()=>buildHotSeedStatements({videos:null,catalog:[]},NOW),/Invalid HOT/);
 const result=buildHotSeedStatements({videos:[{id:ID,publishedAt:NOW-49*3600000,views:6000}],
   catalog:[],generatedAt:NOW},NOW);
 assert.equal(result.count,0);
});
test('Deploy backfill safely quotes source text',()=>{
 const v={id:ID,title:"Blizzard's Launch",channel:'World of Warcraft',
   channelId:'UCbLj9QP9FAaHs_647QckGtg',publishedAt:NOW-3600000,
   views:7000,samples:[{capturedAt:NOW,views:7000}]};
 const x=buildHotSeedStatements({videos:[v],catalog:[],generatedAt:NOW},NOW);
 assert.equal(x.count,1);
 assert.match(x.sql,/Blizzard''s Launch/);
});
