import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBluePosts,verifiedForumUrl,fetchBluePosts,parseForumTopicReplies,fetchAllBluePosts,synchronizeBluePosts,WATCHED_FORUM_TOPICS} from '../blue-posts.mjs';

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
 assert.equal(result.status,'partial'); // Mocked RSS succeeds, direct forum JSON is unavailable.
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

test('a fresh Kaivax reply to the old September Development Notes topic appears as a November update',()=>{
  const now=Date.parse('2026-11-03T06:00:00Z');
  const topic={id:631316,slug:'wow-forever-beta-development-notes-%E2%80%93-updated-3-november',
    title:'WoW Forever Beta Development Notes – Updated 3 November',
    post_stream:{posts:[
      {id:1,post_number:1,username:'Kaivax',created_at:'2026-09-24T22:37:00Z',cooked:'September original'},
      {id:7,post_number:7,username:'Kaivax',created_at:'2026-10-26T20:35:00Z',cooked:'Older tuning'},
      {id:9,post_number:9,username:'Kaivax',created_at:'2026-11-03T03:21:00Z',
        cooked:'<p>New launch update: changes to classes and gameplay.</p>'},
      {id:10,post_number:10,username:'RandomPlayer',created_at:'2026-11-03T03:31:00Z',
        cooked:'My opinion'}
    ]}};
  const got=parseForumTopicReplies(topic,WATCHED_FORUM_TOPICS[0],now);
  assert.equal(got.length,1);
  assert.equal(got[0].sourceId,'blue');
  assert.equal(got[0].author,'Kaivax');
  assert.equal(got[0].publishedAt,Date.parse('2026-11-03T03:21:00Z'));
  assert.match(got[0].url,/^https:\/\/eu\.forums\.blizzard\.com\/en\/wow\/t\/.*\/631316\/9$/);
  assert.ok(got[0].url.includes('%E2%80%93'),'Preserve URL-encoded en dash in forum slug');
  assert.match(got[0].summary,/New launch update/);
  assert.doesNotMatch(got[0].summary,/<p>/);
});
test('direct Blizzard topic discovery survives an outdated RSS feed',async()=>{
  const now=Date.parse('2026-11-03T06:00:00Z');
  const old=rss(item('Outdated','https://eu.forums.blizzard.com/en/wow/t/old/631316/1',
    'Thu, 24 Sep 2026 22:37:00 GMT'));
  const fresh={id:631316,slug:'wow-forever-beta-development-notes',
    title:'WoW Forever Beta Development Notes – Updated 3 November',
    post_stream:{posts:[{post_number:9,username:'Kaivax',created_at:'2026-11-03T03:21:00Z',
      cooked:'<p>Launch update</p>'}]}};
  const fetcher=async url=>url.endsWith('.json')
    ?{ok:true,json:async()=>fresh}
    :{ok:true,text:async()=>old};
  const got=await fetchAllBluePosts(fetcher,now);
  assert.equal(got.posts.length,1);
  assert.equal(got.errors.length,0);
  assert.match(got.posts[0].url,/631316\/9$/);
});
test('RSS posts still display when public Blizzard forum JSON is temporarily blocked',async()=>{
  const now=Date.parse('2026-11-03T06:00:00Z');
  const xml=rss(item('Blue Post','https://eu.forums.blizzard.com/en/wow/t/fresh/631316/9',
    'Tue, 03 Nov 2026 03:21:00 GMT'));
  const fetcher=async url=>url.endsWith('.json')
    ?{ok:false,status:403}: {ok:true,text:async()=>xml};
  const result=await fetchAllBluePosts(fetcher,now);
  assert.equal(result.posts.length,1);
  assert.equal(result.errors.length,1);
});
test('direct forum and independent tracker entries for the same reply are deduplicated',async()=>{
  const now=Date.parse('2026-11-03T06:00:00Z');
  const xml=rss(item('Notes','https://eu.forums.blizzard.com/en/wow/t/a-different-topic-title/631316/9',
    'Tue, 03 Nov 2026 03:21:00 GMT'));
  const topic={id:631316,slug:'wow-forever-beta-development-notes',
    title:'WoW Forever Beta Development Notes – Updated 3 November',
    post_stream:{posts:[{post_number:9,username:'Kaivax',created_at:'2026-11-03T03:21:00Z',cooked:'Summary'}]}};
  const result=await fetchAllBluePosts(async url=>url.endsWith('.json')
    ?{ok:true,json:async()=>topic}:{ok:true,text:async()=>xml},now);
  assert.equal(result.posts.length,1);
  assert.equal(result.posts[0].provider,'blizzard-forum-thread');
});
