# Azeroth Radar — original Site vs Cloudflare migration gap audit

**2026-10-31 · Read-only research; production code unchanged.**

## Evidence and scope

- Live, public, unauthenticated comparison: [GitHub Action run 41207539102](https://github.com/GorthaxWarcryer/Radar/actions/runs/41207539102)
- Original public endpoint: https://azeroth-radar-petro.gorthax.chatgpt.site/api/feed?view=dashboard
- New public endpoint: https://azeroth-radar.azeroth-radar-gorthax.workers.dev/api/feed
- Historical original-source backup from October 29, 2026: app/page.tsx, app/api routes, components/theme-switcher.tsx, lib/scanner. This backup is **not guaranteed identical to the latest original deployment**.
- New live code: [public/app.js](public/app.js), [cloudflare/worker.mjs](cloudflare/worker.mjs), [cloudflare/transform.mjs](cloudflare/transform.mjs), [GitHub discovery](scripts/github-hot-discover.mjs) and [HOT scanner](scripts/github-hot-bridge.mjs).
- No authenticated original Site session was available. Original private saved data cannot be verified from the public API.

## Live API snapshot

| Metric | Original public Site | New Cloudflare |
|---|---:|---:|
| Tracked source videos | 463 | Not an equivalent raw source list |
| HOT long form | 18 | 33 |
| HOT Shorts | 16 | 17 |
| Popular new-window long form | 24 | 34 |
| All-tracked 48-hour Popular long form | 69 | No distinct 48-hour source pool |
| Stories | **18** | **0** |
| Verified blue posts in source column | **5** | **0** |
| Reddit posts in verified source column | 0 | 0 |
| Content Creation suggestions | 12 | 12 (different depth/logic) |

Counts reflect different discovery and ranking rules; they must **not** be interpreted as exact one-to-one content comparisons. Original API includes YouTube story-column data, but the owner previously requested removing YouTube Stories from the Stories UI. Do not restore that merely because it exists in the API.

## P0 — restore before relying on the new site as a complete replacement

**P0-1. Full 48-hour Popular tracking.** Original keeps videos in Popular through 48h while HOT requires uploads in the last 24h. Cloudflare currently imports the 24h HOT JSON as its primary video database. Its Tracked · 48 Hours panel therefore lacks a genuine older-video source pool. Add independently stored 48h candidate records, actual source timestamps and total-view rankings. Verify: an eligible video leaves HOT at 24h but stays in Popular until 48h; works for Shorts and long videos.

**P0-2. Blizzard blue-post/official Stories ingestion.** Original shows 18 Stories, including five verified blue-post entries. Cloudflare has none and no scheduled official-source collector. Add direct, source-verified Blizzard news/forum posts with original timestamps, canonical links, 48h expiry and mirror deduplication. Verify the UI shows true Official Source indicators without invented engagement metrics.

**P0-3. Metadata-driven YouTube discovery parity.** Current GitHub discovery has three fixed search queries and requires a Warcraft phrase in a video's title. Original supported followed/official channels, WoW topic/description evidence, stricter language checks and broadcast/format verification. New discovery can miss legitimate WoW videos with generic titles and can misclassify formats. Implement configurable queries, channel following, verified topic evidence, English-only and Russian filtering, real format detection, and livestream/VOD exclusion under the current API quota budget.

**P0-4. Original private data protection.** Original supports saved videos, research notes, statuses, followed/blocked channels and settings; none has been migrated. The public original feed returning zero saved videos does not mean the owner's private data is empty. Preserve the original Site and prepare owner-authorized export and tested import/backup before cutover.

## P1 — functional migration

| Feature | Older original implementation | New Cloudflare state | Needed |
|---|---|---|---|
| Research lifecycle | New, Seen, Investigating, Planned, Published, Dismissed; notes; topic grouping | Basic bookmark/note only | D1 status model, filters and editing |
| Content Creation | Why Now, angle, viewer payoff, recording plan, source trails, bounded audience/comment evidence | 12 simpler deterministic suggestions | Evidence-backed briefs and multi-source grouping, with **no paid AI by default** |
| Channels | Follow/remove/unblock, mark Official Source, hide video, block channel | Read-only Channels page | Safe owner controls integrated with discovery |
| Owner login | ChatGPT owner identity and protected actions | One admin token, no user roles | Secure admin/user authorization and future researcher accounts |
| Settings | API/Reddit status, queries, language rules and connection management | No Settings page | Usable admin settings; secret values stay server-side |
| Scan Activity | Provider health, staleness, diagnostics, errors and manual scan | Simplified; manually syncing GitHub JSON does not run YouTube discovery | Honest per-provider statuses, scheduler freshness, quota and errors |
| Reddit Stories | Top/Today/Hot evidence and connection setup | No real collector; both snapshots had zero verified Reddit rows | Only approved API/Devvit-based ingestion, with pending/unavailable state |
| Saved research | Private Watchlist, notes, statuses and CSV | Unmigrated token-gated bookmarks, JSON export | Secure persistent workspaces and CSV export |

## P2 — UI / advanced metrics

- **Themes:** Original offered Original, Terran, Blackrock Depths, Zerg, Protoss. New offers Default and BRD.
- **Filters:** Original had video/channel search, filters, watchlist sorting, separate 24h/48h window selection, and status-based story search. New retains Long/Shorts and List/Preview but omits several controls.
- **Advanced signals:** Original had acceleration, bounded measured gain and channel breakout vs historic baselines. New is mostly view counts and views/hour.
- **Editorial story design:** Original grouped related coverage with direct source links, source evidence and contextual Help. New Stories cards are simpler and currently empty.
- **Visual parity:** New static HTML/CSS is not the original React UI. Pixel-level screenshot comparisons were not performed.

## Improvements to preserve

- Keep **initial HOT estimated VPH**, explicitly labeled, and switch to genuine measured VPH once enough real snapshots exist. This was a requested improvement over the old first-observation wait.
- Keep hourly YouTube measurement on GitHub during the Kyiv 05:00–20:00 daytime window, without paid ChatGPT Sites work.
- Keep a 5,000-view ranking threshold, English-only / Russian exclusion, no archived or ongoing livestreams, and separate Shorts/long form.
- Never invent timestamps, Reddit votes, growth rates or official-source verification.
- Do **not** automatically add YouTube videos back to Stories or enable paid AI/transcription processing.

## Recommended sequence

1. 48h Popular candidate pipeline and improved discovery/format filtering.
2. Official Blizzard Stories; then legally approved Reddit Stories.
3. Topic grouping, evidence-based Content Creation and research status workflow.
4. Admin authentication, real Channels/Settings controls and scan diagnostics.
5. Themes, filters, CSV and UX parity.
6. Owner-authorized original private data import and reconciliation; **only then** consider retiring the original Site.

## Confidence limits

The original source backup is older than today's native deployed Site, and the live probes were unauthenticated. Private owner-only features and pixel-level differences are not fully verified. Prioritize the live API evidence over archive assumptions.
