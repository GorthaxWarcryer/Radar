import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './src/db.mjs';
import { fetchYouTube, fetchReddit, fetchOfficial } from './src/providers.mjs';

const BASE = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(BASE, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim(); if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
const HOST = process.env.HOST || (process.env.RAILWAY_PROJECT_ID || process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const PORT = Number(process.env.PORT || 4173);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) { console.error('Invalid PORT'); process.exit(1); }
if (HOST !== '127.0.0.1' && HOST !== 'localhost' && HOST !== '::1' && !process.env.ADMIN_TOKEN) {
  console.error('Refusing external binding without ADMIN_TOKEN. Set it in .env.'); process.exit(1);
}
// Use an attached persistent volume for production. Never store live data in the ephemeral build image.
const databasePath = process.env.DB_PATH || path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(BASE, 'data'), 'azeroth.sqlite');
const store = createStore(databasePath);
let running = false, knownChannels = [], latestStatuses = { youtube: 'not_configured', reddit: 'not_configured', official: 'not_configured' };
function authorized(req) {
  if (!process.env.ADMIN_TOKEN) return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const supplied = req.headers['x-admin-token'];
  if (typeof supplied !== 'string') return false;
  const a = Buffer.from(supplied), b = Buffer.from(process.env.ADMIN_TOKEN);
  return a.length === b.length && (awaitSafeEqual(a, b));
}
import { timingSafeEqual as awaitSafeEqual } from 'node:crypto';
function json(res, status, body) { const text = JSON.stringify(body); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(text); }
async function readBody(req) {
  let str = '';
  for await (const chunk of req) { str += chunk; if (str.length > 3_000_000) throw new Error('Body too large'); }
  return JSON.parse(str || '{}');
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon' };
function staticFile(req, res, pathname) {
  const resolved = path.resolve(BASE, 'public', `.${pathname === '/' ? '/index.html' : pathname}`);
  const publicRoot = path.resolve(BASE, 'public');
  if (resolved !== publicRoot && !resolved.startsWith(publicRoot + path.sep)) return json(res, 403, { error: 'Forbidden' });
  fs.readFile(resolved, (error, bytes) => {
    if (error) return json(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(resolved)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }); res.end(bytes);
  });
}
async function scan() {
  if (running) return { status: 'busy' };
  running = true;
  const now = Date.now(), summary = {};
  try {
    for (const [name, provider, key] of [
      ['youtube', fetchYouTube, 'videos'], ['reddit', fetchReddit, 'posts'], ['official', fetchOfficial, 'posts']
    ]) {
      const result = await provider(process.env, now);
      if (name === 'youtube' && result.channels) knownChannels = result.channels;
      latestStatuses[name] = result.status;
      const found = result[key] || [];
      if (result.status !== 'not_configured') {
        store.importData({ [name === 'youtube' ? 'videos' : name === 'reddit' ? 'reddit' : 'official']: found }, now);
        store.record(name, result.status, found.length, result.errors, now);
      }
      summary[name] = { status: result.status, count: found.length, errors: result.errors };
    }
    store.setMeta('lastScan', now);
    return { status: 'complete', providers: summary };
  } catch (error) {
    store.record('system', 'error', 0, [error.message], now);
    return { status: 'error', message: error.message };
  } finally { running = false; }
}
function runHourly() {
  const untilNextHour = 3600000 - Date.now() % 3600000 + 1500;
  const timer = setTimeout(async () => { try { await scan(); } catch (e) { console.error('Scheduled scan:', e.message); } runHourly(); }, untilNextHour);
  timer.unref();
}
const server = http.createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname); }
  catch { return json(res, 400, { error: 'Invalid URL' }); }
  try {
    if (req.method === 'GET' && pathname === '/api/feed') {
      const body = store.feed({ channels: knownChannels });
      if (!authorized(req)) { body.saved = []; body.savedPrivate = true; }
      else body.savedPrivate = false;
      body.sources = { ...latestStatuses };
      return json(res, 200, body);
    }
    if (req.method === 'GET' && pathname === '/api/health') return json(res, 200, { ok: true, running, providers: latestStatuses, time: Date.now(), originalSiteConnected: false });
    if (pathname === '/api/save' && req.method === 'POST') {
      if (!authorized(req)) return json(res, 401, { error: 'Admin authorization required' });
      store.save(await readBody(req)); return json(res, 200, { ok: true });
    }
    if (pathname.startsWith('/api/save/') && req.method === 'DELETE') {
      if (!authorized(req)) return json(res, 401, { error: 'Admin authorization required' });
      store.del(pathname.substring('/api/save/'.length)); return json(res, 200, { ok: true });
    }
    if (pathname === '/api/scan' && req.method === 'POST') {
      if (!authorized(req)) return json(res, 401, { error: 'Admin authorization required' });
      return json(res, 200, await scan());
    }
    if (pathname === '/api/import' && req.method === 'POST') {
      if (!authorized(req)) return json(res, 401, { error: 'Admin authorization required' });
      const body = await readBody(req);
      store.importData(body); return json(res, 200, { ok: true, counts: { videos: (body.videos || []).length, reddit: (body.reddit || []).length, official: (body.official || []).length, saved: (body.saved || []).length } });
    }
    if (pathname === '/api/export' && req.method === 'GET') {
      if (!authorized(req)) return json(res, 401, { error: 'Admin authorization required' });
      res.setHeader('Content-Disposition', 'attachment; filename="azeroth-radar-export.json"'); return json(res, 200, store.exportAll());
    }
    if (req.method === 'GET' || req.method === 'HEAD') return staticFile(req, res, pathname);
    return json(res, 404, { error: 'Route not found' });
  } catch (error) { return json(res, 500, { error: String(error.message || error) }); }
});
server.listen(PORT, HOST, () => {
  console.log(`Azeroth Radar rebuild running at http://${HOST}:${PORT}`);
  console.log(`Database location: ${path.dirname(databasePath)} (configure a persistent volume in production)`);
  console.log('This is a rebuilt database; original Sites data and credentials are not connected.');
  if (process.env.AUTO_SCAN !== 'false') {
    setTimeout(() => scan().catch(e => console.error(e)), 1000).unref();
    runHourly();
  }
});
