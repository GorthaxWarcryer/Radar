import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { computeGrowth, popular, hot, makeContentIdeas, withinHours } from './core.mjs';

export function createStore(dbPath = 'data/azeroth.sqlite') {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS videos (id TEXT PRIMARY KEY, payload TEXT NOT NULL, last_seen INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS video_samples (id TEXT NOT NULL, at INTEGER NOT NULL, views INTEGER NOT NULL, PRIMARY KEY(id, at));
    CREATE INDEX IF NOT EXISTS idx_video_samples ON video_samples(id, at);
    CREATE TABLE IF NOT EXISTS reddit (id TEXT PRIMARY KEY, payload TEXT NOT NULL, last_seen INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reddit_samples (id TEXT NOT NULL, at INTEGER NOT NULL, score INTEGER, comments INTEGER, PRIMARY KEY(id, at));
    CREATE TABLE IF NOT EXISTS official (id TEXT PRIMARY KEY, payload TEXT NOT NULL, last_seen INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS saved (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', saved_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS scans (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL, count INTEGER NOT NULL, error TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const q = {
    putVideo: db.prepare('INSERT INTO videos(id,payload,last_seen) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen'),
    videoSample: db.prepare('INSERT OR IGNORE INTO video_samples(id,at,views) VALUES(?,?,?)'),
    putReddit: db.prepare('INSERT INTO reddit(id,payload,last_seen) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen'),
    redditSample: db.prepare('INSERT OR IGNORE INTO reddit_samples(id,at,score,comments) VALUES(?,?,?,?)'),
    putOfficial: db.prepare('INSERT INTO official(id,payload,last_seen) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen'),
    putScan: db.prepare('INSERT INTO scans(at,provider,status,count,error) VALUES(?,?,?,?,?)'),
    putMeta: db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'),
    putSaved: db.prepare('INSERT INTO saved(id,kind,title,url,note,saved_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET note=excluded.note, title=excluded.title, url=excluded.url'),
    delSaved: db.prepare('DELETE FROM saved WHERE id=?')
  };
  const asJson = rows => rows.map(r => JSON.parse(r.payload));
  function record(provider, status, count, errors = [], at = Date.now()) { q.putScan.run(at, provider, status, count, errors.join(' | ').slice(0, 600)); }
  function importData({ videos = [], reddit = [], official = [], saved = [] } = {}, at = Date.now()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const v of videos) {
        if (!v.id || !v.title || !Number.isFinite(Number(v.publishedAt))) continue;
        const obj = { ...v, observedAt: at, views: Math.max(0, Number(v.views || 0)), isVod: Boolean(v.isVod), kind: v.kind === 'shorts' ? 'shorts' : 'long' };
        q.putVideo.run(String(v.id), JSON.stringify(obj), at); q.videoSample.run(String(v.id), at, obj.views);
      }
      for (const p of reddit) {
        if (!p.id || !p.title || !p.url || !Number.isFinite(Number(p.publishedAt))) continue;
        // Imported Reddit posts need actual, fresh Top/Today or Hot listing evidence.
        // Never manufacture an observation timestamp from an import time.
        const sourceEvidence = Array.isArray(p.listingEvidence) ? p.listingEvidence[0] : null;
        const sort = p.sort || sourceEvidence?.sort;
        const observedAt = Number(p.observedAt || sourceEvidence?.observedAt);
        const listingUrl = p.listingUrl || sourceEvidence?.url || '';
        const isListing = ['top', 'hot'].includes(sort) && /^https:\/\/www\.reddit\.com\/r\/[a-z0-9_]+\/(top\/\?t=day|hot\/)$/i.test(listingUrl);
        if (!isListing || !withinHours(observedAt, 2, at)) continue;
        const obj = { ...p, sort, listingUrl, observedAt, source: 'Reddit' };
        q.putReddit.run(String(p.id), JSON.stringify(obj), observedAt);
        if (Number.isFinite(Number(p.score)) && p.score !== null) q.redditSample.run(String(p.id), observedAt, Number(p.score), Number.isFinite(Number(p.comments)) ? Number(p.comments) : null);
      }
      for (const p of official) {
        if (!p.id || !p.title || !p.url || !Number.isFinite(Number(p.publishedAt))) continue;
        q.putOfficial.run(String(p.id), JSON.stringify({ ...p, source: 'Official', observedAt: at }), at);
      }
      for (const s of saved) {
        if (!s.id || !s.title) continue;
        q.putSaved.run(String(s.id), String(s.kind || 'video'), String(s.title), String(s.url || ''), String(s.note || ''), Number(s.savedAt || at));
      }
      db.exec('COMMIT');
    } catch (err) { db.exec('ROLLBACK'); throw err; }
  }
  function feed({ now = Date.now(), channels = [], sample = false } = {}) {
    const videos = asJson(db.prepare('SELECT payload FROM videos WHERE last_seen >= ? ORDER BY last_seen DESC LIMIT 4000').all(now - 14 * 86400000))
      .filter(v => withinHours(v.publishedAt, 48, now)).map(v => ({ ...v, growth: computeGrowth(db.prepare('SELECT at, views FROM video_samples WHERE id=? AND at>=? ORDER BY at').all(v.id, now - 48 * 3600000), now) }));
    const reddit = asJson(db.prepare('SELECT payload FROM reddit WHERE last_seen >= ? ORDER BY last_seen DESC LIMIT 400').all(now - 2 * 3600000))
      .filter(x => withinHours(x.publishedAt, 48, now));
    const official = asJson(db.prepare('SELECT payload FROM official ORDER BY last_seen DESC LIMIT 100').all()).filter(x => withinHours(x.publishedAt, 48, now));
    const stories = [...reddit, ...official].sort((a, b) => b.publishedAt - a.publishedAt);
    const popularLong = popular(videos, 'long', now), popularShorts = popular(videos, 'shorts', now);
    const hotLong = hot(videos, 'long', now), hotShorts = hot(videos, 'shorts', now);
    const saved = db.prepare('SELECT id,kind,title,url,note,saved_at as savedAt FROM saved ORDER BY saved_at DESC LIMIT 1000').all();
    const scans = db.prepare('SELECT at,provider,status,count,error FROM scans ORDER BY id DESC LIMIT 50').all();
    const ideas = makeContentIdeas({ videos, stories }, now);
    const lastScan = scans[0]?.at || null;
    return { generatedAt: now, isDemo: sample, summary: { eligibleVideos: popularLong.length + popularShorts.length, freshStories: stories.length, ideas: ideas.length, lastScan },
      popular: { long: popularLong, shorts: popularShorts }, hot: { long: hotLong, shorts: hotShorts }, stories, contentCreation: { items: ideas }, saved,
      channels, scans, sources: { youtube: Boolean(channels.length), reddit: null, official: null },
      note: 'This is a rebuilt database; original Sites data is not automatically synchronized.' };
  }
  function trackedVideoIds(now = Date.now()) {
    // Only published-within-48h videos are worth re-sampling. Avoid tracking archived VODs.
    return asJson(db.prepare('SELECT payload FROM videos WHERE last_seen >= ? ORDER BY last_seen DESC LIMIT 4000').all(now - 7 * 86400000))
      .filter(v => !v.isVod && withinHours(v.publishedAt, 48, now))
      .map(v => String(v.id));
  }
  function save(s) {
    if (!s.id || !s.title) throw new Error('id and title are required');
    q.putSaved.run(String(s.id).slice(0, 300), String(s.kind || 'video').slice(0, 30), String(s.title).slice(0, 400), String(s.url || '').slice(0, 1000), String(s.note || '').slice(0, 3000), Date.now());
  }
  function del(id) { q.delSaved.run(String(id)); }
  function getMeta(k) { return db.prepare('SELECT value FROM meta WHERE key=?').get(k)?.value || null; }
  function setMeta(k, v) { q.putMeta.run(k, String(v)); }
  function exportAll() {
    return { exportedAt: Date.now(), videos: asJson(db.prepare('SELECT payload FROM videos').all()),
      reddit: asJson(db.prepare('SELECT payload FROM reddit').all()), official: asJson(db.prepare('SELECT payload FROM official').all()),
      saved: db.prepare('SELECT id,kind,title,url,note,saved_at as savedAt FROM saved').all() };
  }
  return { db, record, importData, feed, save, del, getMeta, setMeta, trackedVideoIds, exportAll };
}
