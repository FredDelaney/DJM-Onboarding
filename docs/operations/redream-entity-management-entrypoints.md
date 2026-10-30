# Scoped entity management entrypoints

Programme: OPS-03-A / UI-02 / UI-03 / UI-06 / UI-08. Backend repair is installed on staging; this does not accept the entire management-menu experience or authorise production.

## Problem and reused behaviour

The shared EntityActionsMenu called public redream_entity_patch, redream_entity_archive and redream_entity_delete, but all three were absent on actual staging. Preview and archive-list readers already existed. The canonical writers already enforced agency-admin/current-workspace authority and emitted lifecycle events. Replaying the historical lifecycle migration would overwrite intervening security and commercial work.

The repair adds only the missing browser contracts over those current writers. The current canonical writers remain unchanged. A guarded forward correction aligns the existing preview with both representation-link fields. No table, data model, RLS policy, table grant, configuration, secret, Edge Function or production frontend is changed.

## Installed manifest

Staging **ltvmopvarlnidiozvpow only**: **20261028182236_restore_scoped_entity_management_entrypoints.sql**, then **20261028213902_protect_signed_prospect_management_history.sql**. Both are already installed; applied files are immutable. The CLI-allocated file was renamed to the actual ledger timestamp with SQL bytes unchanged. It follows the commercial/football/source sequence in [the club-request manifest](redream-club-request-brief.md); all those files are already installed and must never be replayed. Never execute the excluded 20260930142119_restore_redream_relationship_person_entrypoint.sql.

Preflight refuses changed/missing canonical bodies, changed execute boundaries or already-existing browser/private entrypoints. The new private invoker helper authorises through the unchanged request-workspace/admin resolver before locking the exact permitted record. It admits only an active owner/admin of that selected active agency. Administrative membership in another agency is insufficient. Club aliases require a club organisation; contact aliases exclude player people.

The three fixed-search-path public definer wrappers are executable by authenticated/service_role only. They are intentional narrow bridges to service-only canonical writers; the browser cannot invoke the private helper or canonical writers directly. Identity comes from auth.uid, never a supplied actor. Generic patch accepts only the fields the existing five editors support and string/null values. Unsupported fields fail rather than silently disappear. Club-request edits must retain the separately reviewed expected-version RPC. Archive requires an explicit non-null state; deletion requires true, including rejection of null. Both linked_player_id and signed_player_id protect representation history: deletion is rejected and the existing preview disables that action, while archive remains available. The correction patches only the new delete wrapper and existing preview after exact body/fragment guards. Canonical dependency failures and audit events remain. No automatic write retry, external send or production change occurs.

| Function | OID | Body MD5 | Access |
| --- | --- | --- | --- |
| public.djm_delete_entity | 22194 | 204d2f566f8495a369a1ded689757389 | Unchanged existing contract |
| public.djm_delete_preview | 22195 | 088e60e30d8858dac0ade8e80b1bda5c | Unchanged existing contract |
| public.djm_entity_archive_v1 | 29338 | ddbba5b7ff2b6cf38a95e6f5fc79806b | Unchanged existing contract |
| public.djm_entity_patch_v1 | 29339 | 5fb601fe896dd5702935db1772323001 | Unchanged existing contract |
| public.redream_entity_action_preview | 29342 | 72f69fe5d672116f16e588ca331ea090 | Existing scoped preview, representation guard corrected |
| public.redream_entity_archive | 32226 | 58fba24714fa9cd3be8521413fef9d1a | New scoped authenticated/service definer |
| public.redream_entity_archives | 29343 | 9d979232e35bf706562b09b15978e248 | Unchanged existing contract |
| public.redream_entity_delete | 32227 | 2ed10f7795c34721ce54bb1fcb94ecff | New scoped authenticated/service definer |
| private.redream_entity_management_access | 32224 | e583d8c7316b0f7dc3466610446e85c5 | New private invoker, owner only |
| public.redream_entity_patch | 32225 | 966659e118a9245fb9499dd0ca8226b0 | New scoped authenticated/service definer |

Existing OIDs/owners/execute ACLs/security modes/empty paths are retained for all six existing writers/readers in that table. Five bodies are unchanged; only the existing preview adds the signed-only representation guard, changing its body MD5 from f1b453418a4caffb3d8e1037026bec0f. The new delete wrapper changes from c28961d7f0b5b84a0566a95f713b8e77 under the same guarded forward migration. New routines are owned by the same postgres role; all four paths are fixed empty. There is no row backfill.

## Validation

