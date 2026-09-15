# ReDream AI transition and staging handoff

## Outcome and scope

ReDream is the platform. DJM Sports Management remains an agency tenant. Capture is the neutral customer-facing name for ReDream AI.

This work is repository-only, on `saas/tell-djm-tenant-context`, based on `origin/saas/tenant-foundation` at `a6257822f67ec2df9b77764610424a6b00b56bb2`. The original dirty checkout was preserved; implementation is in `/private/tmp/redream-tell-tenant-context`. No production or staging database, customer records, deployment, merge or remote infrastructure names were changed. Live deployment state was not inspected and must not be inferred from the migrations in this branch.

The final scope follows the request to prioritise essential security, capture functionality and compatibility while conserving usage. Remaining non-AI infrastructure naming is explicitly deferred below.

## Rename map

| Previous source/API | Canonical source/API | Compatibility |
| --- | --- | --- |
| DjmTellDjmLauncher | AiLauncher | Old module re-exports canonical component |
| TellDjmCapture / FullPage / RecentCaptures | AiCapture / AiFullPage / AiRecentCaptures | Old modules re-export canonical components |
| DjmOsShell / DjmWorkspaceHeader | AgencyShell / WorkspaceHeader | Thin source aliases |
| DjmGlobalSearch / DjmQuickCapture | WorkspaceSearch / QuickCapture | Thin source aliases |
| lib/djm-os | lib/platform-client | Old exports delegate; platformRpc/platformInvoke canonical |
| lib/djm-context | lib/entity-context | Old exports delegate |
| lib/djm-performance | lib/operation-performance | Canonical event plus temporary legacy diagnostic event |
| lib/tell-djm-offline | lib/ai-offline | Old exports delegate, physical browser database retained |
| lib/tell-workspace | lib/ai-workspace | AiWorkspaceContext and canonical hook |
| _shared/djm-ai-router | _shared/ai-router | Old task/type/helper aliases and environment fallback |
| public.djm_tell_* | public.redream_ai_* | Forward migration moves implementation and recreates invoker aliases |
| djm-tell-capture / djm-tell-process | redream-ai-capture / redream-ai-process | Both entrypoints import the same handler |
| /tell capture links | /workspace/:slug/capture | Old capture links resolve authorised stored tenant before redirect |

The canonical SQL migration excludes the retired user-primary resolver/vocabulary APIs; current workers use capture-bound resolver/vocabulary APIs. Worker functions remain service-only. Existing non-AI `agency-os` is already a neutral tenant-aware API and remains unchanged.

Package metadata, README, architecture overview, current shared app/player/staff UI and AI errors now distinguish agency work from platform identity. The reviewed presentation changes are recorded in `redream-copy-migration.json` (342 initial literal changes, with editorial corrections). They do not rename customer records or historical SQL.

### Intentionally retained names

- DJM branding/assets and slug checks in Brand, metadata and manifest identify the actual DJM tenant.
- DJM's existing privacy notice remains DJM-specific and is shown only for its resolved tenant. Other tenants get their agency privacy contact, not relabelled DJM legal terms. Each external pilot needs its own approved notice.
- The `djm_os` schema, existing table/column names, `djm_internal` visibility, source fingerprints, idempotency keys and deployed non-AI APIs are data/API contracts.
- Historical migrations, staging bootstrap, old deployment payloads and historical tests/docs retain their original identifiers.
- CSS selectors/stylesheets and the legacy route group remain internal styling/route compatibility; canonical components do not duplicate their implementation.
- `djm-network-captures` remains a private deployed bucket. Existing objects and source_uri values are not moved.
- `tell_djm_v1` processing version and `tell_djm_plan` payload key stay unchanged. A naming-only version bump would create worker rollout risk without changing semantics.
- Legacy IndexedDB/localStorage names, RPC aliases, source module aliases, diagnostic event, cron header and DJM_AI_* environment fallback support rolling deployment.
- Hosting project/repository/domain identifiers and provider user-agent contracts were not renamed.

