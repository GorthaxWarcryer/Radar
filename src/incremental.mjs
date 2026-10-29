import { normalizeYouTubeVideo, withinHours } from './core.mjs';

const api = 'https://www.googleapis.com/youtube/v3';
const clampInt = (value, fallback, lo, hi) => {
  const n = Number(value);
  return Number.isInteger(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};
const unique = values => [...new Set(values)];
const safeState = (raw, channels) => {
  let old = {};
  try { old = raw ? JSON.parse(raw) : {}; } catch { /* corrupted cursor resets safely */ }
  const signature = channels.join('|');
  if (old.signature !== signature) return { signature, channelCursor: 0, pending: [], trackingCursor: 0, details: {}, completedPasses: 0, passErrors: 0, lastFullDiscoveryAt: null };
  return {
    signature,
    channelCursor: clampInt(old.channelCursor, 0, 0, Math.max(0, channels.length - 1)),
    pending: Array.isArray(old.pending) ? unique(old.pending.filter(id => /^[a-zA-Z0-9_-]{11}$/.test(id))).slice(0, 500) : [],
    trackingCursor: clampInt(old.trackingCursor, 0, 0, 100000000),
    details: old.details && typeof old.details === 'object' ? old.details : {},
    completedPasses: clampInt(old.completedPasses, 0, 0, 1000000000),
    passErrors: clampInt(old.passErrors, 0, 0, 1000000),
    lastFullDiscoveryAt: Number.isFinite(old.lastFullDiscoveryAt) ? old.lastFullDiscoveryAt : null
  };
};

// Each call is deliberately bounded. The cursor and outstanding IDs are persisted
// after every successful stage so a restart or failed request cannot erase work.
export async function scanYouTubeSlice({ env, store, now = Date.now(), fetchJSON = requestJSON, deadline = Date.now() + 30000 }) {
  const channels = unique(String(env.YOUTUBE_CHANNELS || '').split(',').map(s => s.trim()).filter(Boolean)).slice(0, 40);
  if (!env.YOUTUBE_API_KEY || !channels.length) return { status: 'not_configured', count: 0, errors: [], progress: null };
  const state = safeState(store.getMeta('youtubeCursor'), channels);
  const errors = [];
  const maxChannels = clampInt(env.YOUTUBE_CHANNELS_PER_SCAN, 2, 1, 5);
  const maxVideos = clampInt(env.YOUTUBE_VIDEOS_PER_SCAN, 50, 1, 50);
  const key = encodeURIComponent(env.YOUTUBE_API_KEY);
  const request = async url => {
    const remaining = deadline - Date.now();
    if (remaining < 1200) throw new Error('Slice time budget reached; remaining work queued');
    return fetchJSON(url, Math.min(8000, remaining - 200));
  };
  const persist = () => store.setMeta('youtubeCursor', JSON.stringify(state));
  let discovered = 0;
  let processed = 0;
  let madeProgress = false;
  for (let i = 0; i < Math.min(maxChannels, channels.length); i++) {
    if (deadline - Date.now() < 2600) break;
    const ident = channels[state.channelCursor];
    try {
      const selector = ident.startsWith('@') ? `forHandle=${encodeURIComponent(ident)}` : `id=${encodeURIComponent(ident)}`;
      const data = await request(`${api}/channels?part=snippet,contentDetails&${selector}&key=${key}`);
      const channel = data.items?.[0];
      if (!channel?.contentDetails?.relatedPlaylists?.uploads) throw new Error('Unknown channel or missing uploads playlist');
      state.details[ident] = { id: channel.id, title: channel.snippet?.title || ident, handle: ident };
      const playlistId = encodeURIComponent(channel.contentDetails.relatedPlaylists.uploads);
      const playlist = await request(`${api}/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=50&key=${key}`);
      const ids = (playlist.items || []).map(x => x.contentDetails?.videoId).filter(id => /^[a-zA-Z0-9_-]{11}$/.test(id));
      const seen = new Set(state.pending);
      for (const id of ids) if (!seen.has(id) && state.pending.length < 500) { state.pending.push(id); seen.add(id); discovered++; }
      madeProgress = true;
    } catch (err) { state.passErrors++; errors.push(`${ident}: ${String(err.message).slice(0,160)}`); }
    // Even an unavailable channel advances, preventing one bad handle from blocking the entire scan.
    state.channelCursor++;
    if (state.channelCursor === channels.length) {
      state.channelCursor = 0;
      state.completedPasses++;
      if (state.passErrors === 0) state.lastFullDiscoveryAt = Date.now();
      state.passErrors = 0;
    }
    persist();
  }
  // Tracking is independent of fresh discovery: sample previously seen videos
  // even on runs that discover no new IDs, so HOT uses real time-series values.
  if (deadline - Date.now() >= 2500) {
    const tracked = store.trackedVideoIds(now);
    const queued = state.pending.slice(0, Math.min(maxVideos, 35));
    const available = Math.max(0, maxVideos - queued.length);
    const selected = [];
    if (tracked.length) {
      let inspected = 0;
      while (selected.length < available && inspected < tracked.length) {
        const idx = (state.trackingCursor + inspected) % tracked.length;
        if (!queued.includes(tracked[idx])) selected.push(tracked[idx]);
        inspected++;
      }
      state.trackingCursor = (state.trackingCursor + inspected) % tracked.length;
    }
    const ids = unique([...queued, ...selected]);
    if (ids.length) {
      try {
        const result = await request(`${api}/videos?part=snippet,statistics,contentDetails,liveStreamingDetails&id=${ids.map(encodeURIComponent).join(',')}&key=${key}`);
        const videos = (result.items || []).map(entry => normalizeYouTubeVideo(entry, Date.now())).filter(v => withinHours(v.publishedAt, 48, Date.now()));
        store.importData({ videos }, Date.now());
        // The request completed: remove only submitted queued IDs, including deleted/old videos.
        const completed = new Set(queued);
        state.pending = state.pending.filter(id => !completed.has(id));
        processed = videos.length;
        madeProgress = true;
      } catch (err) {
        // Failed detail fetches retain the queue; tracking cursor rolls back to avoid lost samples.
        if (tracked.length) state.trackingCursor = (state.trackingCursor - selected.length + tracked.length) % tracked.length;
        errors.push(`Video details: ${String(err.message).slice(0,160)}`);
      }
      persist();
    }
  }
  const progress = {
    nextChannel: state.channelCursor,
    totalChannels: channels.length,
    queuedVideos: state.pending.length,
    discovered,
    processed,
    completedPasses: state.completedPasses,
    lastFullDiscoveryAt: state.lastFullDiscoveryAt
  };
  store.setMeta('youtubeLastProgress', JSON.stringify({ ...progress, at: Date.now(), madeProgress }));
  return {
    status: errors.length ? (madeProgress ? 'partial' : 'error') : (state.channelCursor === 0 && state.pending.length === 0 ? 'complete' : 'progress'),
    count: processed, errors, progress, channels: Object.values(state.details)
  };
}

async function requestJSON(url, timeoutMs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`YouTube HTTP ${response.status}`);
  return response.json();
}
