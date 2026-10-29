import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './src/db.mjs';
import { fetchReddit, fetchOfficial } from './src/providers.mjs';
import { scanYouTubeSlice } from './src/incremental.mjs';
import { randomUUID } from 'node:crypto';

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
const initialJob = (() => { try { return JSON.parse(store.getMeta('scanJob') || 'null'); } catch { return null; } })();
let scanJob = initialJob?.status === 'running'
  ? { ...initialJob, status: 'interrupted', finishedAt: Date.now(), note: 'Worker restarted; pending items remain queued' }
  : initialJob;
if (scanJob?.status === 'interrupted') store.setMeta('scanJob', JSON.stringify(scanJob));
const scanLimit = Math.max(15000, Math.min(120000, Number(process.env.SCAN_BUDGET_MS) || 60000));

async function doScan() {
  const started = Date.now(), deadline = started + scanLimit, summary = {};
  const providers = ['youtube', 'reddit', 'official'];
  const startAt = Number(store.getMeta('scanNextProvider') || 0) % providers.length;
  let worked = 0;
  for (let i = 0; i < providers.length; i++) {
    const index = (startAt + i) % providers.length;
    const name = providers[index];
    if (deadline - Date.now() < 3000) {
      summary[name] = { status: 'deferred', count: 0, errors: ['Slice budget reached; provider queued for next run'] };
      store.setMeta('scanNextProvider', index);
      break;
    }
    try {
      let result;
      if (name === 'youtube') {
        result = await scanYouTubeSlice({ env: process.env, store, deadline: Math.min(deadline, Date.now() + 26000) });
        if (result.channels?.length) knownChannels = result.channels;
      } else if (name === 'reddit') {
        const cursor = Number(store.getMeta('redditCursor') || 0);
        result = await fetchReddit(process.env, Date.now(), { cursor, maxListings: 2, deadline });
        if (Number.isInteger(result.nextCursor)) store.setMeta('redditCursor', result.nextCursor);
        if (result.status !== 'not_configured') store.importData({ reddit: result.posts || [] }, Date.now());
      } else {
        result = await fetchOfficial(process.env, Date.now(), deadline);
        if (result.status !== 'not_configured') store.importData({ official: result.posts || [] }, Date.now());
      }
      latestStatuses[name] = result.status;
      const found = result.count ?? (result.posts || []).length;
      if (result.status !== 'not_configured') store.record(name, result.status, found, result.errors || [], Date.now());
      summary[name] = { status: result.status, count: found, errors: result.errors || [], progress: result.progress || null };
      if (['progress', 'complete', 'partial'].includes(result.status)) worked++;
    } catch (error) {
      latestStatuses[name] = 'error';
      store.record(name, 'error', 0, [String(error.message)], Date.now());
      summary[name] = { status: 'error', count: 0, errors: [String(error.message)] };
    }
    store.setMeta('scanNextProvider', (index + 1) % providers.length);
    scanJob = { ...scanJob, providers: summary, updatedAt: Date.now() };
    store.setMeta('scanJob', JSON.stringify(scanJob));
  }
  if (worked > 0) store.setMeta('lastScan', Date.now());
  const anyError = Object.values(summary).some(x => x.status === 'error' || x.status === 'partial');
  const unfinished = Object.values(summary).some(x => x.status === 'deferred' || x.status === 'progress');
  return { status: anyError ? 'partial' : unfinished ? 'progress' : 'complete', providers: summary, durationMs: Date.now() - started };
}
function startScan() {
  if (running) return { status: 'busy', scanId: scanJob?.scanId };
  running = true;
  scanJob = { status: 'running', scanId: randomUUID(), startedAt: Date.now(), updatedAt: Date.now(), providers: {} };
  store.setMeta('scanJob', JSON.stringify(scanJob));
  setImmediate(async () => {
    try {
      const result = await doScan();
      scanJob = { ...scanJob, ...result, finishedAt: Date.now(), updatedAt: Date.now() };
    } catch (error) {
      scanJob = { ...scanJob, status: 'error', message: String(error.message), finishedAt: Date.now() };
      store.record('system', 'error', 0, [String(error.message)], Date.now());
    } finally {
      running = false;
      store.setMeta('scanJob', JSON.stringify(scanJob));
    }
  });
  return { status: 'running', scanId: scanJob.scanId };
}
function runHourly() {
  const untilNextHour = 3600000 - Date.now() % 3600000 + 1500;
  const timer = setTimeout(async () => { try { startScan(); } catch (e) { console.error('Scheduled scan:', e.message); } runHourly(); }, untilNextHour);
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
      body.scanJob = scanJob;
      body.scanProgress = (() => { try { return JSON.parse(store.getMeta('youtubeLastProgress') || 'null'); } catch { return null; } })();
      return json(res, 200, body);
    }
    if (req.method === 'GET' && pathname === '/api/health') return json(res, 200, { ok: true, running, providers: latestStatuses, scanJob, time: Date.now(), originalSiteConnected: false });
    if (pathname === '/api/save' && req.method === 'POST') {
      if (!authorized(req)) return json(res, 401, { error: 'Admin authorization required' });
      store.save(await readBody(req)); return json(res, 200, { ok: true });
    }
    if (pathname.startsWith('/api/save/') && req.method === 'DELETE') {
      if (!authorized(req)) return json(res, 401, { error: 'Admin authorization required' });
      store.del(pathname.substring('/api/save/'.length)); return json(res, 200, { ok: true });
    }
    if (pathname === '/api/scan/status' && req.method === 'GET') {
      if (!authorized(req)) return json(res, 401, { error: 'Admin authorization required' });
      return json(res, 200, scanJob || { status: 'not_started' });
    }
    if (pathname === '/api/scan' && req.method === 'POST') {
      if (!authorized(req)) return json(res, 401, { error: 'Admin authorization required' });
      return json(res, 202, startScan());
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
    setTimeout(() => startScan(), 1000).unref();
    runHourly();
  }
});