## Tenant architecture

1. The client records AiWorkspaceContext: requested workspace slug, origin route and runtime origin. Explicit `/workspace/:slug` takes precedence; `/agency` and custom domains use the resolved runtime. An unresolved agency route fails closed.
2. A slug is untrusted routing context. Each RPC carries its own `x-redream-workspace` header; shared Supabase client headers are never mutated. Audio/text upload carries the saved workspace slug in its form.
3. The server resolves the slug using platform.tenants and existing active staff membership checks. Raw UUIDs cannot select a tenant. Legacy calls without context use the existing unambiguous/primary membership rule.
4. Capture tenant is persisted at creation and becomes authoritative. Receipt/history/retry/questions/undo/delete additionally require the requested workspace and tenant-specific enabled permission. Permission rows are keyed by tenant and user.
5. Workers use capture ID and stored tenant for vocabulary, entity resolution, budget, permission and usage accounting. A later primary membership change cannot move a capture.
6. Supplied player/person/contact/organisation/prospect/opportunity/need/task/interaction references are validated against capture tenant. Nested question candidates and aliases are validated too. Mismatches fail closed.
7. AI writes explicitly carry capture tenant. Triggered club-need matching is also filtered to that tenant. Scoring methodology was not changed.
8. Restrictive RLS adds workspace/permission boundaries without relaxing existing permissive policies. Authenticated clients cannot invoke privileged worker APIs.

## Offline and recovery

Pending records save immutable origin context with the recording. Reconnecting in another workspace uploads using that saved origin. A cross-workspace upload does not replace the current workspace's displayed receipt. Failed uploads remain queued.

Existing IndexedDB version 1 is reused, preserving old audio blobs. Old records infer an explicit saved workspace route when present; legacy records with no origin retain legacy server routing. Their missing original tenant cannot be reconstructed from data never recorded.

Active capture records retain workspace context. Canonical and legacy localStorage lists are merged and written together for older app versions, retaining the existing 20-entry/seven-day recovery window. Unknown legacy entries resolve through a server-authorised capture lookup. Failed recovery does not remove the entry. Already-scoped entries cannot be moved by remembering them from another workspace.

New notification URLs carry workspace slug and capture ID. Old `/tell?capture=...` links resolve the stored tenant before opening history. Explicit conflicting workspace context is denied. Signed-out capture links preserve their route through sign-in; the return path only accepts local capture routes. Authentication is not tenant authority: the subsequent RPC still validates membership.

## Storage, usage and value

New audio path: `<tenant-id>/<user-id>/tell/<date>/<capture-file>` inside the existing private bucket. The server supplies tenant ID after membership validation. Old audio URIs remain readable; retention recognises both layouts.

The existing central usage path now reads tenant from the capture. It records model, status, token counts, latency and estimated cost in platform.ai_usage_events, using existing idempotency keys. Database tests execute the real worker-plan and central ledger functions and prove canonical/legacy retries produce one Northstar row even when DJM is selected. Actual hosted gateway/worker delivery still needs staging verification.

Activation now requires a completed capture with a same-tenant applied action, target ID and application timestamp. A transcript alone, or an undone action, does not count. The existing adoption milestone key is retained for API compatibility. This records operational value, not talent or preparation scoring.

## Performance and mobile

No new global state system, model calls or polling frequency was added. Permission lookup is per workspace; launcher route context and permission requests run independently. Offline recovery resolves only entries missing origin, in parallel. Existing receipt polling and 60-second visible-page offline retry remain. Canonical RPC wrappers add one local SQL delegation only for old callers. Current callers go directly to canonical functions.

Existing mobile recording controls, safe-area padding, dynamic viewport sizing, internal scrolling and recording/navigation guards remain. Capture is now mounted in the agency workspace. No authenticated mobile browser, real microphone, flaky-network or hosted latency benchmark was performed. Those are canary checks, not claimed results.

## Validation

