import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

async function freePort() {
  const s = createServer();
  await new Promise((resolve, reject) => { s.once('error', reject); s.listen(0, '127.0.0.1', resolve); });
  const port = s.address().port;
  await new Promise(resolve => s.close(resolve));
  return port;
}
async function launch(port, dbPath) {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), DB_PATH: dbPath, ADMIN_TOKEN: 'local-test-secret', AUTO_SCAN: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stderr.on('data', x => { output += x.toString(); });
  child.stdout.on('data', x => { output += x.toString(); });
  for (let i = 0; i < 75; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return child;
    } catch { /* waiting for startup */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  child.kill();
  throw new Error(`Server didn't start: ${output}`);
}
const kill = child => new Promise(resolve => {
  if (child.exitCode !== null || child.signalCode) return resolve();
  child.once('exit', resolve);
  child.kill();
});

test('Public deployment serves UI and health, protects mutations, preserves saved data through restart', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'azeroth-deploy-test-'));
  const database = join(folder, 'state.sqlite');
  const port = await freePort();
  let app;
  try {
    app = await launch(port, database);
    const site = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(site.status, 200);
    assert.match(await site.text(), /Blackrock Depths/);
    const feed = await fetch(`http://127.0.0.1:${port}/api/feed`);
    assert.equal(feed.status, 200);
    assert.equal((await feed.json()).savedPrivate, true);
    const unauthorized = await fetch(`http://127.0.0.1:${port}/api/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'sample', title: 'Sample' }) });
    assert.equal(unauthorized.status, 401);
    const save = await fetch(`http://127.0.0.1:${port}/api/save`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': 'local-test-secret' }, body: JSON.stringify({ id: 'sample', title: 'Saved sample', note: 'Keeps through restart' }) });
    assert.equal(save.status, 200);
    await kill(app); app = await launch(port, database);
    const saved = await fetch(`http://127.0.0.1:${port}/api/feed`, { headers: { 'X-Admin-Token': 'local-test-secret' } });
    const body = await saved.json();
    assert.equal(body.saved.length, 1);
    assert.equal(body.saved[0].note, 'Keeps through restart');
  } finally { if (app) await kill(app); rmSync(folder, { recursive: true, force: true }); }
});
