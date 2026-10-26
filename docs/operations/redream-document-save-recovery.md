# Document save confirmation recovery

Scope: DOC-01 / DOC-06 / UX-04 / UX-05 / UI-12, stacked on draft PR 273. The complete 46-item/17-surface programme stays active.

## Reproduced problem

The existing editor reports a lost Save response as an error and leaves the old revision in the draft even when the server has committed. The new regression fails the unchanged source while waiting for confirmation of the actually saved version. A Library refresh cannot resolve this reliably: the list is limited to 100 documents. Initial duplicate IDs are also translated by the existing writer to its deliberate P0001 error; they do not necessarily reach the client as 23505.

## Implemented behaviour

- Save uses the existing bounded write helper, passes cancellation through the RPC and distinguishes an explicit database rejection from a missing acknowledgement. A ref lock prevents duplicate submissions. Unmount/scope/selection changes invalidate late results. Caller cancellation now ends the helper's timer and aborts its request; existing callers retain their default behaviour.
- An unconfirmed Save makes one bounded, read-only request for that exact tenant/document. Only the expected next revision with the same title, kind, template flag and semantic JSON content confirms success. JSONB key order is immaterial; array order remains meaningful. Wrong scope/ID, malformed content, paid or unexpected revisions never become a successful save.
- Exact confirmation adopts the saved revision without discarding newer local wording or field edits. Those edits remain visibly unsaved. A failed check keeps the draft and a clear Check saved version action. A completed read showing missing/unchanged state permits an explicit Retry save using the same ID and expected revision; it does not assert that a pending server transaction rolled back, and it never automatically repeats the write.
- A different saved version is never silently rebased over the draft. Loading it uses the existing Keep editing/Discard confirmation. An archived document exposes no archived content through the reader. Review/share/template/navigation gates continue to treat an unconfirmed save as unresolved work.
- The uncertainty explanation is brought into view and focused after the user's Save/Check action. The phone regression caught that ordinary smooth scrolling left the message above the viewport; this particular recovery target now uses immediate centred scrolling. Controls retain the existing tenant-aware styles; no parallel editor or redesign.

## Exact backend manifest

One new migration, created by the Supabase CLI: `supabase/migrations/20261026230055_agency_document_exact_read.sql`.

It adds only `public.redream_document_read(text,uuid)`, a stable, fixed-empty-search-path reader with the existing authenticated active-tenant owner/admin guard. It returns the exact active document and existing revision-specific activity metadata, or an explicit missing/archived state. It performs no write, event, lock, token creation or external action. Archived content and unnecessary creator fields are excluded. PUBLIC/anon execute is revoked; authenticated/service_role may call it but must pass the same user/tenant check. Raw table grants, policies and the existing writer remain untouched. The existing document PK and event/share document indexes cover the exact lookups; no new index or list scan.

No function worker, Edge bundle, provider, secret, schedule or configuration change. Never use bulk migration replay or apply the excluded relationship migration. Production is outside this increment's release scope.

Staging order after local checks and publication: apply only this exact new migration to `ltvmopvarlnidiozvpow`; retrieve its source/owner/ACL/security settings, preserve `redream_documents` OID 30640/source hash fd0101533fcf451d7b82ee66df4f3be6 and existing table grants; run the fully rolled-back canary below; compare original data projections and security/performance advisor delta. Then stage the exact pushed frontend on project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `jesseedge10-8415s-projects`, verify source/project/READY and assign the canonical staging alias. Preserve the deployment-only ignored-build override and the project branch rule.

Immediate frontend rollback: PR 273 f0ce416 at immutable `redream-systems-staging-5dle4wr30-jesseedge10-8415s-projects.vercel.app`, deployment `dpl_nAZPKj2X7FxmHrhcyY7ebNRHQz5f`. The additive, restricted reader can remain installed during a frontend rollback; do not drop it while a frontend still uses it or alter the existing writer.

## Validation and limits

The focused browser suite uses the existing editor and a labelled local fixture. It covers four widths, stalled/lost create and update acknowledgements, one exact read without another write, unsuccessful/stalled/foreign confirmation, preserved newer local edits, explicit stable-ID retry, a late first write rejected after the retry wins, conflict confirmation, and no implicit share/send. The existing representation and document browser suites also pass. Timer acceleration is local QA only, not a product timeout override. No app page exposes a QA switch.

The database test runs the actual new migration with the current writer, 101 newer records outside the target's list position, owner/admin and denied agent/anonymous/foreign/ended/suspended contexts, raw-table denial, archived withholding and repeat-read event invariants. `docs/operations/sql/redream-document-save-confirmation-canary.sql` is rehearsed locally with fixture identities and both tenant memberships matching the actual participant. Its initial rehearsal correctly denied a missing secondary membership; the local fixture now models the verified two-membership staging participant and retains that guard. All hosted canary writes must roll back; no second active document fixture is needed.

Private evidence: `/tmp/redream-platform-programme/document-save-recovery/`, including `before-browser.log`, `exact-final-browser.log`, `final-browser.log`, `canary-local.log`, `focused-tests.log`, `full-check.log`, responsive screenshots and synthetic `journey.json`. Final check results and installed acceptance are recorded below when established. Existing document exports/wording remain protected by the preceding representation journey; no exports or legal terms are redesigned here.

This does not establish every document kind/state/role/device, a physically interrupted hosted network, external invoice/send/signature providers or independent-agency acceptance. DOC-01/DOC-06/UI-12 and the wider programme remain active. No production operation, GitHub merge or external send/sign.


## Final local checkpoint

Final `npm run check` passes 2,148 tests, all TypeScript projects, production build and workspace gzip 145,981 / 150,000 bytes. The exact final focused browser run passes, including rejection of a retry without clearing the earlier uncertainty; all four recovery viewport screenshots and the conflict/unknown phone states are inspected. Existing representation and document suites pass. The local PostgreSQL canary rehearsal and all ten document database tests pass. Caller cancellation/pre-cancellation and semantic equality/malformed-scope tests pass in the full run. Generated fixture routes and Next type drift are removed.

The React/SQL checklists are applied to the narrow changes: no conditional hook, new provider/listener dependency, shared server state or unbounded operation. The existing before-unload listener remains paired with cleanup; per-operation cancellation and deadline listeners/timers are removed. Exact reads use existing keys and contain no write/lock/event. Existing raw grants and writer remain the boundary. Staging preflight confirms the exact reader is absent and Jesse has active owner memberships in both intended technical canary tenants. Data/advisor/source baselines are recorded privately before application.

Publication, new-head CI, exact staging migration/canary and frontend acceptance remain pending until recorded in the installed checkpoint. No new backend has been applied in this local checkpoint, and no production or external action is included.