- `npm run check`: 419 tests, 419 passed, 0 failed; TypeScript passed; Next.js production build passed.
- 31 real embedded PostgreSQL tests cover dual membership, tenant permission differences, foreign history/receipt/retry/question/undo/delete denial, raw UUID denial, nested entity/alias validation, capture-bound vocabulary/resolution, one-tap entity creation, unlinked writes, scouting writes, matcher isolation, revoked membership, worker grants, legacy wrappers, link recovery, activation evidence and successful central AI ledger writes.
- Offline tests cover saved origin, older records, custom-domain/runtime routing, active-record immutability, legacy storage recovery and upload request construction.
- Compatibility tests cover shared Edge handlers, neutral core UI, conditional DJM branding, old persistence/processing, and safe return/deep-link paths.
- `git diff --check`: passed. Historical migration files were not edited.

Limits: PGlite executes PostgreSQL with a focused structure-only fixture, not a complete Supabase deployment. The full activation/adoption migration now compiles and its endpoints execute in the fixture. Supporting platform tables are minimal and unrelated player-portal activity is explicitly stubbed, so hosted integration still requires staging validation. No real customer data, Supabase Auth gateway, storage gateway, Edge runtime or external model was involved in local tests.

## Rollout prerequisites and remaining work

### Before Northstar staging canary

An authorised operator must verify the target staging migration history, take the usual staging backup and apply these forward migrations in order:

1. `20260915192303_tell_capture_workspace_boundary.sql`
2. `20260915194224_redream_ai_canonical_api.sql`
3. `20260915194621_redream_ai_activation_evidence.sql`

Deploy both canonical Edge entrypoints and the legacy entrypoints containing shared handlers, then this frontend. Retain old functions and existing cron scheduling during the transition. Verify worker secret/JWT configuration and private bucket policies. REDREAM_AI_* environment names take precedence; existing DJM_AI_* values remain accepted. Do not run divergent old/new worker implementations. Validate the full migration chain and full activation/adoption functions in staging before exposing the UI.

### Before an external agency pilot

Complete the authenticated canary below, including real phone recording, offline upload, sign-in recovery, private storage and tenant-level billing telemetry. Supply the agency's approved privacy notice. The follow-up removes legacy customer-facing Edge wording from network import/capture, player data refresh/provider explanations, player voice messages and club-pitch responses. Calendar presentation is neutral and supports REDREAM_APP_URL while preserving stable event UIDs and the existing deployed fallback. Existing historical SQL routines outside the capture domain still contain legacy explanatory text and need a separate forward-only copy migration. Do not claim that every legacy database-generated surface is fully white-label yet.

### Later

Remove compatibility aliases only after old clients, cron jobs and deployed environments are proven migrated. Consider renaming physical schema/buckets, hosting projects and non-AI APIs in separate coordinated migrations. Measure real p50/p95 capture latency and worker failure costs before changing polling or model routing. Keep historical records intact.

## Exact manual Northstar canary

