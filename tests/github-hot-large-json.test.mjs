import test from 'node:test';
import assert from 'node:assert/strict';
import { github } from '../scripts/github-hot-bridge.mjs';

const repo='GorthaxWarcryer/Radar';
const sha='a'.repeat(40);
const prior={schemaVersion:2,videos:[{id:'1GEmk7Fci2E',samples:[{capturedAt:1793460000000,views:8000}]}]};
const b64=Buffer.from(JSON.stringify(prior)).toString('base64');
test('large GitHub HOT JSON uses immutable blob SHA when Contents API omits content',async()=>{
 const calls=[];
 const fetcher=async url=>{
   calls.push(url);
   return {status:200,ok:true,json:async()=>url.includes('/git/blobs/')?
     {encoding:'base64',content:b64}:{sha,encoding:'none',content:null,size:1600000}};
 };
 const result=await github('fake-token',repo,'GET',null,null,'docs/hot/latest.json',fetcher);
 assert.equal(result.sha,sha);
 assert.deepEqual(result.data,prior);
 assert.equal(calls.length,2);
 assert.ok(calls[1].endsWith('/git/blobs/'+sha));
});
test('small GitHub JSON keeps fast Contents API path',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;return {ok:true,status:200,
   json:async()=>({sha,encoding:'base64',content:b64})}};
 const result=await github('fake-token',repo,'GET',null,null,'docs/hot/latest.json',fetcher);
 assert.equal(result.data.videos.length,1);
 assert.equal(calls,1);
});
test('invalid previous payload never silently resets observation history',async()=>{
 const fetcher=async()=>({ok:true,status:200,json:async()=>({sha,encoding:'none',content:null})});
 await assert.rejects(github('fake-token',repo,'GET',null,null,'docs/hot/latest.json',
   async url=>url.includes('/git/blobs/')?{ok:true,status:200,json:async()=>({encoding:'base64',content:Buffer.from('not-json').toString('base64')})}:fetcher(url)),
 /Invalid prior GitHub HOT JSON/);
});
