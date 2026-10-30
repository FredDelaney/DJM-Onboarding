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

One new migration, first created by the Supabase CLI and aligned to the actual staging-assigned version: `supabase/migrations/20261026231700_agency_document_exact_read.sql`.

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


## Staging backend checkpoint

The exact reviewed reader SQL is applied only to ReDream staging. The migration service records version `20261026231700`, name `agency_document_exact_read`; the originally CLI-created 20261026230055 file is renamed to that authoritative version with identical SQL, without replay or ledger repair. Use the final 20261026231700 filename for future environments.

Retrieved reader OID 31991 is STABLE SECURITY DEFINER, owned by postgres, with empty search_path and only postgres/authenticated/service_role execute ACL. Its source hash is 86c2a5c5ea0e7597d2d60d27c00a8790. The committed canary passes on staging using the actual authenticated role and Jesse's verified two owner memberships: missing/create/read-only/update/stable-ID/stale-revision/foreign/archive/nonmember/anonymous. All writes roll back. This is actual PostgreSQL acceptance, not a hosted network interruption or independent-agency test. Data/source/grant/advisor comparison and exact frontend acceptance are recorded after they complete.


The installed reader body exactly matches the final local SQL hash above. The existing writer retains OID 30640, source hash fd0101533fcf451d7b82ee66df4f3be6, owner, empty search_path and ACL. Raw SELECT/INSERT/UPDATE/DELETE remain false for anon/authenticated on all three document tables. All 16 original data projections, including the prior archived QA document and its events, match after the rollback-only canary. No active canary is added.

Performance advisors and all prior security findings are unchanged excluding observation timestamps. Security has exactly one expected addition: the deliberately authenticated-callable, tenant-owner/admin-guarded exact reader (85 -> 86 authenticated security-definer notices). Its scoped API purpose, execute denial for anon, raw-table denial and real-role denial/tenant checks above are reviewed explicitly; no blanket grant or bypass is added. [Supabase notice guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). This is not a claim that the wider OPS-04 backlog is resolved.

After aligning the file to the provider-recorded version, all ten document database tests and the complete local canary rehearsal pass again. Application SQL/source and frontend code are unchanged from the full 2,148-test/type/build/bundle pass; only the migration filename, fixture reference and installation evidence change. Publish that final aligned head, retain its new CI run and stage that exact frontend. No second migration application or SQL rewrite belongs to the alignment.


## Final installed checkpoint

Draft PR 274 final source `b4ccf98f6b68118ef0170dab02cb370f9ead1b1b` is READY at immutable `redream-systems-staging-5pcq04zkt-jesseedge10-8415s-projects.vercel.app`, deployment `dpl_3aXR2gjkxTJw8uHPJPAMGSbjSoE3`. Full source, staging project, preview target and canonical alias are independently verified. Migration 20261026231700 and its exact-reader source/ACL/actual-role canary acceptance above remain installed; do not apply it again. Parent PR 273 now passes full CI run 40415733331 and its 5dle4wr30 frontend remains the immediate rollback.

Actual signed-in 390px normal Save passes: create `[QA] Save Recovery 2026-10-27 S1`, save revision 1, return through Library, reopen, revise the synthetic player field and save revision 2. The new exact reader under the actual authenticated role independently returns that title, revised field, tenant and revision 2 with zero active links. Activity shows only Draft created/Changes saved. No roster record, AI action, review acceptance, share, send or signature is created. This proves normal hosted frontend save/reopen plus exact backend read, not a physically interrupted hosted network.

Normal UI archive withdraws the exact document `24bd5c78-0b07-4b5b-9b73-6d98541a91a4`: revision 3, archived `2026-10-26 23:22:17.340338+00`. SQL and the empty Library confirm zero active documents and zero shares. This new archived synthetic row and its two created/saved events intentionally remain, alongside the earlier archived representation canary; no zero-footprint claim. All 13 original business projections and the three original document/share/event projections excluding only this new canary/dependencies match. The established public-profile projection still excludes contract_expiry. Inspected actual screenshots: `hosted-saved-390.png` and `hosted-clean-390.png`; `backend-acceptance.json` and `release-final.json` record the exact release/data evidence.

Exact final-source CI 40418885796 has verify green and full browser journeys in progress. The initial e1bbae9 run is superseded by the necessary migration-version alignment, without another application or SQL change. Preserve the b4ccf98 run; this installed documentation checkpoint continues on `codex/redream-mandate-journey`. No mandate feature is implemented here. After checking the confirmed-live final CI and fixing only real failures, advance DOC-02/DOC-06 through the existing new-subject mandate journey, principal/territory/term/fee clarity, edit/review/save and actual tenant-branded Word/PDF exports using the existing editor/harness. Preserve blank negotiated terms, owner wording and every unresolved programme/role/provider/device/independent-agency gate. No production operation, external send/sign or merge.


## CI follow-up

Exact final source b4ccf98 now passes full CI run 40418885796 (verify and browser journeys), freshly verified during the player-pitch continuation. Earlier in-progress notes above are historical. No source change, migration replay or new hosted canary was needed for this result.
