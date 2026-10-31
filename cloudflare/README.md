# Azeroth Radar — Cloudflare Worker + D1

This is a new Cloudflare deployment of the **standalone GitHub rebuild**, **not a byte-for-byte export** of the original ChatGPT Site. Do not delete or redirect the original ChatGPT Site yet. The public dashboard is currently backed by the GitHub HOT collector and a NEW D1 database; old private original-Site data is NOT migrated.

Cloudflare now recommends Workers with static assets for new full-stack apps. One Worker serves `public/` files, API endpoints under `/api/*`, and a bound D1 database. The GitHub HOT workflow remains unchanged, owns the YouTube API secret, and updates `docs/hot/latest.json` hourly. Cloudflare reads that public file, stores genuine snapshots in D1, and serves HOT/Popular without using ChatGPT Site credits for the new website.

## Required one-time Cloudflare account connection

1. Sign in to [Cloudflare](https://dash.cloudflare.com/) and select its Free plan. GitHub is already connected to this repository, but Cloudflare account access is **not connected** to this chat. No Cloudflare deployment exists until you authorize it.
2. Generate a narrowly scoped Cloudflare API token (Workers Scripts Edit, Workers KV/D1 Edit for the account; prefer Cloudflare's built-in Git integration if possible), and put it directly in the GitHub repository secret **`CLOUDFLARE_API_TOKEN`**, without posting it in chat or source. Add **`CLOUDFLARE_ACCOUNT_ID`** as a GitHub repository variable. The workflow is manual-only until those are set.
3. Open the [Cloudflare deploy workflow](https://github.com/GorthaxWarcryer/Radar/actions/workflows/cloudflare-deploy.yml), run it on `main`. It provisions resources through Wrangler (including the D1 binding), applies the schema, and publishes the app. Review Cloudflare's dashboard for the assigned `*.workers.dev` URL.
4. Set a strong server-side **`ADMIN_TOKEN`** secret for the Worker using Cloudflare Workers → your Worker → Settings → Variables and Secrets. Do not put it in `wrangler.jsonc` or GitHub code. Until set, administrative writes are deliberately disabled; public content remains usable.
5. Check `/api/health`, `/api/feed`, HOT/Popular/Stories, layout, mobile view, and private saves. HOT data is separate from the original Site; reddit/official Stories need authoritative ingestion and the new database starts empty until imported.

## Data and operation

- An hourly Worker cron attempts to read the GitHub HOT public JSON and upsert videos/samples into D1. It uses GitHub's actual sample timestamps, not refresh time. It cannot invent measurements.
- Public GET `/api/feed` also reads the latest GitHub public HOT JSON as a fallback while D1 is being populated. Saved notes and private admin endpoints use D1.
- `GET /api/health` exposes synchronization status. `POST /api/scan` with `X-Admin-Token` performs a safe one-shot sync of the public GitHub feed; it does not run fresh YouTube scans.
- `POST /api/import` and `GET /api/export` accept/retrieve authorized structured user data for a future migration. Import is bounded and validates basic fields. No original user data is silently transferred.
- This backend currently implements **single-administrator authorization**, not a multi-user login system. Future collaborative research requires separate per-user authentication/authorization work.
- The GitHub frontend rebuild may not match original Site version 63 visually or functionally. Verify before treating it as a full replacement.

## Local tests

`node --test cloudflare/tests/*.test.mjs`

## Free tier / protection

Cloudflare free quotas apply. D1 is persistent, but request, database usage, CPU and storage limits still apply. Do not enable extra paid features to deploy this project. Changes to GitHub cannot deploy without the Cloudflare account credentials you configure; publishing is opt-in.
