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
- One model inference may run per daytime slot: 05, 08, 11, 14, 17 and 20 Kyiv time (the Worker cron currently starts at minute 26). At 08 Kyiv, it generates the daily editorial digest instead of a topic brief.
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


## Creator Intelligence v2 (October 31, 2026)

- **Emerging:** Separate view of early 250–4,999-view uploads younger than 12 hours, ranked by time-adjusted velocity. This is experimental and does not alter the 5,000-view threshold for HOT or Popular. Initial rates are labeled estimated.
- **Richer source metadata:** The independent YouTube scanner retains short public descriptions, tags, likes and comment counts through the GitHub bridge to Cloudflare. Existing fields continue to work if metadata is absent.
- **More precise class topics:** Explicit spec terms (e.g. Holy Paladin versus generic Paladin changes) are separated by deterministic classification. Classification remains metadata-based, not full transcript semantics.
- **Thirty-day topic history:** D1 records daily aggregate opportunity scores. Cards compare a current score with the prior day when a prior observation exists, labeling rising / steady / cooling / new. No private user data is included.
- **Content-gap research prompts:** Each opportunity has candidate questions to investigate. These are NOT claims that any competitor video omitted material; no automatic video transcript analysis or Reddit comment scraping is performed.
- **Daily Editorial Brief:** A new navigation section summarizes live priority topics, official news snippets with source links and early signals. At the 08:26 Kyiv morning research slot, one Cloudflare AI call can generate headline and editorial priorities if data is available.
- **On-device creator preferences:** Choose WoW version and topics under Settings. The Content Opportunities "For You" view ranks relevant topics first. "Useful" and "Not relevant" feedback is stored in localStorage in the same browser, without analytics or server account creation.
- **Richer creative briefs:** The existing AI generation returns three title angles and two thumbnail concepts; when provided, it now also includes an opening hook, viewer payoff and a research question grounded in source metadata.
- **AI budget:** Morning daily digest and other creative briefs share the same atomic D1 six-attempt UTC-day quota, with one inference at each of the six scheduled Kyiv-time slots. Only scheduled jobs run inference. No OpenAI API, ChatGPT credits, or model calls on page visits. AI failures revert to source-linked deterministic content.

All AI outputs are research aids, not verified facts. The source titles and descriptions are untrusted data, never privileged instructions. Full competitor video understanding, multiuser account support, YouTube Analytics OAuth, and transcript-based coverage comparison are not implemented: those require consent, permission and substantial additional source integration.
