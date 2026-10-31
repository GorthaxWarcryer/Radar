import test from 'node:test';
import assert from 'node:assert/strict';
import {hotVelocity,rankHotVideos,HOUR_MS} from '../hot-hourly.mjs';
const t=Date.parse('2026-10-31T10:00:00Z');
const obs=(h,views)=>({capturedAt:t+h*HOUR_MS,views});
test('one hour old + 6000 views => 6000/h estimated since upload',()=>{
 const v=hotVelocity({publishedAt:t-HOUR_MS,samples:[obs(0,6000)],now:t});
 assert.equal(v.vph,6000); assert.equal(v.kind,'estimated-since-upload'); assert.equal(v.eligible,true);
});
test('next hour changes 6000->8000 => measured 2000/h',()=>{
 const v=hotVelocity({publishedAt:t-HOUR_MS,samples:[obs(0,6000),obs(1,8000)],now:t+HOUR_MS});
 assert.equal(v.vph,2000); assert.equal(v.kind,'measured-hourly'); assert.equal(v.intervalMinutes,60);
});
test('third hour changes 8000->16000 => measured 8000/h',()=>{
 const v=hotVelocity({publishedAt:t-HOUR_MS,samples:[obs(0,6000),obs(1,8000),obs(2,16000)],now:t+2*HOUR_MS});
 assert.equal(v.vph,8000);
});
test('below 5000 views not HOT eligible',()=>{
 assert.equal(hotVelocity({publishedAt:t-HOUR_MS,samples:[obs(0,4999)],now:t}).eligible,false);
});
test('older than 24h not HOT eligible',()=>{
 assert.equal(hotVelocity({publishedAt:t-25*HOUR_MS,samples:[obs(0,6000)],now:t}).eligible,false);
});
test('duplicate timestamps cannot create fake measured rate',()=>{
 const v=hotVelocity({publishedAt:t-HOUR_MS,samples:[obs(0,6000),obs(0,10000)],now:t});
 assert.equal(v.kind,'estimated-since-upload');
});
test('10-minute gap is too short for measured rate',()=>{
 const v=hotVelocity({publishedAt:t-HOUR_MS,samples:[obs(0,6000),obs(1/6,8000)],now:t+HOUR_MS/6});
 assert.equal(v.kind,'estimated-since-upload');
});
test('overnight observation pair is labeled interval, not last hour',()=>{
 const v=hotVelocity({publishedAt:t-HOUR_MS,samples:[obs(0,6000),obs(9,15000)],now:t+9*HOUR_MS});
 assert.equal(v.kind,'measured-interval'); assert.equal(v.vph,1000); assert.equal(v.intervalMinutes,540);
});
test('stale sample keeps original observation time',()=>{
 const v=hotVelocity({publishedAt:t-HOUR_MS,samples:[obs(0,6000)],now:t+2*HOUR_MS});
 assert.equal(v.measuredAt,t); assert.equal(v.vph,6000);
});
test('HOT rank sorts velocity, excludes below-threshold videos',()=>{
 const rows=[{id:'a',publishedAt:t-HOUR_MS,samples:[obs(0,6000)]},
             {id:'b',publishedAt:t-2*HOUR_MS,samples:[obs(0,8000)]},
             {id:'c',publishedAt:t-HOUR_MS,samples:[obs(0,4000)]}];
 assert.deepEqual(rankHotVideos(rows,t).map(x=>x.id),['a','b']);
});
