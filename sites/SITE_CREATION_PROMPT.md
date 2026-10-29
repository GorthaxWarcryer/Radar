# New ChatGPT Site creation brief — Azeroth Radar

Use this **only in a new ChatGPT Work / @Sites creation conversation**. This file is a handoff specification, not an automatic Sites deployment and not proof of a supported GitHub import.

Build a **new ChatGPT Site** named **Azeroth Radar (Next)** as an interactive, responsive World of Warcraft content intelligence dashboard. Treat the provided repository `https://github.com/GorthaxWarcryer/Radar` and `sites/visual-reference.html` as a visual/behavioral reference only. This is a rebuild, NOT an authorized clone of the original site's data or native integrations.

## Boundaries
- Do not modify, overwrite, delete, or disconnect the old, working Site at `https://azeroth-radar-petro.honestrhino21.chatgpt.site/` (project `appgprj_6adf31dba8048191858382f0d4c97933`).
- Do not claim existing YouTube/Reddit credentials, database tables, history, watchlists, or scheduled tasks were transferred. Only migrate data through an actual authorized export and verified import.
- Use the ChatGPT Sites runtime's supported endpoints, managed database, secrets, scheduled operations, and deployment workflow. **Do not try to run the existing Node.js + local SQLite server unchanged** unless the runtime explicitly supports it. Keep server-side secrets server-side. Never expose API keys in browser code, URL parameters, static artifacts, or log output.
- Verify all functionality in a private preview; make the new site public only after successful checks and owner approval.

## Information architecture and visual rules
- Desktop: dark creator-intelligence dashboard with restrained golden accents, compact sidebar, clear metric hierarchy, accessible hover/focus states, responsive cards, and minimal clutter. Mobile: no horizontal overflow; accessible stacked cards and compact navigation.
- Section order: **HOT**, **Popular**, **Stories**, **Content Creation**, **Watchlist**, **Channels**, **Scan Activity**.
- Theme switcher: exactly **Default** and **Blackrock Depths**. Preserve the two visual treatments in `public/style.css`. Blackrock Depths: black stone, ember/gold accents, WoW dungeon-inspired atmosphere without substituting copyright assets. No Terran, Zerg, or Protoss themes, controls, assets, or styles. Unknown legacy theme preference => Default; Blackrock Depths preference persists.
- Present the difference between **total views** (Popular) and **observed change in views per hour** (HOT) explicitly. No fabricated statistics or unverified freshness.

## Video logic
- Separate **Long Form** / **Shorts** with visible segmented controls. Show side-by-side panels where space allows: **New uploads** (0–24h since published) and **Tracked 48 hours** (24–48h), collapsing on mobile.
- Minimum 5,000 *total* views; published in the last 48 hours; exclude archived livestream VODs; reject missing/unreliable timestamps. Popular sorted descending by lifetime viewCount. HOT sorted by **measured views gained per hour from at least two timestamped view-count observations**; do not use lifetime viewCount / age as a proxy. Display HOT empty state until measurements exist. Don't label a scan as successful if data collection failed.
- Videos display source title, channel, thumbnail where available, publication age, total views (Popular), measured velocity (HOT), and verified source link. A user can save a video to Watchlist with a note.

## Stories logic
- Sources: Reddit and official Blizzard/news posts only; omit YouTube Stories.
- Reddit: eligible posts must be actually observed in r/wowforever, r/classicwow, or r/wow **Top/Today** or **Hot** listing within two hours, and must be published within 48 hours. Store exact listing URL, sort, and observedAt; do not qualify via search hit alone. Exclude removed/deleted, memes, routine/low-effort questions, Russian-language content, or unknown publication dates. Mark unverifiable counts as unavailable. Up to 40 qualifying posts. Prefer WoW Forever.
- Official: only credible original official URLs; label "Official Source" blue, inline on mobile, with a <=600-character evidence-grounded summary. Never invent posts, dates, content or engagement numbers.

## Content Creation
- Rank up to 12 distinct evidence-backed topics using fresh content (48h). For each: summarize exactly what is known from the source; highlight uncertainty, creator angle, a concrete proposed title, priority, suitable format, 3–5 outline beats, preparation, and follow-up. Avoid pretending source metadata proves video contents. Give priority to creator-friendly WoW Forever angles, and avoid repackaging already-covered Esfand videos without an actual new angle.

## Data, integrations, safety
- Use native Site-managed persistence for videos, time-series samples, eligible stories, source evidence, saved notes, channel configuration, last scan/errors, and content briefs. Recommended logical structures: `videos`, `video_samples`, `stories`, `story_observations`, `official_posts`, `saved_items`, `channels`, `scan_runs`, `settings`. Field details are in `sites/DATA_CONTRACT.md`.
- Connect YouTube Data API v3 **only after** the owner adds `YOUTUBE_API_KEY` through the Site's protected secret settings. Never ask them to paste the key into chat. Track configured channel handles/IDs; make the list editable only to authorized owners. Respect quota and rate limits.
- Reddit API and official sources must use actual approved access or a source that meets the above verification rules. Report partial/failed scans honestly. An hourly scan must run through a supported Sites scheduled mechanism and must use its own authorized credentials; do not assume a visitor's connection is available to a background task.
- Watchlist data and any owner-only controls must have server-checked access restrictions, not just hidden buttons. Add backup/export and safe import only if supported. No public secret exposure.
- Distinguish illustrative preview content from real data with a prominent "PREVIEW / SAMPLE DATA" label. Never show demo metrics as if live.

## Acceptance before publish
1. Confirm both themes across desktop and mobile, including reload/persist and legacy-theme fallback.
2. Confirm navigation and HOT-first order, split sections, and functional filters.
3. Confirm Popular uses total views and HOT has genuine two-point samples only.
4. Verify 48h age rules, Reddit Top/Hot membership evidence, and official source links.
5. Confirm owner-only notes are private and persist after reload. Confirm no credential appears in browser network/HTML output.
6. Verify last scan and each provider status reflects real observations; test the scheduled refresh or explicitly document what is unsupported.
7. Check empty, loading, partial-error states. Ensure no invented source items or engagement metrics.
8. Save a reviewable version before publishing. Do NOT publish until the owner explicitly approves the preview.

## Materials
- Source and tests: `https://github.com/GorthaxWarcryer/Radar`
- Single-file visual reference: `sites/visual-reference.html` (illustrative, not connected)
- Logical model/API rules: `sites/DATA_CONTRACT.md`
- Deployment/transition checklist: `sites/LAUNCH_CHECKLIST.md`
