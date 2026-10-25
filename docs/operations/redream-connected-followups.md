# Connected follow-up work

Scope: DAY-03 / TELL-02 / UI-09 / UI-10, stacked on PR 260 at `e21343a63345559f4aa0373f04b77f4dc8f8b203`. The wider programme remains open.

## Result

Tell receipts provide identifiable task-specific links in the same workspace, using confirmed resolved identities. Calendar opens the existing canonical task editor and supports existing update, note, due-date, completion and Undo actions for actionable follow-ups and No date work. Historical completed/cancelled tasks show their current saved state. If a task closes while being edited, current saved values and the retained unsaved draft stay distinct. Invalid or unavailable links have clear recovery; late reads cannot reopen a previous workspace's task.

The existing Home writer, task types, permissions, revision checks, ownership/responsibility control and Undo tokens are reused. A view projection holds confirmed state through failed/stale background reads and reconciles after the relevant current source reads complete. No parallel task table, writer, provider or architecture is introduced.

Two real database regressions are also repaired. Creation Undo's five-second shortcut could delete a newer staff edit. It now checks the recorded task snapshot and the original approved responsibility state under the same work lock used by Home and assignments; unchanged shared-task Undo removes only its original responsibility row. Nullable schema additions remain compatible, missing snapshots fail closed, and later changes are retained. In-progress tasks now remain active in both the editor and assignment reader; completion Undo restores their original status. Cancelled tasks are never labelled successful completion.

## Validation checkpoint

Final exact-source `npm run check` passes all 2,099 tests, every TypeScript project, production build and workspace gzip budget (144,563 / 150,000 bytes). All focused lifecycle PostgreSQL tests pass, including the reproduced old failures, unchanged/shared creation Undo, changed/missing evidence, reassignment, original status restoration, replay and immutable function metadata. The existing Calendar/Home/Tell browser suites plus the new connected suite pass. Coverage includes 320/390/768/1440px editor bounds, exact/multiple/long receipt links, confirmed-write/failed-refresh truthfulness, conflicts/drafts, completion/Undo, undated work, completed/cancelled views, external closure during editing, malformed links, Retry and workspace changes during a read. Existing Calendar month/Agenda/timezone/task/recovery checks remain passing. CI captures synthetic screenshots in its existing artifact.

Logs and evidence: `/tmp/redream-platform-programme/connected-followups-create-undo-before.log`, `connected-followups-active-state-before.log`, `connected-followups-lifecycle-database.log`, `connected-followups-final-browser.log`, `connected-followups-closed-draft-browser.log`, `connected-followups-final-release-check.log`, `connected-followups-final-acceptance-browser.log`, `connected-followups-exact-source-check.log`; screenshots in `connected-followups/`. These fixtures prove deterministic behaviour, not model/provider or physical-device acceptance.

## Exact staging manifest

Apply only these two files in order, after final checks and publication. No historical replay or db push:

1. `20261025072558_guard_task_creation_undo.sql`, SHA-256 `382ac40e1734e1fa5f3d98442aff8f911d8ff36f61ab64da4958d4410de2477f`. Existing owner-only Undo core source MD5 `feb0e58af6269bee3d0abd1425b5724a` -> `2ce689440904c71ecdc92e0451806005`.
2. `20261025073833_normalise_active_followup_state.sql`, SHA-256 `efd93a4c02ed6ba5a238b4e611eb2ff5a2c11b9cb5f026782de05d28bc1c3e69`. Existing private Home-state source MD5 `12b7e80d1263f379fca9eb49b86afe56` -> `696b90172e06941bcc0e1ac96b6e6489`; responsibility-state source `b6d2ede49bd2071d40ef835fc361fbe2` -> `cf662d2a4b50d75dec9464daac8cbe32`.

Both guard exact reviewed bodies, preserve function OIDs/owners/configuration/ACL/security mode, are idempotent and have local lock/statement limits. No table/data rewrite or access grant. Never execute excluded `20260930142119_restore_redream_relationship_person_entrypoint.sql`.

Supabase staging only: `ltvmopvarlnidiozvpow`. No Edge Function, secret, provider, schedule or configuration deployment. Existing agency-os 61/statistics 14/public 9 remain unchanged. Frontend: Vercel `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `jesseedge10-8415s-projects`, canonical staging alias `redream-systems-staging-jesseedge10-8415s-projects.vercel.app`. Build the committed exact SHA, inspect READY/project/SHA, then assign only that alias.

Immediate frontend recovery target: `dpl_3n8JzUtxgumbz3zBi4qQbGrLh7ad` / `1eb7bc0469c69dda74244348a5e855503782d58c`. Existing frontend remains compatible with the stricter task guard; do not automatically restore the known unsafe timing shortcut.

## Preflight and required hosted acceptance

Private preflight backup: `/tmp/redream-platform-programme/connected-followups-staging-before.json`, including exact function definitions/catalog, security/performance finding sets and table hashes. All three affected functions are postgres-owned, owner-only, empty-search-path invokers. Neither canonical migration version/name is installed. Seven player full rows retain MD5 `6e9392dc6b3dc877bfb90c47aeedbb93`. Existing task/capture/action hashes: `a39db2ef12139ee90baa9cf6cc3f8cbb`, `112aa6823c7c7064ec34bcf6a579e8eb`, `95294f1d53967e6effbc4babbc388b0a`. Northstar currently has 6 tasks, 2 captures and 2 actions; these original records must be preserved. Existing owner Tell permission is enabled/full; no permission expansion is needed.

After staging installation, verify exact sources, unchanged metadata and advisor findings before seeding. Use an isolated labelled deterministic fixture through the existing guarded writers, with no paid AI request or external send. Verify actual receipt links, scoped task/editor, completion/Undo and current Home/Calendar readback, including a newer-change denial. Preserve all original records, clean only exact fixture dependencies and retain required audit history. Do not recreate the earlier F1 fixture. Actual owner-only technical staging proof does not accept ordinary staff, model/provider, physical iPhone/Safari or an independent agency.

No merge or production rollout. Other legacy Undo action types remain separately unaccepted until their workflows are reviewed; task evidence is not universal Undo acceptance.
