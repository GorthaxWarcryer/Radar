# Azeroth Radar — free-tier migration implementation

Date: 2026-10-31. New site: https://azeroth-radar.azeroth-radar-gorthax.workers.dev/

## Production verified

- Original Azeroth Radar theme only. Blackrock switch and styling removed.
- GitHub HOT remains under 24-hour age constraint; first observation clearly labeled estimated, later measurements are true interval growth.
- GitHub video catalog contains videos through 48h and YouTube API hourly snapshots; Cloudflare D1 imports catalog and saved observations.
- Live feed after deployment: HOT 36 long + 16 Shorts; Popular 80 long + 54 Shorts, including **82 uploads aged 24–48h**.
- Public video/channel search, 24/48h Popular window selector, list/large preview, total views/newest/velocity sorts.
- Official Blizzard news and blue-post discovery from verified source links, with 3 current Stories observed during live audit.
- Protected backend for private research statuses (New / Seen / Investigating / Planned / Published / Dismissed), bookmarks, notes, CSV export.
- Protected backend/UI for discovery search terms and followed channel IDs; GitHub discovery can read safe public configuration and track YouTube channel uploads.
- Protected hidden-video functionality and basic source diagnostics.
- Content Creation remains deterministic, with source URL, measurement disclosure, why-now, viewer payoff, recording checklist; no generative AI or transcription calls.
- Cloudflare Free Workers + D1 and GitHub Actions; no new paid API subscriptions or AI calls were enabled.

Verified deployment: https://github.com/GorthaxWarcryer/Radar/actions/runs/41209767482
Verified live acceptance: https://github.com/GorthaxWarcryer/Radar/actions/runs/41209909118

## Not complete — requires separate user authorization or unavailable original data

1. **Reddit**: No Reddit API collection enabled. An external app requires Reddit Data API approval and possibly commercial-use approval. Never bypass Reddit API restrictions or fabricate hot/top metrics.
2. **Owner-only ChatGPT Site data**: Old private bookmarks, statuses, settings, channel blocks and historical measurements are not automatically transferable from the public Site. The old Site remains untouched, and an authorized owner export is needed.
3. **Administration**: Private controls remain intentionally locked until a strong 32+-character `RADAR_ADMIN_TOKEN` is stored as a GitHub Actions repository secret and a new Cloudflare deployment applies it as the Worker `ADMIN_TOKEN` secret.
4. **Multi-user login/roles**: Not implemented; a single admin-token gated workspace is prepared. Do not claim collaborator login parity.
5. **Exact original React UI**: The Cloudflare site uses a simplified HTML/JS rebuilt interface, not a byte-for-byte native original Site export.
6. **Full English/Russian classifier**: YouTube’s official metadata, text checks and explicit language hints limit non-English/VOD inclusion, but language inference without an approved source or human review is not perfect.

## Keep costs at $0 for testing

- Do not enable paid Cloudflare add-ons or AI model calls.
- YouTube Data API searches and videos.list use the configured quota, not generative AI tokens; respect the account's free quota.
- Scheduled GitHub jobs collect YouTube during the previously agreed Kyiv daytime window, full discovery less frequently than HOT measurements.
- Keep any future Reddit source disabled until explicitly approved and configured.

## Admin enablement (optional, required before testing saves/settings)

Create `RADAR_ADMIN_TOKEN` in https://github.com/GorthaxWarcryer/Radar/settings/secrets/actions using a unique random value at least 32 characters. Keep it secret and remember it in your password manager. Rerun https://github.com/GorthaxWarcryer/Radar/actions/workflows/cloudflare-deploy.yml once. The GitHub deploy workflow passes it privately to `wrangler secret put ADMIN_TOKEN`. Afterwards use Settings → Unlock administrator on the site. Do not paste the token into chat, issues or commits.

## Regression and verification

- GitHub actions check Worker/D1 schema, JS parsing, authorized vs unauthorized API routes, estimated vs measured growth, real timestamps and 24/48-hour cutoff.
- Live acceptance checked homepage, original-only CSS/JS, D1 health, HOT, Popular older videos, Stories, public safe discovery config, and denied an anonymous mutation.
- Original ChatGPT Site left untouched.
