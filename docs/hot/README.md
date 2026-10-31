# Azeroth Radar — GitHub HOT companion

This is a **working GitHub-powered HOT view** that does not modify or overwrite the native ChatGPT Site.

- Runs automatically every daytime hour (05:17–20:17 Europe/Kyiv) via `github-hot-companion.yml`, subject to normal GitHub Actions scheduling delays
- Fetches only the original Site's **public** `/api/feed?view=dashboard` data
- Gives new 5,000+ view videos an estimated growth rate (total views / hours since upload **at the last genuine observation**)
- Uses measured view-count deltas and real intervals when the original feed publishes more than one genuine sample
- Excludes uploads outside the last 24 hours; separates regular videos and Shorts; shows timestamps to avoid implying stale data is live
- Stores rankings in [latest.json](latest.json), which is published by GitHub Actions; a ready-made dashboard lives in [index.html](index.html)
- Makes **no new YouTube API calls**, no ChatGPT Work requests, and no paid AI calls
- **Does not produce new real hourly view-count measurements:** the original Site's collector still refreshes the underlying data on its own schedule (currently every 3 hours)

## Use without enabling Pages

Open [GitHub Actions](https://github.com/GorthaxWarcryer/Radar/actions/workflows/github-hot-companion.yml), select the latest successful **GitHub HOT companion** run and read its **Summary** tab. Long-form and Shorts HOT rankings are listed there with video links, velocity type, and last-observed time.

## Optional graphical dashboard

GitHub Pages is currently **not enabled** in this repository. To enable it without using ChatGPT Sites or ChatGPT Work credits:

1. Open the repository's **Settings → Pages**
2. Under **Build and deployment**, choose **Deploy from a branch**
3. Select `main` and `/docs` and save
4. After Pages reports deployment, the dashboard should be at `https://gorthaxwarcryer.github.io/Radar/hot/`

This companion URL is **not** the original `*.chatgpt.site` URL. GitHub cannot replace or redirect that ChatGPT-controlled URL from repository code alone.

For **real new YouTube view-count snapshots every hour**, the GitHub workflow would need an independent authorized YouTube API credential (configured in GitHub Actions secrets), or the original Site backend would need to support hourly sampling. Do not repeatedly call the existing authenticated Site endpoint outside its approved scan schedule.
