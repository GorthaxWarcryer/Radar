import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('Reddit discovery is reachable from Stories without needing login or an API',()=>{
  assert.match(source,/function redditDirectory\(\)/);
  assert.match(source,/function storiesSection\(data\)/);
  assert.match(source,/showReddit\?redditDirectory\(\)/);
  assert.match(source,/\{id:"reddit",text:"Reddit"\}/);
});
test('Every Reddit community gets direct Top Today and Hot ranking links',()=>{
  const names=['wowforever','classicwow','wow','wowhardcore','worldofpvp'];
  for(const slug of names)assert.ok(source.includes('"slug":"'+slug+'"'),'Missing r/'+slug);
  assert.ok(source.includes('top/?t=day'));
  assert.ok(source.includes('hot/'));
  assert.ok(source.includes('noopener noreferrer'));
});
test('The directory does not pretend to display collected Reddit votes or comments',()=>{
  const body=source.slice(source.indexOf('function redditDirectory()'),source.indexOf('function renderStory(',source.indexOf('function redditDirectory()')));
  assert.ok(body.includes('not automatically collected'));
  assert.ok(!body.includes('fetch('));
  assert.ok(!body.includes('.json'));
});
test('Saving a manual discussion validates Reddit post URLs and stores browser-only',()=>{
  assert.match(source,/function redditPostUrl\(raw\)/);
  assert.match(source,/reddit-add-form/);
  assert.match(source,/localStorage\.setItem\(REDDIT_LOCAL_KEY/);
});
