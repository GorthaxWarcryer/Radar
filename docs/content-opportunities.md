# Content Opportunities · Azeroth Radar

Replaces the old generic title template with a no-cost, evidence-linked creative research workflow.

## Free/default operation

- YouTube eligibility is unchanged: not a VOD, at least 5,000 total views, and published in the last 48 hours. Recent eligible official/Reddit Stories can also supply topics.
- Headlines are grouped by recognized subject (e.g. Paladin, racials, raid tiers, professions) while preserving original links.
- Opportunity scores: freshness (18), reach (16), views/hour (24), independent origins (21), official-source presence (12), real Reddit comment engagement when available (9). The theoretical maximum is 100.
- A score is NOT factual confidence or a prediction of YouTube performance. Inferred view velocity is separately labeled at the source.
- Three category-sensitive video angles are generated without AI or background inference costs.
- Headline-only grouping is not semantic understanding and may occasionally group multiple related changes or split a topic. Check every original link before recording.
- Up to 12 highest-ranked groups appear. Owner-dismissed opportunities are hidden in authenticated sessions by default.

## Save, research, plan, dismiss

`Save opportunity` creates a record in the pre-existing Cloudflare D1 saved table. Owners can assign New, Seen, Investigating, Planned, Published or Dismissed using the existing research-status table. Notes and CSV are available in Watchlist. Dismissal first saves the topic before updating status so it stays dismissed in future scans. No new database or migration required.

## Fully automatic Cloudflare Workers AI (no ChatGPT credits)

The site uses Cloudflare's built-in AI binding, not a ChatGPT personal conversation, paid OpenAI API, Gemini account, Codex or Work credits.

- Model: @cf/meta/llama-3.2-3b-instruct, a free-tier-compatible small text model.
- The model runs only from the scheduled Cloudflare Worker event, after existing daytime YouTube source syncing. Visitors and dashboard refreshes never trigger inference.
- On each hourly scheduled run, up to two new source-linked opportunities receive automatic creative briefs.
- Maximum six AI inference attempts per UTC day, enforced by atomic, durable D1 counters (including failed requests). This per-application limit avoids burst traffic, although it cannot account for other Cloudflare projects using the same account.
- D1 caches AI output by topic and source signature for up to 48h, so identical topics don't request AI again on subsequent scans.
- Each brief includes three titles, thumbnail text, creative angles and a verification note. It is shown inline on the Content Opportunities card.
- The existing code-generated three angles always remain available when AI is disabled, the model errors, returns invalid data, the daily cap is exhausted or no new topic requires generation.
- The prior paid /api/content/develop endpoint and paid OpenAI deployment secrets have been removed.
- Set Worker secret FREE_AI_DISABLED to string true to disable automatic AI immediately if needed. The AI binding can remain configured without generating requests.

Cloudflare documents 10,000 daily no-cost neurons on its Workers Free plan; inference fails when the free quota is exceeded. Workers Paid can charge for account usage above that allocation. This code controls only Azeroth Radar's own inferences and cannot guarantee zero Cloudflare bills if another project consumes quota or the account is on a paid plan. To strictly avoid any Cloudflare AI overage charges, retain the Workers Free plan (or enforce a provider-side spend limit where available), and review the Cloudflare AI usage dashboard.

The prompt only contains bounded metadata and original source headlines, not scraped transcripts. Creative suggestions are research ideas, not verified facts.

## Trust and privacy

- Research records, notes and statuses are not included in unauthenticated feeds.
- Saving, changing status and AI generation require the owner ADMIN_TOKEN.
- API credentials stay server-side.
- Linked sources are research leads, not independently fact-checked gameplay claims.
- Never invent Reddit vote counts, YouTube growth data, timestamps or community consensus.
