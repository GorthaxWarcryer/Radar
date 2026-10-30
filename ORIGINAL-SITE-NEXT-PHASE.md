# Azeroth Radar original Site — Reddit + Blizzard source integration

## Verified status

- Original ChatGPT Site v63's automatic YouTube scanner has been verified to collect and save batches unattended. Leave its scheduler unchanged.
- GitHub Actions repository is used for the original Site's scheduler, but **does not contain the original native Site backend**. This package is source-validation logic plus an integration contract, not a live Site patch.
- Devvit is not a substitute for approved external Data API access to unrelated subreddits. Do not imply native Top/Hot access without actual permissions.
- Public Blizzard official news pages and forum source URLs can ground original publication and authorship. A tracker update is not necessarily a new announcement.

## Phase A: Reddit (approval-dependent)
1. Audit existing Devvit permissions, installed subreddit and authorized accessible listing methods; record coverage separately for r/wowforever, r/classicwow, r/wow.
2. If the approved access returns genuine Top/day and Hot listings, attach each membership proof with actual observation time and exact subreddit listing URL.
3. Do not add posts from cached search results as Top/Hot without proof. Preserve existing data on partial errors, respect 48h publication and 2h evidence windows.
4. Collect exact score/comment observations where available; HOT uses two observed counts. No inferred vote growth, no language translation, no hidden-count zeroes.
5. On insufficient permissions, display `Reddit: access pending/limited` and continue YouTube/Blizzard without fake or empty "complete" status.

## Phase B: Blizzard (no LLM needed)
1. Query only supported, read-only original Blizzard English news/forum endpoints, with bounded requests, ETag/Last-Modified where available, and exponential backoff.
2. Trackers like Wowhead/bluetracker index are optional discovery hints, never factual primary sources.
3. For each candidate follow the **original** source, confirm verified Blizzard author, original publication timestamp and English language. Prefer exact links to individual forum replies when applicable.
4. Use `validateBlizzardPost()` to filter sources, deduplicate by original permalink and retain only original 48h publication age.
5. Save to the original Site's existing blue-post storage/ingestion API using its real verified contract. Do not inject tracker data into production without native integration tests.
6. Keep existing published blue posts until their original 48h expiry; do not wipe on blocked source.

## Phase C: Content Creation
1. Use `editorialCandidates()` to provide source-backed options for a creator/editor with links to originals, not fabricated text/metrics.
2. Deduplicate same topic across YouTube, Reddit and Blizzard while maintaining all evidence/source IDs.
3. Keep the original agent model simulation only and paid API budget $0. Manual activation requires explicit consent.
4. Log coverage and why each candidate is eligible or excluded, without another scheduled ChatGPT automation.

## Acceptance tests in the native Site
- Genuine authorized Reddit Hot/Top listing samples populate qualifying posts; blocked communities remain `partial`/`unavailable`.
- Original Blizzard news and verified forum post with correct UTC publication time appear once; tracker mirrors do not multiply records.
- Old amended announcements and old threads are not presented as new.
- Empty/error fetches preserve still-eligible saved work, never fabricate engagement.
- Zero paid AI model calls and no additional Work/Codex automation usage.
- No changes to the existing YouTube scheduled workflow, data binding, credentials, 48h/5k/VOD filters, or original Site URL.
