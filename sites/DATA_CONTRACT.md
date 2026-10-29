# Azeroth Radar — portable data and API contract

This document describes behavior and fields, NOT an assertion that ChatGPT Sites supports particular SQL engines or the Node HTTP adapter. Implement the same behavior with the **native supported Sites runtime**.

## Collections / tables

- `videos`: `id` (YouTube video ID, unique), `channelId`, `channelName`, `title`, `description` (optional), `thumbnail`, `url`, `publishedAt` (Unix ms), `durationSec`, `kind` (`long`/`shorts`), `isVod` (boolean), `views` (lifetime total, integer), `lastSeenAt` (Unix ms).
- `video_samples`: (`videoId`,`observedAt`) unique; `views` integer. Only actual observed totals; do not interpolate or backdate samples. Store at least 48 hours for HOT calculations.
- `stories`: `id` unique; `source` (`Reddit`/`Official`), `title`, `summary`, `url`, `publishedAt`, `lastVerifiedAt`, `subreddit` if Reddit, `score` nullable, `comments` nullable.
- `story_observations`: `storyId`, `listingSort` (`top`/`hot`), `listingUrl`, `observedAt` Unix ms, measured metrics if available. Only a valid direct listing observation qualifies a Reddit story; expire membership after 2h and publication at 48h.
- `channels`: `id`, `title`, `handle` (optional), `enabled` boolean, `lastCheckedAt` nullable. The owner manages it securely.
- `saved_items`: `id`, `kind`, `title`, `url`, `note`, `savedAt`, `ownerId`; always protect by owner/authorization.
- `scan_runs`: `id`, `provider`, `startedAt`, `finishedAt`, `status` (`complete`/`partial`/`error`/`not_configured`), `discoveredCount`, `error` (sanitized, never secret-containing).
- `settings`: explicit owned settings including selected source names; store credentials in a *secret manager*, not this table.

## Derived feed shape

```json
{
  "generatedAt": 0,
  "summary": {"eligibleVideos":0, "freshStories":0, "ideas":0, "lastScan":null},
  "popular": {"long":[], "shorts":[]},
  "hot": {"long":[], "shorts":[]},
  "stories": [],
  "contentCreation": {"items":[]},
  "saved": [],
  "channels": [],
  "scans": [],
  "sources": {"youtube":"not_configured", "reddit":"not_configured", "official":"not_configured"}
}
```

All timestamps are UTC Unix milliseconds. Server code, not browser code, enforces membership/authorization and time windows. For HOT, calculate `(lastObservedViews - firstObservedViews) / elapsedHours` using at least two **real** observations with positive elapsed time in the last 48h. Truncate negative growth to zero and label the sample interval. Popular uses `views` and **not** this growth calculation.

## Recommended API operations (adapt to native Sites runtime)

- `GET /api/feed`: public verified feed; do not return private notes to unauthenticated users.
- `GET /api/health`: safe readiness and provider statuses without secrets.
- `POST /api/save`, `DELETE /api/save/:id`: authorized owner-only mutations.
- `POST /api/scan`: owner-only manual trigger; prevent concurrent scans and rate-limit invocations.
- `GET /api/export`, `POST /api/import`: owner-only data portability, validation, and backup.

The paths match the local Node rebuild but **may need remapping** within Sites. Do not expose private APIs unauthenticated just to match the original route names.

## Quality and migration rules

- 48h eligibility uses `publishedAt`, never `lastSeenAt` as a stand-in.
- No source item without actual URL and confirmed publication timestamp.
- Do not trust client-submitted view or Reddit metrics as live unless their source observation is established.
- Deduplicate by stable source ID; updating one entry must not erase its saved note or prior real samples.
- For imports, separately validate source, URL, timestamps, ownership and evidence; do not silently mark legacy unverified content as new.
- No API key, OAuth token, database connection string or ADMIN_TOKEN in static HTML, public JSON, logs or Git history.
- The original ChatGPT Site's database is independent of this rebuild. An actual export/import is required for migration; creating this new site must NOT disable the old site's automations.
