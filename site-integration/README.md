# Azeroth Radar ORIGINAL Site: reliable source evidence package

These modules are **integration-ready reference logic, not live Site code**. The original Site's runtime/database and authenticated endpoints are not accessible to this personal chat. This directory does not change the production scheduler or its data.

## Goal

Keep YouTube unattended collection as-is in version 63. Improve source quality for Reddit and official Blizzard news; later use verified evidence as the input for manually activated Content Creation. Default LLM calls: **zero**. Default paid model budget: **$0**.

## Reddit

The existing Site reports Reddit coverage via Devvit, but cross-community coverage of r/wowforever, r/classicwow and r/wow requires checking the actual installed app's authorized scope. Reddit's official FAQ says Devvit apps live inside Reddit and external apps need separately approved Data API access. Do not scrape or bypass access restrictions.

Use authorized Hot and Top/day listing responses, recording per-post `listingEvidence` with the source listing URL and real observation time. Filter original publication <48 hours, English only, skip memes, deleted and removed posts. Top24 only for exact publication times <24 hours. HOT requires two actual page/API score observations separated by at least five minutes; no inferred score/age growth. Unknown/rounded/hidden scores stay null. Persist prior qualified posts until their *own* validity expires; a blocked fetch must not forge new evidence.

## Blizzard

Do not depend exclusively on Wowhead. Discover candidate announcements from the public World of Warcraft official news pages and authenticated/accessible official forum endpoints. Trackers (e.g. Wowhead, bluetracker index) are **hints only**, never proof of an official statement or of the original publication date. Require a verified original Blizzard `worldofwarcraft.blizzard.com` or `news.blizzard.com` news URL, or a verified Blizzard author on official WoW forums. Use the original English author's timestamp, not tracker crawl time. Deduplicate news/US/EU mirrors by original identity where possible. Do not treat edits or refreshed indexes as freshly published items.

## Integration

- Adapt `sources.mjs` into the original Site's existing repository under its runtime conventions; avoid a second database, new hosting or conflicting scheduler.
- Map original Site's current Reddit Devvit post payload (or approved Data API payload) to `validateRedditPost`.
- Map official Blizzard news/forum fetch results to `validateBlizzardPost`; authorship verification must be implemented in the fetch adapter, not assumed from the URL.
- Only validated batch items may reach `/api/reddit/search`, `/api/blueposts/search`, or the existing persisted source tables; confirm real endpoint schemas before integrating.
- Configure all network read operations with explicit timeouts, retry-after/backoff, limited pages, and source-specific logs. Never dump tokens or HTML in logs.
- Keep collection-source status separate (`complete`, `partial`, `unavailable`, `error`) and do not display a red global scan warning for one blocked news source.
- Add evidence-backed candidates to Content Creation only when original source dates <48h, without making AI calls. Existing paid agents remain disabled.
- Do not allow an empty or partial fetch to erase otherwise valid saved data; expire only according to source publication age and listing evidence validity.
- Validate URL allowlists; strip tracking parameters; reject userinfo and redirects off allowlisted domains.
- Test against live sources in an authorized environment, then save a recovery version, run regression suite and deploy to the original Site.

## Testing

`node --test site-integration/tests/sources.test.mjs`

Pure unit tests require no Site credentials, paid API calls, network access, or Work credits.

## Reference

- https://developers.reddit.com/docs/guides/faq
- https://developers.reddit.com/docs/api/public-api/classes/RedditClient
- https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data
- https://worldofwarcraft.blizzard.com/en-us/news