1. Use synthetic staging data and a staff account with DJM and Northstar memberships. Make DJM primary. Enable Northstar Capture with the intended permission. Include Northstar player Elias Novak and a distinct DJM fixture; record starting row counts.
2. Open `/workspace/northstar`, then Capture. Confirm agency branding, neutral labels, visible typing/recording controls and usable phone layout.
3. Submit: **Spoke with Elias Novak. He prefers to play from the left and would consider moving if the sporting project gives him regular minutes.**
4. Check capture.tenant_id = Northstar. Review resolver candidates, source text and exact receipt actions. Only Northstar Elias may resolve. Confirm every written action/target/claim/event has Northstar tenant and source provenance. Verify DJM counts/data are unchanged.
5. Open Northstar recent captures; reload and reopen the receipt. Switch to DJM: this capture must not appear. Attempt receipt/retry/question/undo/delete against its ID while requesting DJM; expect denial.
6. Create two synthetic Northstar candidates with an ambiguous name. Submit an ambiguous note. Expect a clarification question; answer with the correct Northstar candidate. Submit a DJM candidate ID manually; expect denial and no writes.
7. Test explicit foreign IDs for player, contact/person, club/organisation, need, prospect, opportunity, task and interaction, including nested candidates. Test a raw tenant UUID as workspace. Expect denial.
8. Test one-tap new club/contact creation and an unlinked task/interaction. Verify Northstar ownership of all records and related events.
9. On a phone, go offline in Northstar, record and save, then navigate to DJM before reconnecting. Verify upload remains Northstar, pending audio clears only after durable acknowledgement, and the DJM screen does not show its receipt. Repeat across browser restart and a denied/revoked upload.
10. Open a new workspace notification and an old `/tell?capture=...` bookmark. Both must resolve the capture's authorised tenant. Repeat signed out, then sign in. A conflicting explicit workspace must not silently switch tenants.
11. Retry a partially failed capture, answer a question, undo an action and delete a disposable capture. Check exact receipt state, tenant ownership and no duplicate writes. Confirm an old DJM capture, old stored plan and historical audio URI still work through legacy RPC/Edge names.
12. Check platform.ai_usage_events for Northstar model, tokens, latency, estimated cost, outcome and timestamp. Retry through legacy/canonical paths and verify idempotency. Check tenant-filtered logs.
13. Verify the meaningful AI milestone changes only after an applied target action. A transcript-only capture must not activate it; undoing its only applied action removes that evidence. Confirm full adoption/activation endpoints render normally.
14. Repeat `/agency` on a resolved synthetic custom domain. Confirm correct branding, workspace, receipt links, mobile safe areas and recovery. Record end-to-end latency and any errors; do not mark the canary passed without evidence.

## Follow-up verification

The legacy Deno router wrapper now imports `./ai-router.ts` explicitly. Extensionless imports could fail in the Edge runtime even though the Next.js build accepts them. Regression coverage checks this compatibility path.

The activation migration explicitly revokes anonymous/authenticated execution and grants both platform endpoints to service_role, including on fresh installations. The database tests execute both complete endpoints, verify meaningful AI evidence changes, and assert their grants. No deployed migration history was edited: this branch's new activation migration remains repository-only.

Remaining DJM strings in current Edge source are limited to compatibility environment names, old module/type aliases and two provider User-Agent identities. Stable calendar UIDs and the deployed URL fallback also remain intentionally unchanged. No customer records, historical evidence labels or provider contracts were rewritten.

## Offline reliability refinement

The upload queue now continues after a rejected capture, including when more than twenty old records precede an uploadable note. Failed entries stay in IndexedDB. Overlapping reconnect/visible-page drains share one operation, and foreground/background uploads share one in-flight request per capture ID. Each caller can still open its own receipt after the shared upload completes. Losing connectivity pauses the drain; a later reconnect retries retained entries.

Four behavioural tests cover rejected-agency queue starvation, overlapping drains, foreground/background request deduplication, failure recovery and connectivity loss. This coordination is per browser JavaScript context; server idempotency remains the protection across tabs/devices. It does not add model calls, dependencies, a new state framework or a polling interval.

## Receipt recovery refinement

Receipt reads now retain the RPC error code, so denied/expired-session responses stop immediately with an access message instead of retrying until an inaccurate saved-state message. Exhaustion only says safely saved after a receipt was actually verified. Network failures still retry within the existing bounded schedule.

Capture owns abort controllers for its receipt reads. Closing Capture or changing workspaces cancels requests and delay timers, suppresses late results, and prevents completed background uploads from starting a new poll on an unmounted screen. The controller identity check preserves correct behaviour during React effect remounts. This reduces avoidable network reads without changing worker execution.

The full page now observes query changes as well as workspace changes, so opening a different capture URL in the same workspace updates the selected receipt. Four behavioural tests verify immediate access-denial termination, late-result suppression, transient-error recovery and cancellation of a long delay. Existing route tests verify reactive query handling. Hosted session expiry and mobile navigation remain part of the staging canary.
