# Azeroth Radar — hourly YouTube API for GitHub HOT

The GitHub companion is **separate from the original ChatGPT Site**, uses the original Site's public discovery feed, and does **not** overwrite the original Site's code, database or HOT ranking.

## Connect YouTube Data API v3 (one-time setup)

1. Open [Google Cloud console](https://console.cloud.google.com/apis/library/youtube.googleapis.com), choose/create a project and enable **YouTube Data API v3**.
2. Open [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials), choose **Create credentials → API key**. Under **API restrictions**, restrict the key to **YouTube Data API v3**. GitHub-hosted runners do not have a fixed outbound IP, so a static IP restriction is generally unsuitable. Keep the key private.
3. Open [this repository's Actions secrets](https://github.com/GorthaxWarcryer/Radar/settings/secrets/actions) → **New repository secret**. Set the name to **`YOUTUBE_API_KEY`** and enter the key value in GitHub's secret form. **Do not send the key in chat, issues, commits, or public code.**
4. Open [GitHub HOT companion workflow](https://github.com/GorthaxWarcryer/Radar/actions/workflows/github-hot-companion.yml), choose **Run workflow**, and select the default branch `main`.
5. Verify a green run in the Summary with `youtubeApi.status = connected`, positive `observations`, and a positive API request count. A green run with `missing-key` only means ranking succeeded using existing Site data; it **does not** mean the API is connected.

## How it works

- Every day from **05:17 through 20:17 Europe/Kyiv**, GitHub requests updated statistics using the YouTube Data API `videos.list?part=statistics&id=...` endpoint. GitHub's cron timing can be delayed.
- It polls videos already discovered by the original Site, published in the preceding 24 hours, including videos below 5,000 views so they can enter HOT after passing the threshold.
- It batches **up to 50 video IDs per API request**, capped at **500 videos per hourly run** and 10 requests per run, with no new YouTube search requests.
- It saves genuine timestamped view counts in [latest.json](latest.json) with a rolling observation history and re-ranks HOT. Newly observed videos can appear immediately using `views ÷ age since upload`, labeled *Estimated since upload*. Subsequent observations separated by at least 20 minutes use real differences, labeled *Measured*.
- The native Site's full discovery and Popular scan continues on its previous 3-hour schedule. Therefore, GitHub cannot see entirely new videos **until the Site discovers them**.
- GitHub's workflow only reads the Site's **public** feed. It does not need ChatGPT Site editing credits or the Site's private YouTube API key.
- No paid AI models or new hosting services are required.

## Verify and view

- [GitHub HOT workflow and run summaries](https://github.com/GorthaxWarcryer/Radar/actions/workflows/github-hot-companion.yml)
- [Saved latest JSON HOT feed](latest.json)
- [Static dashboard source](index.html)

### Optional GitHub Pages dashboard

GitHub Pages is currently not enabled in the repository. To enable it, open GitHub repository **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/docs`, then Save. When deployment completes, the companion should be available at:

`https://gorthaxwarcryer.github.io/Radar/hot/`

This is not the original ChatGPT Site address; GitHub cannot change the original Site's UI from a repository push.

## Quota / security

Google documents `videos.list` as **1 quota unit per request**. For 100–150 tracked videos, the hourly poll normally takes 2–3 calls, or approximately 32–48 units over 16 daytime hours, excluding other API usage. At the hard cap, 10 requests per hour means 160 units/day for this workflow. Quota availability and costs depend on the Google Cloud project. See [YouTube docs](https://developers.google.com/youtube/data/reference/rest/v3/videos/list).

The key is passed only as a private GitHub Actions secret in the workflow environment. Requests are made directly from the GitHub runner to Google's API. Never put it in `docs/hot/latest.json` or in the dashboard.

If the key is absent, GitHub emits `missing-key` and continues read-only ranking without claiming fresh API observations. If YouTube responds with an error or incomplete batch, the script fails safely and does not publish an apparently successful partial refresh.
