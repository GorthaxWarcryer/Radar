# Azeroth Radar — hourly HOT migration for the ORIGINAL ChatGPT Site

**Not yet deployed.** This repository is NOT the original native Site. Do not migrate hosting or create a new database. Change the original Site's collector and published HOT calculation first, and update GitHub cron only once the Site accepts hourly operations.

## Correct HOT VPH model
- Single saved view-count observation: `estimatedVph = currentViews / ((observedAt - publishedAt)/3600000)`. Eg. published 1 hour ago, 6,000 views => estimated 6,000/h. Rank it immediately if >=5,000 views and uploaded within 24 hours. Label it **Estimated average since upload** — not a measured recent rate.
- Subsequent saved observations >=20 min apart: `measuredVph = (newViews - priorViews) / ((newObservedAt - priorObservedAt)/3600000)`. Eg. 6,000 at 1h -> 8,000 at 2h means measured 2,000/h; 16,000 at 3h means measured 8,000/h.
- Use real timestamps. For overnight gaps label the actual interval (e.g. **Measured average over 9h**), not **Last hour**.
- Keep >=5k, 24h publication age, no livestream VODs, existing English/no-Russian/channel filters. Do not fabricate view changes or overwrite real snapshots. Surface velocity type and last observed time. Rank by VPH separately for long-form and Shorts.

## Every-hour operation, 05:00 to 20:00 Europe/Kyiv
- Preserve the previously requested overnight pause; scan during all 16 daytime hours.
- Retain complete YouTube discovery/Popular scanning every three hours (05,08,11,14,17,20).
- On intervening hours, query *view counts only* for the existing 24-hour HOT candidate watchlist (including above-5k, near-threshold, and single-observation videos) with batched video listing, rather than repeating quota-expensive discovery searches.
- Add an idempotent, OIDC-authenticated `hot-hourly` operation to the original native Site `/api/refresh`, persisted checkpoints and deduplication by local hour, and allow reasonable delayed-run grace at 20:00.
- Only AFTER this native Site operation works, update `.github/workflows/azeroth-site-refresh.yml`: `cron: '53 4-19 * * *'` (7-min pretrigger), wait until intended slot, run full YouTube + Blizzard at 05,08,11,14,17,20; call `hot-hourly` on intermediate hours. Check real persisted snapshots after each job, no spurious green results.
- Preserve the existing canonical request host `azeroth-radar-petro.gorthax.chatgpt.site` and the separate legacy OIDC audience `azeroth-radar-petro.honestrhino21.chatgpt.site/api/refresh`; do not redirect the signed token.
- Keep paid AI disabled, zero additional hosting, original DB and original Site deployment.

## Validate
First-sample estimate, hourly measured updates, 5k threshold, 24h expiration, tiny/duplicate intervals, overnight, long/shorts display, API quota, OIDC, intermediate hourly slots, 20:00 delayed scan, Europe/Kyiv DST, real data readback. Only claim success after new Site deployment plus a successful non-3-hour HOT refresh and HOT feed changes.