- Nine focused PostgreSQL cases execute frozen actual canonical bodies. They prove the missing starting contracts, unchanged canonical metadata, all five generic edits, all six archive/restore/delete kinds, current actor audit identity, true-only confirmation, both representation-link/preview denials, dual-admin wrong-workspace denial, ordinary-staff/player/revoked/suspended/missing-identity denial, unsupported patches and player-person/agency alias rejection. No global DJM staff row is used.
- The complete 2,226-test suite and 33 focused current/historical permission/entity/menu/draft checks and all TypeScript projects pass. Unchanged application build/bundle evidence from cf670a3 is reused. The full test suite initially exposed a historical October 6 permission fixture loading the new browser wrapper without its new private dependency. That fixture now pins its historical wrapper, as it already does for Home; the separate new database test executes the complete current closure. Denial assertions are preserved.
- Actual hosted proof: [rollback-only canary](sql/redream-entity-management-canary.sql), with a fresh invited identity, no global staff, owner/admin membership and all six canonical record kinds. Authenticated edits persist and match read projections; archive lists include the exact archived IDs and restore succeeds; preview remains available; confirmed deletion emits six actor-attributed events. Wrong roles/workspaces/types, revoked/suspended access, direct canonical execution, missing identity, anonymous access, unsupported fields, generic brief-version bypass, false/null deletion and linked representation are rejected. All synthetic identities, records, dependent subjects and events roll back.
- Two initial hosted fixture attempts rolled back: the first used unsupported membership status inactive instead of the actual ended state; the second tried directly joining two existing football-intelligence identities. The final fixture follows existing status constraints and inserts its separate representation-history fixture with its link already set, reusing the existing subject. No trigger, subject uniqueness, promotion implementation or product data was changed to make the test pass.
- Security advisors: **183 versus 180**, exactly three deliberate authenticated-definer notices for the restored wrappers. [Supabase execute-privilege guidance](https://supabase.com/docs/guides/database/functions#function-privileges) applies: only narrow current-admin/workspace entrypoints are exposed; the underlying writers stay service-only. Performance **203 versus 205**, no added finding. Previously recorded unused-index notices are telemetry, not a reason to remove useful relationship indexes.
- The following original projections match before/after, including the earlier pre-repair baseline for the first sixteen tables. This is scoped data evidence, not a whole-database claim.

| Table | Rows | Projection MD5 |
| --- | --- | --- |
| djm_os.club_needs | 5 | 038b239dbaf228e0beea2773c8ddffb3 |
| djm_os.deal_rooms | 2 | d1869f275573a52c1bdd46af03f38959 |
| djm_os.employments | 6 | 5bd333405c6387a2317f93e67aadc335 |
| djm_os.events | 83 | 752fee647b11b9f2c27037cfe22b611a |
| djm_os.football_intelligence_subjects | 18 | 1be7cb4379a6e6c69959a5c612b2a353 |
| djm_os.organisations | 5 | 9e99d194dbb9d1c7996c07e14e1b7030 |
| djm_os.people | 7 | def7a50b4ed6441260a7e9614f9f2516 |
| djm_os.player_matches | 4 | a96cf49ab2d596a9a367eba8b762a6d9 |
| djm_os.recruitment_interactions | 0 | d41d8cd98f00b204e9800998ecf8427e |
| djm_os.scouting_prospects | 11 | fc99bb000898f93fa3a4eab2c4a8f01d |
| djm_os.scouting_reports | 0 | d41d8cd98f00b204e9800998ecf8427e |
| djm_os.tasks | 10 | dcf88eb159abcb5d42de4486512da720 |
| platform.audit_events | 151 | 57571d618b67bdf303bc8a90e914353d |
| public.player_agreements | 0 | d41d8cd98f00b204e9800998ecf8427e |
| public.player_documents | 0 | d41d8cd98f00b204e9800998ecf8427e |
| public.player_opportunities | 0 | d41d8cd98f00b204e9800998ecf8427e |
| public.players | 7 | 22576d1d997d0bc7788f2b7b07bcd411 |

## Remaining acceptance

The cf670a3 full CI verify job passes; its browser job fails at a pre-click scroll snapshot in the connected task-editor test. Local diagnostics reproduce before=0, opening-click=452, returned=452: the product preserves the actual opening position. The assertion now captures the opener at the actual click and compares its viewport-relative position, retaining strict focus/no-write checks and raw document offsets for diagnostics. Browser scroll anchoring can change document offsets without moving the visible list. The exact corrected connected-follow-up journey passes four widths and the existing recovery/Undo/tenant-switch cases. Final corrected-head CI and actual whole-menu recovery acceptance remain required. This backend repair does not add optimistic versioning or exactly-once guarantees to the old generic writers. Shared generic mutation waits, acknowledgements and refresh/unknown-outcome behaviour require their own focused review; do not claim that a browser timeout cancels a remote write. The new club-request frontend still awaits a permitted staging deployment and signed-in acceptance. Physical-device, ordinary-staff and independent-agency programme gates remain. Production, external communications and public sharing remain untouched.
