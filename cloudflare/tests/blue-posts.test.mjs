import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBluePosts,verifiedForumUrl,fetchBluePosts,synchronizeBluePosts} from '../blue-posts.mjs';

const NOW=Date.parse('2026-10-31T12:00:00Z');
const item=(title,url,date)=>'<item><title>'+title+'</title><link>'+url+
  '</link><pubDate>'+date+'</pubDate><description>Official news &amp; details</description>'+
  '<dc:creator>Kaivax</dc:creator></item>';
const rss=(...items)=>'<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>'+
  items.join('')+'</channel></rss>';
test('the blue tracker parser returns fresh clickable Blizzard forum posts',()=>{
 const xml=rss(item('Warrior Changes','https://us.forums.blizzard.com/en/wow/t/warrior-changes/2395799/1',
   'Fri, 30 Oct 2026 18:00:00 GMT'));
 const got=parseBluePosts(xml,NOW);
 assert.equal(got.length,1);
 assert.equal(got[0].source,'Official');
 assert.equal(got[0].sourceId,'blue');
 assert.equal(got[0].author,'Kaivax');
 assert.equal(got[0].summary,'Official news & details');
 assert.match(got[0].url,/^https:\/\/us\.forums\.blizzard\.com/);
});
test('rejects non-Blizzard links, lookalike domains, invalid forum paths, old dates',()=>{
 const xml=rss(
   item('Fake','https://us.forums.blizzard.com.evil.example/en/wow/t/fake/2395799/1','Fri, 30 Oct 2026 18:00:00 GMT'),
   item('Unrelated','https://us.forums.blizzard.com/en/diablo/t/fake/2395799','Fri, 30 Oct 2026 18:00:00 GMT'),
   item('Stale','https://us.forums.blizzard.com/en/wow/t/old/2395799','Tue, 27 Oct 2026 18:00:00 GMT')
 );
 assert.deepEqual(parseBluePosts(xml,NOW),[]);
 assert.equal(verifiedForumUrl('http://us.forums.blizzard.com/en/wow/t/valid/2395799'), '');
});
test('preserves original publication time, deduplicates URLs and removes URL trackers',()=>{
 const url='https://eu.forums.blizzard.com/en/wow/t/maintenance/1234/1?utm_source=foo';
 const xml=rss(item('The first item',url,'Fri, 30 Oct 2026 18:00:00 GMT'),
   item('The first item',url,'Fri, 30 Oct 2026 18:00:00 GMT'));
 const got=parseBluePosts(xml,NOW);
 assert.equal(got.length,1);
 assert.equal(got[0].publishedAt,Date.parse('2026-10-30T18:00:00Z'));
 assert.equal(got[0].url.includes('?'),false);
});
test('refuses a malformed feed rather than using arbitrary page text',()=>{
 assert.throws(()=>parseBluePosts('<html><item><title>Fake</title></item></html>',NOW));
});
test('blue posts sync is scoped to the official D1 table and records success',async()=>{
 const statements=[];
 const db={prepare(sql){return{bind(...args){return{sql,args,run:async()=>({success:true})}}}},
   async batch(items){statements.push(...items);return items.map(()=>({success:true}))}};
 const xml=rss(item('Warrior changes','https://us.forums.blizzard.com/en/wow/t/warrior-changes/2395799/1',
   'Fri, 30 Oct 2026 18:00:00 GMT'));
 const fetcher=async()=>({ok:true,text:async()=>xml});
 const result=await synchronizeBluePosts({DB:db},fetcher,NOW);
 assert.equal(result.status,'complete');
 assert.equal(result.posts,1);
 assert.ok(statements.some(x=>x.sql.startsWith('INSERT INTO official')));
 assert.ok(statements.some(x=>x.sql.startsWith('INSERT INTO scans')&&x.args[1]==='blizzard-blue'));
});
test('source failures are recorded without deleting existing posts',async()=>{
 const statements=[];
 const db={prepare(sql){return{bind(...args){return{sql,args,run:async()=>{statements.push({sql,args})}}}}},
   async batch(){throw Error('No batch expected')}};
 const result=await synchronizeBluePosts({DB:db},async()=>({ok:false,status:403}),NOW);
 assert.equal(result.status,'error');
 assert.ok(statements.some(x=>x.sql.startsWith('INSERT INTO scans')&&x.args[2]==='error'));
 assert.ok(statements.every(x=>!x.sql.includes('DELETE FROM official')));
});
