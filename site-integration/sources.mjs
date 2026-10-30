/** Azeroth Radar original-Site source validation — pure, deterministic, no network/AI. */
export const TWO_HOURS = 2 * 60 * 60 * 1000;
export const DAY = 24 * 60 * 60 * 1000;
const HORIZON = 2 * DAY;
const SUBREDDITS = new Set(['wowforever', 'classicwow', 'wow']);
const futureGrace = 5 * 60 * 1000;

const utcMs = (date) => {
  if (typeof date === 'number') return Number.isFinite(date) && date >= 1e12 ? date : NaN;
  if (typeof date !== 'string' || !/\d{4}-\d\d-\d\dT/.test(date)) return NaN;
  // Require a timezone, not a guessed local timestamp.
  if (!/(Z|[+-]\d\d:\d\d)$/.test(date)) return NaN;
  return Date.parse(date);
};
const age = (timestamp, now, window) => Number.isFinite(timestamp) && timestamp <= now + futureGrace && timestamp >= now - window;
const canonical = value => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.hash = ''; url.searchParams.delete('utm_source'); url.searchParams.delete('utm_medium'); url.searchParams.delete('utm_campaign');
    return url;
  } catch { return null; }
};
const clean = (s, cap) => typeof s === 'string' ? s.trim().slice(0, cap) : '';
const metric = (n, signed = false) => Number.isSafeInteger(n) && (signed || n >= 0) ? n : null;
const reject = (reason) => ({ accepted: false, reason });

/** Accept a Reddit post ONLY with actual fresh Hot/Top-day listing membership. */
export function validateRedditPost(raw, now = Date.now()) {
  if (!raw || raw.language !== 'en') return reject('english-original-required');
  const publishedAt = utcMs(raw.publishedAt);
  if (!age(publishedAt, now, HORIZON)) return reject('outside-48h-publication-window');
  const url = canonical(raw.url);
  const match = url?.hostname === 'www.reddit.com' && url.pathname.match(/^\/r\/([a-z0-9_]+)\/comments\/([a-z0-9]+)(?:\/|$)/i);
  if (!match) return reject('invalid-reddit-permalink');
  const subreddit = match[1].toLowerCase();
  if (!SUBREDDITS.has(subreddit)) return reject('subreddit-not-allowed');
  if (raw.removed || raw.deleted || raw.isMeme) return reject('excluded-reddit-content');
  const proofs = (Array.isArray(raw.listingEvidence) ? raw.listingEvidence : []).flatMap((item) => {
    const listing = canonical(item?.url); const observedAt = utcMs(item?.observedAt);
    if (!listing || listing.hostname !== 'www.reddit.com' || !age(observedAt, now, TWO_HOURS)) return [];
    const path = listing.pathname.replace(/\/$/, '').toLowerCase();
    const base = `/r/${subreddit}`;
    if (item.sort === 'hot' && path === `${base}/hot` && !listing.search) return [{ sort: 'hot', observedAt }];
    if (item.sort === 'top' && path === `${base}/top` && listing.searchParams.get('t') === 'day') return [{ sort: 'top', observedAt }];
    return [];
  });
  if (!proofs.length) return reject('fresh-hot-or-top-listing-evidence-required');
  const title = clean(raw.title, 300);
  if (!title) return reject('title-required');
  const measurement = raw.measurement || {};
  const measurementAt = utcMs(measurement.at);
  const measured = age(measurementAt, now, TWO_HOURS) && ['page','api','search'].includes(measurement.source);
  return { accepted: true, value: {
    id: `reddit:t3_${match[2].toLowerCase()}`, subreddit, url: `https://www.reddit.com/r/${subreddit}/comments/${match[2].toLowerCase()}/`,
    title, summary: clean(raw.summary, 600), publishedAt,
    publicationPrecision: raw.publicationPrecision === 'day' ? 'day' : 'exact',
    listingEvidence: proofs, score: measured ? metric(measurement.score, true) : null,
    comments: measured ? metric(measurement.comments) : null,
    metricsAt: measured ? measurementAt : null, metricsSource: measured ? measurement.source : null
  }};
}

