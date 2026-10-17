# ReDream questions, 17 October 2026

## Current release

Tell ReDream has an **Ask a question** option in both its sheet and full page. The live endpoint retrieves the saved OpenAI ReDream agent configuration on each question, then answers from authorised agency records and optional public research. Answers distinguish recorded information, public evidence and missing information, show source links and offer a next action. Questions do not create captures or update agency records. Voice and typed updates retain their review and approval flow.

Production `redream-agent` v5 and staging v6 are ACTIVE with JWT verification. Their identical bundle hash is `d641d483fdd5aefc2ff84a97984dd3be94b54f9364847d378caa17c9b0918d34`. A production source readback matches both submitted files exactly. The frontend remains the previously verified Vercel release `dpl_EAzrKgxh2B8qQbYDGQ5kejtFSLNW`, assigned to `app.djmsports.com`. No frontend redeployment was needed for the final backend corrections.

## Saved OpenAI configuration

The saved agent is `agent_edd2cf2599d3452e94e74c6e22dce7935f1a5c93d3d54eb098`, project `proj_7SHUdup16llWEbPwNEMNOEOb`. Dashboard sign-in and inspection confirmed `gpt-6.1-sol`, High reasoning, Medium verbosity and live web search. Subagents, functions and external integrations are disabled. No saved-agent settings were changed.

The server reuses the saved instructions, model, reasoning, verbosity and web-search settings in a scoped Responses API request using the existing server-side key. The application enforces its read-only and structured-answer contract. Inaccessible saved configuration produces a clear error, with no silent fallback. `REDREAM_OPENAI_AGENT_ID` can override the inspected default ID.

This uses the saved configuration, not the managed Agents runtime, hosted sandbox or earlier dashboard session `sess_0b1b44d77e96c490006ad37c9996508195a9753d042b541ec8`. No database credential is passed to the model or hosted agent. Responses use `store: false`.

## Retrieval and privacy

The first real task question exposed PGRST106 because the original handler accessed private `djm_os` tables through PostgREST. The first promotion was rolled back while correcting it. The final handler uses `platform_server_redream_agent_context` from the additive `20261017173500_redream_agent_context.sql` migration. No private schema was added to the exposed API schemas.

The reader is service-only and validates active staff membership for the requested tenant. It uses explicit field allowlists, checks player assignments, reserves commercial records and relationship history for administrators, and filters tasks by tenant and owner. The handler also applies the established restricted player projection and task-owner filter. Browser roles cannot invoke the reader or its private projection helper. Archived records and completed/cancelled/archived tasks are excluded. Results are bounded. Legacy staging interaction tables without `player_id` are supported.

Other verified protections:

- An explicit inaccessible workspace returns 403 rather than falling back to another membership.
- Retrieval errors stop the answer instead of presenting partial evidence as complete agency memory.
- Natural requests such as “Check Dylan Gardiner” retain the player name when constructing searches. Possessive endings and leading request verbs no longer prevent a match.
- Citations used in the answer take priority over other search results in the public-source list.
- Public URLs accept HTTP(S) only. Internal links require a known record kind and valid UUID.
- Account/workspace changes discard old results. Failed questions retain their text for retry.

## Verification

- All 1,767 tests pass, including 13 endpoint tests and eight database-context checks (the parent test plus seven scenarios).
- Regressions were demonstrated failing before correction for inaccessible private schemas, legacy schema differences, natural name searches and citation priority.
- Database checks cover tenant membership, assignment, private fields, commercial access, task ownership, lifecycle, result bounds and browser-role denial. Equivalent production and staging smoke checks confirm the reader returns the expected shapes and denies browser roles.
- Final typecheck, no-em-dash and diff checks pass. The earlier frontend release passed production build, bundle budget, real React question/retry/source checks at 320, 390, 768 and 1440 pixels, and existing capture lazy-loading/focus checks.
- A real signed-in production question returned a player record, recorded career evidence, owned follow-ups and an internal record link. The answer flagged duplicated season rows rather than adding their statistics together.
- The final combined public research question returned the stored player record, conversation summaries and relevant owned follow-ups alongside inline official source links. It distinguished recorded contract information and reported claims from current public evidence. The public-source list began with the three official pages cited in the answer. Internal player, club and contact links were present. No records were changed.
- The production unauthenticated endpoint returns 401. No synthetic data or record changes were needed for the signed-in checks.

## Source and remaining access

The frontend was restored on the complete production source at local commit `1346bab`, preserving the already-live contact, photo, CV, Home and workspace changes. The runtime manifest contains 392 files, fingerprint `097a59ce2ed3833db86ec173be8378ac36552864f3c173aec1f17dc1ac0391ed`. Do not deploy older GitHub main over this complete release.

Local branch: `codex/redream-agent-release-20261017`. Implementation commits include `580c4cc`, `ae848d8`, `207d7b4` and `06ecc71`.

Jesse explicitly approved pushing the completed release branch to `FredDelaney/DJM-Onboarding` on 17 October 2026 at 19:35 Europe/Rome. This supersedes the earlier automatic-approval block for that exact transfer. No further permission question is needed for this branch/repository sync.

The authorised terminal push then failed because no GitHub credentials are configured. The connected GitHub branch-creation call returned 403, `Resource not accessible by integration`. OpenAI's current GitHub app documentation confirms that the ChatGPT connection is read-only; do not suggest changing its ChatGPT permission mode as a fix for provider authentication. Repository metadata reports the repository is public and the connected user has push permissions, which do not confer write access on the read-only integration. The Mac was checked again and remained Offline in Remote Desktop Commander. Continue through an authenticated Git environment when available. The live OpenAI/Supabase connection does not depend on this source-sync step.

Signed-in desktop browser verification is complete for the question flow; a real iPhone check remains outside these tests.
