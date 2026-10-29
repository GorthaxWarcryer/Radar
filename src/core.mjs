const HOUR = 3600000;
const DAY = 24 * HOUR;
export { HOUR, DAY };
export const minViews = 5000;
export const TTL = 48 * HOUR;

export function withinHours(timestamp, hours, now = Date.now()) {
  const date = Number(timestamp);
  return Number.isFinite(date) && date > 0 && date <= now + 5 * 60 * 1000 && now - date < hours * HOUR;
}
export function isLikelyRussian(text = '') {
  return /[а-яё]/i.test(text) && !/[іїєґ]/i.test(text); // Conservative flag; language detection can be improved.
}
export function isExcludedRedditPost(p) {
  const title = String(p.title || '').toLowerCase();
  const flair = String(p.link_flair_text || p.flair || '').toLowerCase();
  return p.removed || p.over_18 || isLikelyRussian(title) || /\b(meme|shitpost|weekly questions|simple question)\b/i.test(flair) || /\b(what should i play|is it worth playing)\b/i.test(title);
}
export function parseDuration(value = '') {
  const m = String(value).match(/^P(?:([0-9]+)D)?T?(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?$/);
  return m ? Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0) : 0;
}
export function normalizeYouTubeVideo(v, now = Date.now()) {
  const t = Number(new Date(v.snippet?.publishedAt || 0));
  const durationSec = parseDuration(v.contentDetails?.duration || '');
  const vod = Boolean(v.liveStreamingDetails) || v.snippet?.liveBroadcastContent === 'live' || v.snippet?.liveBroadcastContent === 'upcoming';
  return {
    id: String(v.id), title: String(v.snippet?.title || 'Untitled'),
    description: String(v.snippet?.description || '').slice(0, 3000),
    thumbnail: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || '',
    channelName: String(v.snippet?.channelTitle || ''), channelId: String(v.snippet?.channelId || ''),
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(String(v.id))}`,
    publishedAt: Number.isFinite(t) ? t : 0,
    views: Math.max(0, Number(v.statistics?.viewCount || 0)),
    likes: Math.max(0, Number(v.statistics?.likeCount || 0)),
    comments: Math.max(0, Number(v.statistics?.commentCount || 0)),
    durationSec, kind: durationSec > 0 && durationSec <= 180 ? 'shorts' : 'long',
    isVod: vod, observedAt: now
  };
}
export function computeGrowth(samples, now = Date.now(), field = 'views') {
  const recent = samples.filter(s => Number(s.at) >= now - TTL && Number.isFinite(Number(s[field])))
    .sort((a, b) => a.at - b.at);
  if (recent.length < 2 || recent.at(-1).at <= recent[0].at) return null;
  const hours = (recent.at(-1).at - recent[0].at) / HOUR;
  return {
    perHour: Math.max(0, Math.round((Number(recent.at(-1)[field]) - Number(recent[0][field])) / hours)),
    gained: Math.max(0, Number(recent.at(-1)[field]) - Number(recent[0][field])),
    sampleHours: Math.round(hours * 10) / 10,
    firstAt: recent[0].at, lastAt: recent.at(-1).at
  };
}
export function eligibleVideo(v, now = Date.now()) {
  return !v.isVod && Number(v.views) >= minViews && withinHours(v.publishedAt, 48, now);
}
export function popular(videos, kind, now = Date.now()) {
  return videos.filter(v => eligibleVideo(v, now) && v.kind === kind).sort((a, b) => Number(b.views) - Number(a.views));
}
export function hot(videos, kind, now = Date.now()) {
  return videos.filter(v => eligibleVideo(v, now) && v.kind === kind && v.growth && Number.isFinite(v.growth.perHour))
    .sort((a, b) => b.growth.perHour - a.growth.perHour);
}
export function classifyStory(p, now = Date.now()) {
  return withinHours(p.publishedAt, 48, now) && !isExcludedRedditPost(p);
}
export function normalizeRedditPost(p, subreddit, sort, observedAt = Date.now()) {
  if (!p.id || !p.created_utc || !p.permalink) return null;
  const title = String(p.title || '').trim();
  const publishedAt = Math.round(Number(p.created_utc) * 1000);
  const post = { id: `reddit:${p.id}`, title, summary: String(p.selftext || '').slice(0, 600),
    subreddit, source: 'Reddit', sort, url: `https://www.reddit.com${p.permalink}`,
    score: Number.isFinite(Number(p.score)) ? Number(p.score) : null,
    comments: Number.isFinite(Number(p.num_comments)) ? Number(p.num_comments) : null,
    publishedAt, observedAt,
    listingUrl: `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${sort === 'top' ? 'top/?t=day' : 'hot/'}`,
    flair: p.link_flair_text || '' };
  return classifyStory(post, observedAt) ? post : null;
}

export function makeContentIdeas({ videos, stories }, now = Date.now()) {
  const eligible = videos.filter(v => eligibleVideo(v, now));
  const sources = [...eligible.map(v => ({ ...v, sourceType: 'YouTube', signal: v.views || 0 })),
    ...stories.filter(s => withinHours(s.publishedAt, 48, now)).map(s => ({ ...s, sourceType: s.source || 'Reddit', signal: (s.score || 0) * 30 + (s.comments || 0) * 100 }))];
  sources.sort((a, b) => b.signal - a.signal);
  const dedup = new Set(); const result = [];
  for (const s of sources) {
    const normalized = String(s.title || '').toLowerCase().replace(/\b(wow|world of warcraft|forever|blizzard|new|the|and|with|esfand|reacts|just)\b/g,'').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>3).slice(0,5).sort().join(' ');
    if (!normalized || dedup.has(normalized)) continue;
    dedup.add(normalized);
    const topic = String(s.title || '').replace(/\s*\|.*$/, '').slice(0, 110);
    const hotSignal = s.growth?.perHour ? `Measured +${s.growth.perHour.toLocaleString('en-US')} views/hour` : s.sourceType === 'YouTube' ? `${(s.views || 0).toLocaleString('en-US')} total views` : `${s.score ?? '—'} Reddit score · ${s.comments ?? '—'} comments`;
    result.push({ id: `idea:${s.id}`, title: topic, proposedTitle: `What ${topic.replace(/[!?]+$/,'')} Means for WoW Players`,
      summary: `${s.sourceType} signal: ${hotSignal}. Review the linked source before asserting mechanics or community consensus.`,
      angle: 'Test the claim, compare player outcomes, and explain the practical decision.',
      outline: ['What changed or started the discussion', 'What the original source actually says', 'A gameplay test or side-by-side comparison', 'What it means for different players', 'What to watch for next'],
      format: s.sourceType === 'YouTube' ? 'Reaction + analysis' : 'Explainer / discussion',
      priority: result.length < 3 ? 'High' : 'Watch', sourceUrl: s.url, sourceTitle: s.title,
      sourceType: s.sourceType, publishedAt: s.publishedAt,
      evidence: [s.id] });
    if (result.length >= 12) break;
  }
  return result;
}
