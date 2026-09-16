# ReDream AI pre-staging adversarial review

Date: 16 September 2026. Branch: `saas/tell-djm-tenant-context`.

## Verdict: READY FOR REDREAM STAGING

Ready for a controlled synthetic staging migration and deployment rehearsal using the manifest below. This is not a production, external-pilot or uninterrupted-worker-rollout approval. No staging or production deployment, migration, customer-data mutation or merge was performed during this review.

The review compared the 163 original changed paths against `origin/saas/tenant-foundation` at `a6257822f67ec2df9b77764610424a6b00b56bb2`. The reviewed starting head was `d270149`. All three unpublished migrations were read; historical migrations are unchanged. See [file inventory](REDREAM_AI_REVIEW_FILES.md), [observed RPC grants](REDREAM_AI_RPC_AUDIT.md) and [machine-readable deployment manifest](redream-ai-staging-manifest.json).

## Real findings fixed

| Severity | Finding | Fix and evidence |
| --- | --- | --- |
| High | New database rejected audio uploaded by the old capture Edge binary. | Admit the legacy user-owned URI only for requests without an explicit workspace. Reject existing cross-tenant URI bindings through a privileged membership-scoped check. Serialize URI binding. PostgreSQL regression covers old audio, conflicting workspace and later primary change. |
| High | Old user-only vocabulary/resolver APIs could choose primary membership instead of the capture tenant. | Revoke every overload for all application roles from migration 1 onward. Old binaries cannot claim new jobs; current shared workers use a version marker and capture-bound APIs. This marker is a compatibility discriminator, not authentication: the claim RPC remains service-only. |
| High | Concurrent action retries could create two targets before recording the unique action. | Lock the capture row before applying actions/scout observations and before related one-tap creation/retry operations. Preserve terminal action states if a malformed retry reaches the failure handler. Sequential canonical/legacy replay and invalid-payload regression pass; multi-connection contention has not been simulated in PGlite. |
| High | Offline drafts had no originating account and could upload under another signed-in account. | New drafts retain user ID; uploads verify the current session matches and send that token snapshot. Full-page capture remounts on account change. Legacy ownerless drafts remain in storage for supervised recovery. This prevents accidental upload; browser storage is not encrypted or a security boundary against same-origin script access. |
| High | Missing/malformed offline workspace could fall back to primary membership; new legacy-route drafts did not necessarily snapshot an agency. | Malformed explicit context fails closed. current_access supplies the server-validated workspace slug, passed into new drafts before recording. Tests cover malformed context and legacy request slug resolution. |
| Medium | Read-only permission could enqueue captures, including through direct inserts. | Require full/scout on enqueue and a restrictive insert policy. PostgreSQL tests cover both RPC and authenticated direct insertion. |
| Medium | Microphone permission delay allowed repeated starts or recording after the component had gone away. | Ref guard during acquisition, busy/close guard, lifecycle comparison and immediate release of stale streams. Stream assignment precedes recorder construction so constructor errors also release the microphone. Source reviewed; physical mobile permission tests remain a staging gate. |
| Medium | New notification paths would 404 on the old frontend. | Retain `/tell?workspace=...&capture=...` during transition; the new frontend authorises and redirects to the canonical path. The notification query now recognises only genuinely open questions. |
| Medium | Transcript completion timestamp alone could activate a failed/requeued capture. | Require status `done`, completion timestamp and same-tenant applied target action with applied_at. Failed and undone evidence is excluded in executed database tests. |
| Medium | Revoked membership prevented an administrator from disabling its old permission row. | Permit disabling while still checking membership before enabling; tenant ownership remains immutable. Regression passes. |
| Medium | Missing team-member metadata could consume a worker claim without returning a payload. | Optional metadata uses a left join; active tenant membership and enabled AI permission remain required. Timezone retains its existing default. |
| Low | Corrupt pending items could poison queue sorting; abort failures could hang persistence. | Validate record shape without deleting invalid records, handle transaction aborts, release IndexedDB connections on failure. Behavior checks cover corrupt/legacy shapes. |
| Low | Naming and stale link errors. | Neutral matcher wording, remove duplicated AI wording, correct agency-player wording, clear stale legacy-link errors, improve recent-capture label. Historical keys are preserved. |

## Migration and RPC review

The ordering is dependency-safe: workspace/permission/schema changes first; canonical move and invoker aliases second; activation changes third. Both the first and second migrations retire unscoped APIs, covering the intermediate state and the final catalog. The canonical rename preserves existing argument defaults and signatures and explicitly resets application-role ACLs. Client RPCs retain invoker execution; privileged helpers use empty search paths and scoped checks. The canonical capture-workspace and usage-recording definers validate membership or read ownership from the stored capture.

