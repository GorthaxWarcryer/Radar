import test from 'node:test';
import assert from 'node:assert/strict';
import {listedDatabases,matchDatabase,withDatabaseId} from '../bootstrap-d1.mjs';

const id='123e4567-e89b-12d3-a456-426614174000';
const config={d1_databases:[{binding:'DB',database_name:'azeroth-radar-db'}]};
test('existing D1 database reused instead of creating a duplicate',()=>{
 const result=matchDatabase([{name:'other',uuid:'00000000-0000-0000-0000-000000000000'},
   {name:'azeroth-radar-db',uuid:id}]);
 assert.equal(result,id);
});
test('JSON list formats accepted',()=>{
 assert.equal(listedDatabases({result:[{name:'x'}]}).length,1);
 assert.equal(listedDatabases({databases:[{name:'x'}]}).length,1);
 assert.deepEqual(listedDatabases([{name:'x'}]),[{name:'x'}]);
});
test('new Cloudflare account returns no preexisting D1 ID',()=>{
 assert.equal(matchDatabase([]),null);
});
test('generated runtime config includes real database ID and keeps binding',()=>{
 const out=withDatabaseId(config,id);
 assert.equal(out.d1_databases[0].binding,'DB');
 assert.equal(out.d1_databases[0].database_id,id);
 assert.equal(config.d1_databases[0].database_id,undefined);
});
test('invalid or conflicting D1 IDs are rejected',()=>{
 assert.throws(()=>withDatabaseId(config,'not-a-uuid'),/Invalid/);
 assert.throws(()=>matchDatabase([{name:'azeroth-radar-db',uuid:'invalid'}]),/Invalid/);
 assert.throws(()=>matchDatabase([
   {name:'azeroth-radar-db',uuid:id},{name:'azeroth-radar-db',uuid:id}]),/Duplicate/);
});
