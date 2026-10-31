import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, summary } from '../scripts/github-hot-bridge.mjs';
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
  assert.match(text,/does not override its UI/);assert.match(text,/Estimated since upload/);
});