The local catalog audit covers 61 canonical/legacy signatures, including 29 canonical functions. No AI RPC grants anon access. Client access is an explicit 13-function allowlist. Worker writes, resolver calls, cleanup and usage are service-only. Retired user-only overloads cannot be invoked by authenticated or service_role. Compatibility aliases delegate to one canonical implementation, including worker claims; the implementation rejects markers emitted by obsolete binaries.

Migration replay is through normal migration-history tracking, not arbitrary repeated execution of ALTER/CREATE POLICY statements. A direct second application of migration 1 is not promised. Do not attempt a destructive down migration or restore the old single-user permission primary key after multi-tenant data exists. Roll back application exposure, retain durable data and use a reviewed forward fix. A restored pre-review worker binary will leave captures queued because its claim marker is obsolete.

## Cross-tenant and telemetry evidence

Executed PostgreSQL scenarios cover DJM primary/Northstar secondary selection, forged slug/UUID denial, revoked membership, foreign receipt/retry/delete/answer/undo rejection, identical-name vocabulary isolation, nested foreign entity IDs (including contacts), tenant-bound aliases, tasks/interactions/claims/needs/matches, club/contact employment and relationship creation, events/review ownership, scouting writes, and legacy-link recovery. The deep-link lookup rejects an explicit conflicting workspace before revealing a slug. The slug itself remains untrusted input.

The central AI ledger uses stored capture tenant and existing idempotency keys. Canonical/legacy plan persistence produces one successful usage row with model, input/output tokens, latency, estimated cost and capture fingerprint. No second ledger or model call was introduced. This is not proof of exact provider billing: a provider call that succeeds before its result can be persisted can still incur cost on retry. Actual failed-request costs, gateway delivery and p50/p95 latency require staging/provider observation; they are not manufactured from fixture timing.

## Edge, route and white-label review

Both capture entrypoints share one implementation and require gateway JWT verification plus getUser validation. Both process entrypoints deliberately disable gateway JWT verification to support cron, then require the scheduler secret or a valid user plus capture ownership/membership. Cleanup requires the cron secret. User input cannot select a privileged worker tenant: the claim and writes use the stored capture. Keys remain server-side; public capture failures are generic. Shared modules must be packaged with each Edge entrypoint; do not deploy shared modules as standalone functions.

The new route, legacy route and sign-in return path retain capture identity. Return paths are restricted to local capture routes. Unresolved agency routes fail closed; raw-host legacy `/tell` remains an authenticated compatibility entry and does not prove membership. Explicit workspace routes are validated by the backend. Validated custom-domain runtime can supply workspace identity without parsing `/workspace/:slug`. No complete custom-domain feature was built or tested live.

The copy manifest and changed source were classified as tenant identity, platform presentation or compatibility identifiers. Retained DJM identifiers include the real tenant slug/legal notice, existing bucket/database/source/idempotency keys, legacy environment and event channels, provider User-Agent contracts, calendar UIDs and existing hosting fallback. Player/admin/share behavior and visibility codes remain intact. Historical non-AI SQL-generated prose and each tenant's legal notice still need their existing separate pilot review; this branch is not a claim that every database-generated surface is fully white-label.

## Mixed-version matrix

| State | Expected behavior / release constraint |
| --- | --- |
| A: new database + old frontend | Existing DJM capture APIs/receipt paths remain. New notifications use the old route. Keep secondary-tenant exposure disabled until the current frontend is deployed. |
| B: new database + old capture/process binaries | Legacy uploads enqueue safely. Old process claims return no job from migration 1 onward; in-flight unscoped lookups fail closed. Expect a processing pause, not lost uploads. Inspect/retry any in-flight job marked failed after the shared worker is live. |
| C: new database + canonical Edge + old frontend | Deploy updated legacy entrypoints too, because the old frontend and cron still use them. Until then old uploads are durable but processing depends on the new worker being invoked. |
| D: new frontend + compatibility deployment | The updated legacy Edge names are thin shared-handler deployments. Canonical names must also exist because the current frontend invokes them directly. A frontend with only legacy names is not a supported deployment manifest. |
| E: new frontend + all current entrypoints | Fully supported target configuration; perform the Northstar/DJM canary and confirm queue, storage, grants, telemetry and branding. |

## Exact staging manifest

Do not execute against an implicitly linked CLI project. The staging operator must verify the ReDream staging project references and migration history first. Hosted project IDs were not verified in this local review and are deliberately not invented. Nothing below has been deployed.

