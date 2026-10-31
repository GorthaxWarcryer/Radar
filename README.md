# Azeroth Radar — GitHub + Cloudflare migration

**Status (October 31, 2026):** GitHub's independently scheduled YouTube discovery and hourly HOT view-count scanner are working. The Cloudflare Worker + D1 implementation is committed, passes tests and Wrangler dry-run, but **has not been deployed** because this conversation does not have an authenticated Cloudflare connection.

For the free Cloudflare deployment, follow [cloudflare/README.md](cloudflare/README.md) and run [cloudflare-deploy.yml](.github/workflows/cloudflare-deploy.yml) after adding the scoped Cloudflare account credentials to GitHub Secrets. This is a standalone rebuild of the front-end/backend, **not an export of the original ChatGPT Site**, so source parity, original user accounts and private data have not been migrated.

The intended chain is: **YouTube Data API → GitHub independent discovery + hourly HOT snapshots → GitHub public JSON → Cloudflare Worker (static frontend + D1) → web browser**. The GitHub collector no longer requires ChatGPT Sites for its discovery to function. Blizzard/Reddit source integrations still need separate approved data collection, and the new D1 database begins empty.

---


A **standalone, deployment-ready, editable source-code rebuild** of the original ChatGPT Sites Azeroth Radar project. Designed around the decisions made in the previous development conversations.

> **Important:** This is not an export of the original Site. The native Sites source, private databases, credentials, saved content, and Site-hosted jobs are not available in this conversation. This project starts with a new local SQLite database. It does **not** modify, replace, migrate, or turn off the original website. Do not point a production domain to it until the feeds and data have been verified.

## Included

- HOT and Popular, each with **Long Form / Shorts**, **List / Preview**, and **New uploads / Tracked 48 hours**.
- Popular ranks by **lifetime total views**. HOT ranks by **measured views gained/hour** from two or more real samples; it never substitutes views or views/age for actual measurements.
- Min **5,000 total views**, videos must be <48 hours old, archived livestreams excluded.
- Stories include verified Reddit Top/Today or Hot listings plus imported official posts/blue posts; no YouTube Stories; stale stories automatically expire.
- Content Creation provides evidence-linked starter briefs (source, title, proposed angle, five beats) instead of inventing source claims.
- Watchlist bookmarks and editable notes persist in SQLite; Channels and Scan Activity screens.
- **Default** and **Blackrock Depths** themes only; legacy theme values (Terran/Zerg/Protoss) fall back to Default.
- Desktop/mobile responsive design, accessible navigation, and demo preview explicitly labeled as illustrative.
- Node.js 22+, built-in SQLite, and **zero npm dependencies**. Both frontend and backend are editable.

## ChatGPT Sites handoff (preferred free hosting)

This repository includes a **new-site handoff kit** in `sites/`. Start with `sites/SITE_CREATION_PROMPT.md`, reference `sites/visual-reference.html`, and use `sites/DATA_CONTRACT.md` for the server/database behavior. The HTML reference is **illustrative** and does not connect to live data. ChatGPT Sites requires its own Work/@Sites creation workflow; this code repository cannot silently publish, import the original Site database, or bypass Codex usage. Run `npm run sites:reference` to regenerate the single-file preview.

The original ChatGPT Site is still active and remains independent. There is no reason to move it, pay for Render, or deactivate its scanner to create a new site.

## Optional deploy to Render

The bundle includes a production `Dockerfile`, `render.yaml` Blueprint, `.dockerignore`, a configurable persistent database path, and API smoke tests. See **[DEPLOY.md](DEPLOY.md)** for the Render deployment guide, persistent disk and secret setup. A live public URL requires connecting a hosting account; the files alone do not create a hosted site.

## Run locally

1. Install Node.js 22 or newer.
2. Open a terminal inside this folder.
3. Copy `.env.example` to `.env` and update values as applicable.
4. Run `npm start`. Open `http://127.0.0.1:4173` in your browser.
5. Click **Preview demo** to inspect example cards and theme behavior. Demo numbers are illustrative; live mode is empty until feeds are configured or imported.

Run `npm test` and `npm run check` to verify logic and syntax. `npm run dev` restarts the server when source files change. `data/azeroth.sqlite` is automatically created and persists across restarts.

## Connect YouTube

Set `YOUTUBE_API_KEY` and `YOUTUBE_CHANNELS` (comma-separated YouTube `UC...` channel IDs or `@handles`) in `.env`, then restart the server and click **Scan now** in Scan Activity. It reads the uploads playlists and video statistics using YouTube Data API v3. It does not require reusing original ChatGPT Sites credentials, and it does not write anything to the original Site.

Every scan persists view samples. **HOT remains empty until at least two scans** of the same eligible video exist, ideally separated by an hour. Archived livestream VODs are excluded by YouTube metadata when detectable. Short/long classification uses the 180-second duration heuristic; some edge cases may need refinement.

