# ReDream questions, 17 October 2026

Jesse requested continuing the OpenAI agent work from the earlier chat. The saved ReDream Brain v1 backend was recovered from staging `redream-agent` v2. The frontend checkout from that chat was unavailable. Its question interface was restored within the current Tell ReDream flow, based on the complete production release at local commit `1346bab`, preserving the contact, photo, CV, Home and workspace changes already live.

## Behaviour

Tell ReDream now has an **Ask a question** option in both its sheet and full page. Questions call a read-only endpoint with the selected workspace and record context. Answers distinguish internal records and public research, show public source links and internal record links, and offer a next action. Questions do not create captures or modify agency records. Voice and typed updates retain the existing review, approval and save path.

The endpoint uses the existing server-side OpenAI connection with `gpt-6.1-sol`, High reasoning and optional web search through the Responses API. It does **not** connect, change or reuse the separate saved OpenAI Agents API dashboard session `sess_0b1b44d77e96c490006ad37c9996508195a9753d042b541ec8`. No database credential was given to that hosted agent.

## Review corrections

- Explicit inaccessible workspaces return 403 rather than falling back to a sole membership.
- Assigned staff receive the established football-only player projection; contract, commercial and private next-action fields remain excluded.
- Non-admin club and contact retrieval omits relationship history. Search remains authorised through the existing tenant/user search RPC.
- Personal tasks are filtered by tenant and owner. Commercial opportunities and deals remain admin-only.
- Incomplete model responses fail clearly. Public sources include both tool sources and actual URL citation annotations.
- Account/workspace changes discard old results. Failed questions retain their text for retry. Public URLs are restricted to HTTP(S), and internal links require a recognised record type and valid UUID.

## Verification

- 1,752 unit/database tests passed with zero failures.
- Six endpoint tests exercise real handler code against controlled database/OpenAI boundaries. Workspace fallback, restricted fields, relationship history, incomplete responses and citation extraction were demonstrated failing before correction.
- Real React browser checks passed for questions, context, inline/public sources, unsafe-link rejection, retry, workspace switching and layouts at 320, 390, 768 and 1440 pixels. The missing question control was demonstrated failing before implementation.
- Existing capture lazy-loading, opening, closing and focus recovery checks passed.
- Final typecheck, no-em-dash guard, production build, bundle budget and diff checks passed. Local builds use dummy public backend settings; the deployment uses the project's existing production environment.
- Staging backend v3 deployed successfully with JWT verification, and an unauthenticated request returned 401. Production backend v1 deployed with identical bundle hash `10787b359304d60c131cc6823e1cb76ce314ca7b27ce7433f5c01fb72ede13f6` and JWT verification.

## Release and limits

The runtime source manifest contains 392 files, fingerprint `097a59ce2ed3833db86ec173be8378ac36552864f3c173aec1f17dc1ac0391ed`. The production target is the existing `djm-player` Vercel project and `app.djmsports.com` domain. Production deployment results and live smoke checks are recorded after release.

Browser tests use synthetic records. A signed-in question against real DJM records and a real iPhone has not been exercised. GitHub branch creation still returns 403, Resource not accessible by integration; the Mac is offline in Remote Desktop Commander. Preserve this complete local release branch, and do not deploy the older GitHub main over the current production source.
