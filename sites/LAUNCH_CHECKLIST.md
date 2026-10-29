# New Sites launch checklist

## Already prepared outside ChatGPT Sites
- [x] Editable source in `GorthaxWarcryer/Radar`.
- [x] HOT-first navigation; Popular total views; separate Long Form/Shorts and publication-age panels.
- [x] Default + Blackrock Depths themes only.
- [x] One-file illustrative visual reference, not connected to live feeds.
- [x] Local Node/SQLite behavior and regression tests.

## Must happen inside the native Sites creation workflow
- [ ] Start a **new** Work / @Sites creation chat and attach/reference `SITE_CREATION_PROMPT.md`, `visual-reference.html`, and `DATA_CONTRACT.md`.
- [ ] Verify native runtime compatibility, managed storage, server secrets and scheduled operations; replace unsupported Node/SQLite primitives appropriately.
- [ ] Inspect a private visual preview on desktop and mobile.
- [ ] Test empty feed and all two theme variants without demo/live confusion.
- [ ] Add YouTube Data API key in **Sites secrets** (not chat), then configure channel IDs/handles.
- [ ] Add Reddit approved credentials through Sites secrets or document limited/unavailable coverage; verify direct Top/Today or Hot listing membership.
- [ ] Add official source adapter with verified time and URL data.
- [ ] Prove at least two real YouTube samples generate HOT and total views remain correct in Popular.
- [ ] Confirm a scheduled refresh actually persists scan histories and reports failures.
- [ ] Check authorization on bookmarks/notes, backups and owner-only scans.
- [ ] Verify privacy/share settings and quota. Publish only after explicit owner approval.

## Original site safety
- Keep `https://azeroth-radar-petro.honestrhino21.chatgpt.site/` active as reference and fallback.
- Keep its existing hourly automation enabled until new-site refresh works and the owner elects to switch.
- Do not copy credentials or personal notes into public GitHub; only use authorized exports, securely.
- The new Site receives a new URL and managed database; URL continuity and data migration are not automatic.
