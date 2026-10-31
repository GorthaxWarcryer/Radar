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

## Optional on-demand paid AI

The model path is DISABLED by default and is never invoked by scanner jobs or normal browsing. To enable deliberately:

1. Configure the existing ADMIN_TOKEN in the Worker.
2. Store an OpenAI API key only as Worker secret OPENAI_API_KEY (never in frontend code).
3. Configure Worker binding AI_IDEAS_ENABLED to literal string true, and optionally OPENAI_MODEL (defaults to gpt-4.1-mini).
4. Owner unlocks the dashboard and explicitly clicks Develop with AI.

The authenticated /api/content/develop endpoint validates a current opportunity, sends a bounded set of source headlines/URLs (not invented transcripts) to a Chat Completions model, caps completion tokens, and caches each result in existing D1 settings for 24h. Each result includes 3 titles, 2 thumbnail texts, 3 optional angles and a verification note. Cached results cost no new model call. Usage is charged by the API provider for uncached requests, not by ordinary site refreshes.

To disable, set AI_IDEAS_ENABLED to false. The three free code-generated angles remain available.

## Trust and privacy

- Research records, notes and statuses are not included in unauthenticated feeds.
- Saving, changing status and AI generation require the owner ADMIN_TOKEN.
- API credentials stay server-side.
- Linked sources are research leads, not independently fact-checked gameplay claims.
- Never invent Reddit vote counts, YouTube growth data, timestamps or community consensus.
