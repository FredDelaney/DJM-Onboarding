# Sourced player-details review: backend checkpoint

**NOT READY for deployment.** Branch `codex/redream-player-details-review`, stacked on PR 258. Backend contracts exist and are tested; the complete frontend and Home path is still required. No migration, worker, frontend or production change has been deployed from this branch.

## Reused contracts

The existing preparation research only returned transient fill-the-blanks values; no player-facing decision workflow consumed the existing `player_source_suggestions` table. This increment reuses that table and `player_source_refreshes`, rather than adding another queue or canonical record.

Allowed fields: current club, competition, country, season, position, Transfermarkt/statistics links, date of birth, nationalities, height, preferred foot, contract status and expiry. Names are identity guards rather than automatically renameable fields. Model output must name surfaced supporting URLs for each field; unrelated or invented citations are discarded. Dates must be explicit and complete. Contract terms are never inferred from a season or guessed June expiry. Height/foot and refresh mode/capability values follow the actual installed constraints. Research uses `preview` / `reference_only`, not an invented provider capability.

One claimed request per player prevents duplicate paid research; exact request retries do not dispatch again. Model fetch AND response-body parsing have a 25-second deadline. A claim abandoned for 60 seconds reads as failed/recoverable; late results cannot create a proposal and a new request can recover. The same claim becomes the review ledger. Pending and repeated rejected evidence do not rewrite canonical facts.

Decisions can accept, correct or keep the recorded value for individual fields, with the rest pending. The server locks the canonical player, compares recorded field/identity baselines, validates typed allowlisted values again at application, and applies one football patch. A conflict rolls back the whole decision batch. Original suggested values/sources are retained; a manual correction has separate applied-value/decision metadata and the trusted actor. Exact retries create no duplicate decision audit. Both source acceptance and verification remain separate from tasks and publication.

Active canonical agency membership plus the existing player edit assignment governs ordinary agent/operations access. Owners/admins remain agency-scoped. A global DJM team row is not required. Scouts, non-editors, ended/suspended memberships, archived targets and foreign tenants are denied. Browser roles cannot read or mutate this workflow through old global-admin policies; a forged flag cannot evade the parent-aware trigger. No platform schema/table or private helper grants are added. Service-only public RPCs call owner-only helpers; the access helper is an invoker. Trigger definer scope is required to detect a protected parent hidden by caller RLS.

## Local validation

Final `npm test` passes 2,068/2,068, with zero failures/skips. Final `npm run typecheck` passes all projects. Eighteen real PostgreSQL cases exercise actual canonical protection/unpublication bodies, source immutability, mixed and partial decisions, repeat safety, whole-batch conflict rollback, role/tenant/edit denial, forged browser writes, source/date/type bounds, request concurrency/expiry and an independent canonical operator without a legacy global team row. AI tests check field-specific surfaced evidence, complete dates and a stalled response body. HTTP tests exercise trusted actor/baseline/source selection, read-only status, request reuse, failed-claim recovery, immutable preparation decisions and lost-response retries. Synthetic provider results do not prove a live model/provider or real independent-agency acceptance.

`npm run check` passed 2,066 tests plus all TypeScript projects, the unchanged frontend production build and bundle limits (workspace gzip 144,058 / 150,000). Later additions are the preparation retry and canonical-operator tests, plus the exact current profile-guard fixture; final tests/typecheck below cover those changes. No frontend source or dependency changed in this checkpoint.

The test guard bodies match actual staging: player protector MD5 `8213b8db19de8ed3b9a5565f9902ba0c`, public-profile protector `892f6bbd5a84852275ca2224c2048357`, unpublisher `f315879e91167ce5139142abcdb194a9`. The older profile-guard fixture lacked the already deployed publication-snapshot mode; the new suite uses the actual matching writer-era body. The proposed migration guards these three bodies and does not replace them. Staging has no new details-review RPC and its seven original-player hash remains `6e9392dc6b3dc877bfb90c47aeedbb93`.

## Proposed release manifest: held until UI acceptance

- Only `20261024142123_approval_first_player_details_review_v1.sql`, source SHA-256 `571bb95786e54b7a2797d33825eb2d87daf346191705ed3d6db4993d5950431f`. No replay, backfill, canonical data rewrite or excluded relationship-person migration. Adds a partial lookup index, guarded refresh/suggestion triggers, restrictive browser policies, private value/access helpers and four service-only request/stage/status/decision entrypoints. Existing schema/constraints/guards are preserved.
- `agency-os/index.ts` plus its same existing eight-file dependency bundle, including `_shared/player-context-ai.ts`; preserve JWT. No statistics/public-profile worker or schedule/configuration change.
- Matching frontend, still to be implemented and verified. The current preparation frontend does not yet send `review_id`, so do not deploy this backend independently.

Current staging remains PR 258 product `0920c1ee864400cdf2a2a98c1c46853016c0bcc2`, deployment `dpl_987PXR5ziBgJAY3VX4xXUJ3N75KF`, agency-os 59, statistics worker 14 and public worker 9. PR 258 exact documentation head `02a1e0a6ce93f4c4f7715fe7862b46db69a32a87` passes verify/full browser CI on run `40101618810`. No merge or programme production release is implied.

## Required next work

1. Extend the EXISTING preparation form to retain the saved review ID, correctly edit dates/nationalities/height, pass its request UUID, and recover uncertain writes by status. Remove or replace its obsolete unprojected confidence percentage. Confirm the actual persisted result before continuing draft generation.
2. Add the persistent field-comparison/recovery path within the existing profile data experience, including explicit individual decisions, safe batch review, source links, partial/resolved/failed/permission states, preserved correction drafts and assigned-editor presentation. Keep private profile and verification/publication controls restricted.
3. Feed pending details into the existing quiet personal Home group with a direct tenant-preserving anchor. Reuse relevance, bounds and admission contracts; no task tick may accept details or verify/publish a player. Verify effects on an older pending statistics proposal after a club/season change; preserve evidence and allow an explicit stale-suggestion decision.
4. Run affected responsive browser/role/HTTP/PostgreSQL tests and final required checks, then inspect exact-head CI. Only afterwards preflight/apply the exact migration to staging, deploy the matching agency-os/frontend and verify an isolated labelled fixture through Home, field decisions, canonical verification, Calendar/source context and public denial. Clean exact QA dependencies, preserve audits/original hashes and compare advisors/source bundles.
5. Keep live ordinary-staff, actual provider, physical iPhone/Safari and real independent-agency gates explicit. PLY-03, TELL-05 and all remaining programme/UI items remain open according to the tracker.
