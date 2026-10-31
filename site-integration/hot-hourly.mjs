/** Two-stage HOT velocity model for integration into the ORIGINAL Azeroth Radar Site.
 * This helper does not deploy or replace the native Site's backend.
 */
export const HOUR_MS = 3600000;
export const DAY_MS = 24 * HOUR_MS;
export const HOT_MIN_VIEWS = 5000;
const MIN_PAIR_MS = 20 * 60000;

export function hotVelocity({ publishedAt, samples = [], now = Date.now(), minViews = HOT_MIN_VIEWS, windowMs = DAY_MS }) {
  const reject = kind => ({ eligible:false, vph:null, kind, measuredAt:null, intervalMinutes:null, latestViews:null, ageHours:null });
  if (!Number.isFinite(publishedAt) || !Number.isFinite(now) || publishedAt > now || now-publishedAt >= windowMs)
    return reject('outside-publication-window');
  const sorted = samples
    .filter(x => x && Number.isFinite(x.capturedAt) && Number.isFinite(x.views) && x.views >= 0
      && x.capturedAt >= publishedAt && x.capturedAt <= now)
    .sort((a,b) => b.capturedAt-a.capturedAt);
  const unique = sorted.filter((x,i) => i===0 || x.capturedAt!==sorted[i-1].capturedAt);
  const latest = unique[0];
  if (!latest) return reject('no-observation');
  const ageHours = (latest.capturedAt-publishedAt)/HOUR_MS;
  const common = {eligible:false, vph:null, kind:'below-view-threshold',
    measuredAt:latest.capturedAt, intervalMinutes:null, latestViews:latest.views, ageHours};
  if (latest.views < minViews) return common;

  const prior = unique.slice(1)
    .filter(x => latest.capturedAt-x.capturedAt >= MIN_PAIR_MS && x.views <= latest.views)
    .sort((a,b) => Math.abs(latest.capturedAt-a.capturedAt-HOUR_MS)-Math.abs(latest.capturedAt-b.capturedAt-HOUR_MS))[0];
  if (prior) {
    const elapsed = latest.capturedAt-prior.capturedAt;
    return {
      eligible:true, vph:Math.round((latest.views-prior.views)/(elapsed/HOUR_MS)),
      kind: elapsed <= 90*60000 ? 'measured-hourly' : 'measured-interval',
      measuredAt:latest.capturedAt, intervalMinutes:Math.round(elapsed/60000),
      latestViews:latest.views, ageHours
    };
  }
  if (ageHours <= 0) return {...common, kind:'unresolved-upload-age'};
  return {eligible:true, vph:Math.round(latest.views/ageHours),
    kind:'estimated-since-upload', measuredAt:latest.capturedAt,
    intervalMinutes:null, latestViews:latest.views, ageHours};
}

/** Existing policy filters (English/stream/VOD/channel) remain the native Site's responsibility. */
export function rankHotVideos(videos, now=Date.now()) {
  return videos.flatMap(video => {
    const hot = hotVelocity({...video, now});
    return hot.eligible ? [{...video, hot}] : [];
  }).sort((a,b) => b.hot.vph-a.hot.vph || b.hot.latestViews-a.hot.latestViews || b.publishedAt-a.publishedAt);
}
