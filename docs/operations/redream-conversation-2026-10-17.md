# ReDream conversation upgrade, 17 October 2026

Approved: improve existing Ask ReDream with minimal credit usage. Kota is a former signed player and is excluded from examples. No player data was changed.

Recent conversation is bounded to six messages and remains in memory only. Selected IDs resolve through the existing authorised context reader. Admin authority/deal evidence uses the existing service card with an explicit projection. Former-player archive markers remain distinct from recruitment; missing authority records remain unconfirmed. Evidence and uncertainties are expandable, with follow-up prompts and conversation reset on user/workspace/record changes. Questions and drafts remain read-only. No new dependency or migration was added.

Production backend v6 and staging v7 are ACTIVE with JWT verification and identical bundle SHA256 1a14d2737e10969a93df0042198910ed293b241527f2532b2da50f1222eff20d. The first frontend upload failed because it omitted the runtime dependency supabase/functions/_shared/football-data/player-data-workflow.ts. Include that file in all runtime manifests; lib/player-data-workflow.ts re-exports it. The failed deployment did not replace the serving frontend.

All 1,772 tests passed, including 18 endpoint tests. Typecheck passed. The browser regression script covers follow-ups, resets, safe links, retries and workspace changes but could not run because Chromium downloads failed. The cloud browser is signed out, so authenticated live model behaviour has not been reverified. No paid model calls were used for verification. GitHub source sync and merge remain pending until verified remotely.

This uses saved agent configuration through a scoped Responses API call, not a managed hosted agent session. Retrieval is bounded, not an exhaustive agency audit. Club recommendations must distinguish researched suggestions from actual interest and avoid invented probabilities. Recipient-facing drafts exclude internal private material and are never sent automatically.
