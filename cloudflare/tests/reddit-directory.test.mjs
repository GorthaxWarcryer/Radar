import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
test('Reddit Stories provides direct browser links without a collector',()=>{
  for(const slug of ['wowforever','classicwow','wow','wowhardcore','worldofpvp'])
    assert.ok(app.includes('"slug":"'+slug+'"'));
  assert.match(app,/top\/\?t=day/);
  assert.doesNotMatch(app,/search\/\?q=&restrict_sr=1&sort=comments&t=day/);
  assert.match(app,/hot\//);
  assert.match(app,/NO REDDIT API/);
  assert.match(app,/reddit-add-form/);
});
test('manual post saving validates Reddit links and uses local storage',()=>{
  assert.match(app,/function redditPostUrl/);
  assert.match(app,/localStorage\.setItem\(REDDIT_LOCAL_KEY/);
  assert.match(app,/reddit\.com/);
  assert.match(app,/redd\.it/);
  assert.match(app,/Saved on this device/);
});
