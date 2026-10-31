-- Original ChatGPT Sites database remains untouched. New Cloudflare D1 schema.
CREATE TABLE IF NOT EXISTS videos (id TEXT PRIMARY KEY, payload TEXT NOT NULL, last_seen INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_videos_seen ON videos(last_seen);
CREATE TABLE IF NOT EXISTS video_samples (id TEXT NOT NULL, at INTEGER NOT NULL, views INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'github', PRIMARY KEY(id,at));
CREATE INDEX IF NOT EXISTS idx_video_samples_id ON video_samples(id,at);
CREATE TABLE IF NOT EXISTS reddit (id TEXT PRIMARY KEY, payload TEXT NOT NULL, last_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS official (id TEXT PRIMARY KEY, payload TEXT NOT NULL, last_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS saved (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', saved_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS scans (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL, count INTEGER NOT NULL, error TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Private research lifecycle. Separate table keeps existing saved bookmarks schema compatible.
CREATE TABLE IF NOT EXISTS research (
 id TEXT PRIMARY KEY,
 status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New','Seen','Investigating','Planned','Published','Dismissed')),
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS managed_channels (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL DEFAULT '',
 official INTEGER NOT NULL DEFAULT 0,
 blocked INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS discovery_settings (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hidden_videos (
 id TEXT PRIMARY KEY,
 updated_at INTEGER NOT NULL
);