/** HOT is *measured change*, never age-normalized lifetime score. */
export function redditGrowthPerHour(samples) {
  if (!Array.isArray(samples)) return null;
  const pages = samples.filter(s => ['page','api'].includes(s?.source) && Number.isSafeInteger(s?.score) && Number.isFinite(utcMs(s.at))).sort((a,b) => utcMs(a.at) - utcMs(b.at));
  if (pages.length < 2) return null;
  const first = pages[pages.length - 2], last = pages.at(-1);
  const delta = utcMs(last.at) - utcMs(first.at);
  if (delta < 5 * 60 * 1000 || delta > DAY) return null;
  return (last.score - first.score) * (60 * 60 * 1000) / delta;
}

const official = (url) => {
  if (!url) return null;
  const host = url.hostname.toLowerCase(), path = url.pathname;
  if (host === 'worldofwarcraft.blizzard.com' && /^\/(en-us|en-gb)\/news\/\d+(?:\/|$)/i.test(path)) return 'blizzard-news';
  if (host === 'news.blizzard.com' && /^\/(en-us|en-gb)\/article\/\d+(?:\/|$)/i.test(path)) return 'blizzard-news';
  if (['us.forums.blizzard.com', 'eu.forums.blizzard.com'].includes(host) && /^\/en\/wow\/t\/[^/]+\/\d+/i.test(path)) return 'blizzard-forum';
  return null;
};
/** A tracker is a discovery hint, never proof of publication/authorship. */
export function validateBlizzardPost(raw, now = Date.now()) {
  if (!raw || raw.language !== 'en') return reject('english-original-required');
  const url = canonical(raw.originalUrl);
  const kind = official(url);
  if (!kind) return reject('verified-official-blizzard-url-required');
  if (raw.officialAuthorVerified !== true) return reject('official-authorship-not-verified');
  const publishedAt = utcMs(raw.publishedAt);
  if (!age(publishedAt, now, HORIZON)) return reject('outside-48h-original-publication-window');
  const title = clean(raw.title, 400);
  if (!title) return reject('title-required');
  // Canonical URL is the stable identity; ignore tracker crawl/last-updated timestamps.
  const permalink = url.origin + url.pathname.replace(/\/$/, '');
  return {accepted:true, value:{id:`bluepost:${permalink}`, kind, originalUrl:permalink,
    title, author:clean(raw.author, 100), summary:clean(raw.summary, 600), publishedAt,
    publicationPrecision: raw.publicationPrecision === 'day' ? 'day' : 'exact',
    discoveryHint: clean(raw.discoveryHint, 80) || null}};
}

export function acceptSourceBatch(rawPosts, validator, now = Date.now()) {
  const accepted = new Map(); const reasons = {};
  for (const raw of Array.isArray(rawPosts) ? rawPosts : []) {
    const result = validator(raw, now);
    if (!result.accepted) { reasons[result.reason] = (reasons[result.reason] || 0) + 1; continue; }
    const item = result.value;
    // Do not renew publication time when a duplicate or a refreshed index appears.
    if (!accepted.has(item.id)) accepted.set(item.id, item);
  }
  return {items:[...accepted.values()], rejected:Object.values(reasons).reduce((a,b)=>a+b,0), reasons};
}

/** No speculative editorial ideas or fabricated metrics; only evidence-backed candidates. */
export function editorialCandidates(reddit = [], bluePosts = [], now = Date.now()) {
  const items = [];
  for (const item of reddit) {
    if (!age(item?.publishedAt, now, HORIZON)) continue;
    items.push({id:item.id, platform:'reddit', title:item.title, sourceUrl:item.url, publishedAt:item.publishedAt,
      tags:['community-discussion'], measuredScore:item.score ?? null, measuredComments:item.comments ?? null,
      eligibleTop24: item.publicationPrecision === 'exact' && age(item.publishedAt, now, DAY) && item.listingEvidence?.some(e=>e.sort==='top' && age(e.observedAt, now, TWO_HOURS))});
  }
  for (const item of bluePosts) {
    if (!age(item?.publishedAt, now, HORIZON)) continue;
    items.push({id:item.id,platform:'bluepost',title:item.title,sourceUrl:item.originalUrl,publishedAt:item.publishedAt,
      tags:['official-source'],measuredScore:null,measuredComments:null,eligibleTop24:false});
  }
  return items.sort((a,b)=>b.publishedAt-a.publishedAt || a.id.localeCompare(b.id));
}
