import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Navigation starts at HOT, with Popular next and all seven sections retained', () => {
  const html = read('public/index.html');
  const nav = html.match(/<nav class="side-nav" id="side-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.deepEqual([...nav.matchAll(/data-section="([^"]+)"/g)].map(match => match[1]),
    ['hot', 'popular', 'stories', 'ideas']);
  assert.match(html, /data-section="watchlist"/);
  assert.match(html, /data-section="channels"/);
  assert.match(html, /data-section="activity"/);
  assert.match(read('public/app.js'), /const state = \{ section: 'hot'/);
});

test('Theme selector and CSS keep Default and Blackrock Depths only', () => {
  const html = read('public/index.html');
  const css = read('public/style.css');
  const app = read('public/app.js');
  const selectors = [...html.matchAll(/id="theme-([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(selectors, ['default','brd']);
  assert.match(css, /body\[data-theme='default'\]/);
  assert.match(css, /body\[data-theme='brd'\]/);
  assert.equal(/terran|zerg|protoss/i.test([html,css,app].join('\n')), false);
  assert.match(app, /storedTheme === 'brd' \? 'brd' : 'default'/);
});

test('Sites visual reference is self-contained, initializes after the DOM, and labels sample data', () => {
  const html = read('sites/visual-reference.html');
  assert.match(html, /data-preview="true"/);
  assert.match(html, /PREVIEW MODE/);
  assert.match(html, /Sample cards and metrics are illustrative/);
  assert.equal(html.includes('src="/app.js"'), false);
  assert.equal(html.includes('href="/style.css"'), false);
  assert.equal(html.includes('<script defer>'), false);
  assert.ok(html.indexOf('id="main-view"') < html.indexOf('<script>'), 'inline client code must be after body DOM');
  assert.match(html, /Illustrative preview — no live connection/);
  assert.match(html, /data-section="hot"/);
});

test('Sites handoff is explicit about native storage, secret handling, and non-transfer of data', () => {
  const prompt = read('sites/SITE_CREATION_PROMPT.md');
  for (const required of ['native', 'YOUTUBE_API_KEY', '48 hours', 'two', 'Default', 'Blackrock Depths', 'Original', 'Do not']) {
    assert.ok(prompt.toLowerCase().includes(required.toLowerCase()), `missing ${required}`);
  }
  const contract = read('sites/DATA_CONTRACT.md');
  for (const required of ['video_samples', 'story_observations', 'scan_runs', 'saved_items']) assert.ok(contract.includes(required));
});
