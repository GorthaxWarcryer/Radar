# Scanner reliability fix for the ORIGINAL ChatGPT Site

**Scope:** This document specifies changes for the live Site project
`appgprj_6adf31dba8048191858382f0d4c97933`.
The standalone Node implementation in this repository is NOT the source of the
live ChatGPT Site and publishing this repository does not update the live Site.

The running website currently reports repeated `Scan time budget reached;
remaining work is queued` partial results. This suggests a bounded scan worker
is exceeding its time budget, but the actual root cause must be confirmed using
Site worker logs. Its linked hourly ChatGPT automation already polls
`/api/scan/status` and is configured to respect busy/cooldown responses.

## Minimal live-site repair

1. **Do not migrate, clear, or rewrite existing records, saved notes, API
   credentials, settings, tracked video lists, or scan history.** Back up the
   project database and capture current settings before schema changes.
2. Keep the existing `POST /api/scan` and `GET /api/scan/status` contract.
   Return running plus scan ID promptly. Polling should not consume worker time.
3. Persist a stable scan job ID, lease expiry, retry count, scan cursors,
   pending video IDs, and observed video snapshot timestamps. Resume jobs that
   exceed their time budget. Treat an expired lease as interrupted, not complete.
4. Discovery: make a small, configurable number of channel/list-page calls
   per slice; enqueue eligible recently published uploads and leave the cursor
   after the last channel/list page successfully attempted. A failure should
   not cause all progress to be discarded or repeatedly block subsequent
   channels. Preserve 48-hour English-only and VOD exclusion rules.
5. Measurements: process queued `videos.list` IDs in batches of 50 or fewer.
   Update retained view samples independently of discovery; do not infer HOT
   growth from view totals or single samples. Deduplicate IDs and persist after
   each batch. Never mark a batch complete before its data is committed.
6. When budget is nearly exhausted, checkpoint and return `progress` or
   `partial` with remaining count, not a fatal error. Cap retries/backoff and
   avoid unbounded recursive retry loops. Do not run overlapping manual and
   scheduled workers.
7. Scan Activity should differentiate **running**, **in progress**, **partial
   due to errors**, **interrupted/recovering**, and **completed**. Show the last
   successful full discovery and last successful progress timestamps separately.
   A partial but progressing queue is not automatically an outage; stale
   discovery still warrants warning if the cursor does not complete within the
   expected service window.
8. Keep Reddit, official Blizzard sources, content plans, saved research
   states, hourly refresh, and credentials unchanged except where their work
   must be independently bounded to keep it from starving YouTube. Never
   report success based only on a scan being accepted or running.
9. Verify after deployment: start one scan, observe a busy response for a
   second attempt, confirm the next slice picks up at the checkpoint, verify
   two samples produce genuine HOT growth, deliberately simulate a provider
   timeout and worker restart, confirm no duplicates or data loss, and verify
   other source refreshes continue. Compare Scan Activity status with actual
   database scan rows and provider timestamps.

## Portable implementation for a future separate deployment

The independent Node rebuild implements this pattern in `src/incremental.mjs`,
`src/db.mjs`, `src/providers.mjs`, and `server.mjs`. It is a reference, not a
copy/paste patch to the original Site's managed runtime and schema.