## Connect Reddit

If you have approved Reddit API access, set `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, and a truthful `REDDIT_USER_AGENT`. The scanner uses OAuth app credentials to read `top?t=day` and `hot` listings for `wowforever,classicwow,wow` (change `REDDIT_SUBREDDITS` as desired). It will not invent post scores, use generic search results to establish listing eligibility, or show unverified old posts. **Reddit API permission and rate limits are the operator's responsibility.** API requests may fail without approved access.

## Official posts and blue posts

Set `OFFICIAL_POSTS_JSON_URL` to an HTTPS endpoint serving `{ "posts": [{ "id": "1", "title": "...", "url": "https://...", "summary": "...", "publishedAt": "2026-10-29T12:00:00Z" }] }`, or import official posts through the import endpoint. Only <48-hour posts are shown. This is an adapter, **not a verified live connection to Blizzard forums**.

## Import existing data safely

If you export the original site's authorized feed/database content, convert it to the following JSON shape and import it into this rebuild:

```json
{
  "videos": [{"id":"video-id", "title":"Title", "channelName":"Channel", "publishedAt":1793275200000, "views":11000, "kind":"long", "isVod":false, "url":"https://www.youtube.com/watch?v=video-id"}],
  "reddit": [{"id":"reddit:post-id", "title":"Title", "publishedAt":1793275200000, "score":60, "comments":12, "source":"Reddit", "subreddit":"wow", "sort":"top", "listingUrl":"https://www.reddit.com/r/wow/top/?t=day", "observedAt":1793277000000, "url":"https://www.reddit.com/r/wow/comments/..."}],
  "official": [{"id":"official:post-id", "title":"Title", "publishedAt":1793275200000, "summary":"Summary", "url":"https://news.blizzard.com/..."}],
  "saved": [{"id":"video-id", "kind":"video", "title":"Title", "url":"https://...", "note":"Research later"}]
}
```

Send it to `POST /api/import` as `application/json`. This imports provided content into the **new** local database, not the original Site. Reddit imports without fresh Top/Today or Hot listing evidence (observed within two hours) are rejected rather than treated as verified Stories. If the source site doesn't offer an authorized export, an identical transfer cannot be promised. The API also supports `GET /api/export` to back up rebuilt data.

## Publishing and security

- For local use, bind to `127.0.0.1` (default). Mutating endpoints are permitted locally.
- Before deploying publicly, **set a strong `ADMIN_TOKEN` and use HTTPS**. Never expose `.env`, your YouTube key, Reddit secret, or SQLite data files as static assets. The server refuses to bind externally without an admin token.
- Admin actions use the `X-Admin-Token` header. The frontend prompts on a protected action, keeps the token only in temporary tab memory, and does not write it to localStorage. Private watchlist entries and notes are omitted from unauthenticated public feed responses.
- A production deployment needs persistent disk storage and a long-running Node process for the hourly scanner; ephemeral/serverless hosts will not preserve SQLite or run cron reliably.
- Test responsive layouts, live data sources, and persistence on your chosen host before routing visitors there.

## Where to edit

| Goal | File |
| --- | --- |
| Layout/sections/cards and interactions | `public/app.js` |
| Default + Blackrock Depths styling | `public/style.css` |
| Main HTML shell | `public/index.html` |
| Video ranking, Reddit eligibility, ideas | `src/core.mjs` |
| YouTube/Reddit/official adapters | `src/providers.mjs` |
| SQLite tables and state | `src/db.mjs` |
| Routes, scanning and scheduler | `server.mjs` |
| Regression tests | `tests/core.test.mjs` |

**Future workflow:** Keep this folder or ZIP available in the conversation. Ask for targeted changes and I can update the relevant source files and return a new ZIP. Without a native Sites editing tool, changes made here will still need to be run/deployed on a host that serves this project.

## Scanner resilience (v0.5)

The **standalone rebuild** now runs bounded YouTube discovery slices, saves its
channel cursor and pending video IDs in SQLite, samples tracked video views
independently, and rotates Reddit listing checks. Manual scans return a job ID
immediately. An authenticated `GET /api/scan/status` returns the running or
terminal result. Only one scanner executes at once, and the next slice resumes
without erasing pending items. Health and Scan Activity report progress
separately from genuine provider errors. Tune with `SCAN_BUDGET_MS`,
`YOUTUBE_CHANNELS_PER_SCAN`, and `YOUTUBE_VIDEOS_PER_SCAN`.

**This does not change the already hosted ChatGPT Sites website.** The
Sites-managed backend requires the tailored patch in
`sites/LIVE_SCANNER_PATCH_SPEC.md` using its original code, tools, and database.
