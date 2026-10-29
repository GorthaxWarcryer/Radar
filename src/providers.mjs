import { normalizeRedditPost, normalizeYouTubeVideo, withinHours } from './core.mjs';

async function getJSON(url, opts = {}, deadline = Date.now() + 14000) {
  const timeoutMs = Math.max(1000, Math.min(14000, deadline - Date.now() - 200));
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}`);
  return res.json();
}
const officialHost = url => { try { const h = new URL(url).hostname.toLowerCase(); return h === 'blizzard.com' || h.endsWith('.blizzard.com') || h === 'battle.net' || h.endsWith('.battle.net'); } catch { return false; } };
const chunks = (xs, n) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));
const youtube = 'https://www.googleapis.com/youtube/v3';

export async function fetchYouTube(env, now = Date.now()) {
  if (!env.YOUTUBE_API_KEY || !env.YOUTUBE_CHANNELS) return { status: 'not_configured', videos: [], channels: [], errors: [] };
  const key = env.YOUTUBE_API_KEY;
  const channels = env.YOUTUBE_CHANNELS.split(',').map(s => s.trim()).filter(Boolean);
  const errors = [], gathered = [], channelDetails = [];
  for (const ident of channels.slice(0, 40)) {
    try {
      const query = ident.startsWith('@') ? `forHandle=${encodeURIComponent(ident)}` : `id=${encodeURIComponent(ident)}`;
      const data = await getJSON(`${youtube}/channels?part=snippet,contentDetails&${query}&key=${encodeURIComponent(key)}`);
      const channel = data.items?.[0];
      if (!channel) { errors.push(`Unknown channel ${ident}`); continue; }
      channelDetails.push({ id: channel.id, title: channel.snippet?.title || ident, handle: ident });
      const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) { errors.push(`No uploads playlist ${ident}`); continue; }
      // Two pages maximum: avoids unbounded API consumption; old uploads can be filtered client-side.
      let token = undefined;
      for (let i = 0; i < 2; i++) {
        const playlistUrl = `${youtube}/playlistItems?part=contentDetails&playlistId=${encodeURIComponent(uploads)}&maxResults=50&key=${encodeURIComponent(key)}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
        const page = await getJSON(playlistUrl);
        const ids = (page.items || []).map(x => x.contentDetails?.videoId).filter(Boolean);
        gathered.push(...ids);
        token = page.nextPageToken;
        if (!token || ids.length === 0) break;
      }
    } catch (err) { errors.push(`${ident}: ${String(err.message).slice(0,180)}`); }
  }
  const videos = [];
  for (const ids of chunks([...new Set(gathered)], 50)) {
    try {
      const data = await getJSON(`${youtube}/videos?part=snippet,statistics,contentDetails,liveStreamingDetails&id=${ids.map(encodeURIComponent).join(',')}&key=${encodeURIComponent(key)}`);
      for (const entry of data.items || []) {
        const video = normalizeYouTubeVideo(entry, now);
        if (withinHours(video.publishedAt, 72, now)) videos.push(video);
      }
    } catch (err) { errors.push(`Video details: ${String(err.message).slice(0,180)}`); }
  }
  return { status: errors.length ? videos.length ? 'partial' : 'error' : 'complete', videos, channels: channelDetails, errors };
}

async function redditToken(env, deadline = Date.now() + 14000) {
  const raw = `${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`;
  const auth = Buffer.from(raw).toString('base64');
  const form = new URLSearchParams({ grant_type: 'client_credentials' });
  const url = 'https://www.reddit.com/api/v1/access_token';
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': env.REDDIT_USER_AGENT }, body: form, signal: AbortSignal.timeout(Math.max(1000, Math.min(14000, deadline - Date.now() - 200))) });
  if (!res.ok) throw new Error(`Reddit OAuth HTTP ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('Reddit OAuth did not provide access token');
  return data.access_token;
}
export async function fetchReddit(env, now = Date.now(), { cursor = 0, maxListings = 2, deadline = Date.now() + 55000 } = {}) {
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET) return { status: 'not_configured', posts: [], errors: [] };
  const errors = [], observed = new Map();
  const subs = (env.REDDIT_SUBREDDITS || 'wowforever,classicwow,wow').split(',').map(x => x.trim().replace(/^r\//,'')).filter(x => /^[a-z0-9_]+$/i.test(x)).slice(0, 10);
  let token;
  try { token = await redditToken(env, deadline); } catch (err) { return { status: 'error', posts: [], errors: [err.message] }; }
  const listings = subs.flatMap(sub => ['top', 'hot'].map(sort => ({ sub, sort })));
  let nextCursor = listings.length ? cursor % listings.length : 0;
  let checked = 0;
  for (let i = 0; i < Math.min(maxListings, listings.length); i++) {
    if (deadline - Date.now() < 2200) break;
    const { sub, sort } = listings[nextCursor];
    try {
        const qs = sort === 'top' ? '?t=day&limit=100&raw_json=1' : '?limit=100&raw_json=1';
        const data = await getJSON(`https://oauth.reddit.com/r/${encodeURIComponent(sub)}/${sort}${qs}`, { headers: { Authorization: `bearer ${token}`, 'User-Agent': env.REDDIT_USER_AGENT } }, deadline);
        for (const p of data?.data?.children || []) {
          const post = normalizeRedditPost(p.data || {}, sub, sort, now);
          if (post) {
            const previous = observed.get(post.id);
            // Preserve listing evidence from the observed feed; prefer Top today if both qualify.
            if (!previous || sort === 'top') observed.set(post.id, post);
          }
        }
    } catch (err) { errors.push(`${sub}/${sort}: ${String(err.message).slice(0,180)}`); }
    nextCursor = (nextCursor + 1) % listings.length;
    checked++;
  }
  return { status: errors.length ? observed.size ? 'partial' : 'error' : checked < listings.length ? 'progress' : 'complete', posts: [...observed.values()].slice(0, 60), errors, nextCursor, checked, totalListings: listings.length };
}
export async function fetchOfficial(env, now = Date.now(), deadline = Date.now() + 14000) {
  if (!env.OFFICIAL_POSTS_JSON_URL) return { status: 'not_configured', posts: [], errors: [] };
  try {
    const data = await getJSON(env.OFFICIAL_POSTS_JSON_URL, {}, deadline);
    if (!Array.isArray(data.posts || data)) throw new Error('Feed must be an array or {posts:[]}');
    const entries = Array.isArray(data) ? data : data.posts;
    const posts = entries.map(x => ({ id: `official:${String(x.id || x.url)}`, source: 'Official', title: String(x.title || ''),
      summary: String(x.summary || x.description || '').slice(0, 1000), url: String(x.url || ''),
      publishedAt: typeof x.publishedAt === 'number' ? x.publishedAt : Number(new Date(x.publishedAt)), observedAt: now }))
      .filter(p => /^https:\/\//.test(p.url) && officialHost(p.url) && p.title && withinHours(p.publishedAt, 48, now)).slice(0, 50);
    return { status: 'complete', posts, errors: [] };
  } catch (err) { return { status: 'error', posts: [], errors: [err.message] }; }
}