Apply only these three migrations, in order, with normal transactional migration tracking:

1. `supabase/migrations/20260915192303_tell_capture_workspace_boundary.sql`
   SHA-256: `19ce3362b097c1a18fc95fa10bccc7e09c9b07200c5bb28bd43b9772bcc7a087`

2. `supabase/migrations/20260915194224_redream_ai_canonical_api.sql`
   SHA-256: `02c3fd2480ac453933cae2fa36dbb2ba146fc669397a67187ed206e50544c837`

3. `supabase/migrations/20260915194621_redream_ai_activation_evidence.sql`
   SHA-256: `f15f0d8c0473e758aabf77073f542ea9d37828bbd21c2f0c6e46989e5ec3e26b`

Then deploy these four AI entrypoints in this order from the same reviewed commit:

| Order | Edge Function | verify_jwt |
| --- | --- | --- |
| 1 | redream-ai-process | false |
| 2 | redream-ai-capture | true |
| 3 | djm-tell-process | false |
| 4 | djm-tell-capture | true |

Retain the existing scheduler/cron secret and its legacy header compatibility. Verify invocation of the updated worker before exposing the frontend. Existing Supabase keys, OPENAI_API_KEY and configured model settings remain server-side. REDREAM_AI_* names take precedence over retained DJM_AI_* fallback values; no secret rotation is required by this code change.

For the complete branch's accompanying neutral Edge presentation, also deploy these affected entrypoints with their current configuration. They are not dependencies for the canonical AI RPC migration, but shared code is bundled per entrypoint, so a source-only change is not a deployed copy change:

| Edge Function | verify_jwt |
| --- | --- |
| club-pitch-response | false |
| djm-calendar-feed | false |
| djm-network-capture | true |
| djm-network-import | true |
| djm-player-voice-message | true |
| djm-transfermarkt-enrich | true |
| import-player-evidence-json | true |
| import-player-stats | true |
| refresh-player-data | true |
| refresh-player-data-universal | true |
| refresh-player-peer-data | true |
| refresh-player-stats-ai-worker | false |
| refresh-player-stats-free | true |

Finally deploy the Next.js frontend from this same commit to ReDream Vercel staging, after the migrations and AI functions are verified. No merge or production promotion is part of this manifest. Do not change database/bucket/repository/project names, move stored audio, clear browser storage or replace the existing cron with a second scheduler.

## Required checks in staging before enabling the canary

1. Match the migration file hashes and confirm the actual hosted baseline. Take the established staging backup. Run catalog ACL checks against the hosted database, including all retired overloads.
2. Verify all four function deployments and real gateway authentication. Confirm old worker invocations cannot claim jobs, current workers can, and queued/in-flight legacy captures recover.
3. Close stale pre-transition tabs for shared-device tests. New client safeguards cannot retrofit already-running old JavaScript. Preserve ownerless legacy notes for supervised recovery with original account and workspace; do not silently assign them to the current session.
4. Run the synthetic Northstar/DJM canary in the transition document, including private storage, real phone/microphone, network changes, permission delay, backgrounding, session switching, reload, quota failure, conflicting capture links and concurrent retries.
5. Record real row counts, tenant ownership, provider usage and latency before/after. The previous GPT-hosted baseline is user-provided context, not reverified evidence from this local review.

## Validation and limits

- `npm run check`: **432 tests passed, 0 failed**; TypeScript and Next.js production build passed.
- **38 embedded PostgreSQL tests** execute the affected lifecycle and activation/ledger behavior; all legacy public Tell RPC definitions are loaded for the ACL audit. Minimal unrelated tables/helpers remain fixture scaffolding.
- Legacy definitions are loaded with function-body checking disabled to accommodate unrelated absent dependencies, then checking is re-enabled. This permits a full signature/ACL inventory; it does not claim every unrelated function body or the entire hosted schema was executed.
- Offline behavioral tests cover origin parsing, malformed records, owner checks, queue starvation/concurrent drains, same-ID saves and polling cancellation. The microphone acquisition change is source-reviewed; it has not been exercised with physical hardware.
- No customer data, hosted model request, actual Edge runtime, complete staging RLS/storage gateway or multi-session PostgreSQL race test was run. These are staging rehearsal acceptance checks, not claimed local passes.
- A draft retained only in memory cannot survive browser termination or an unavoidable unmount. Previously persisted records remain in IndexedDB. This limitation remains explicit in the UI.

No new feature was started. The release decision is limited to entering controlled ReDream staging with the exact manifest and checks above.
