# Calendar active follow-up recovery

Scope: DAY-03 / OPS-05 / UI-09, stacked on draft PR 263 at `7d71d9d7215eb84a73e21d65e6624730229c2821`. All 46 programme items and 17 UI surfaces remain retained.

## Problem and behaviour

The actual Calendar editor completes an in-progress Tell task correctly and Undo restores its exact original `in_progress` state. The dated Calendar list then omits that active record because the existing legacy follow-up reader filters only `task.status='open'`. The writer, toast and actual canonical record succeed; list acceptance fails.

Change only that predicate in `public.redream_calendar_range(date,date,text)` to include `open` and `in_progress`. Keep owner/tenant/staff checks, restricted staff projection, meeting/date/timezone/limit behaviour, terminal and undated exclusions, fields, ordering, permissions and task rows. No frontend, writer, DTO, schema table, index, role, provider or new task system.

## Validation

The actual installed-source PostgreSQL regression reproduces missing in-progress work before the patch. Extended existing tests retain the exact reviewed October staff projection, assert its source hash, and cover open/in-progress versus terminal/undated/future tasks, same-title distinct IDs, colleague/foreign exclusion, three time zones, immediate membership revocation, untouched task rows, metadata/ACL preservation, replay and unknown-reader refusal. Existing birthday, Calendar, confirmed-work and staff-projection checks pass: 43 focused cases. Final `npm run check`: 2,117 tests pass, all TypeScript projects/build and unchanged gzip 144,768 / 150,000 bytes.

A real authenticated-role installed-staging rollback canary separately reproduces the old failure using the existing canonical deterministic Tell task writer and existing technical players. Every seed/action/task and mutation rolls back; no model call, external send, auth user or persistent membership/permission change. Private evidence: `calendar-active-before.log`, `calendar-active-after.log`, `calendar-active-full-check.log`, `calendar-active-before.json`, `calendar-active-before-canary.sql` and `calendar-active-installed-canary.sql` in `/tmp/redream-platform-programme/`.

## Exact staging manifest

Only `supabase/migrations/20261025124547_preserve_calendar_active_followups.sql`, SHA-256 `d7d61f3f4e9d24a3eb38210bff386d754616aa02805e95e339675fc11fcfbc6a`, full statement MD5 `e8fe4f886d28869bcff672d63091860e`. Target existing `public.redream_calendar_range(date,date,text)`: reviewed source MD5 `8df71af6543a18b6adb65c29ae5affba` -> `0df2efa05dd397890a42d89ac52f5419`. Preserve existing OID, postgres owner, ACL `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`, empty search path and definer mode. Guard exact before/after bodies, preserve identity/catalog, refuse unknown readers, replay idempotently, local 5s lock/30s statement limits.

Staging Supabase `ltvmopvarlnidiozvpow` only. No frontend rollout: keep READY source `36d385f551a4b91aea73cce7ae72e500c6524c57`, deployment `dpl_2uKap5VBvSx2vJi22QPgUBFcZXUt`, canonical staging alias. No worker/provider/schedule/secret/configuration rollout, production mutation, GitHub merge or historical replay. Never execute excluded `20260930142119_restore_redream_relationship_person_entrypoint.sql`.

Pending: publish draft, install exact guarded SQL, verify catalog/ledger/advisors, actual-role Calendar create/in-progress/complete/disappear/Undo/restored-list and workspace/revocation canary, signed-in normal UI with exact disposable cleanup, all nine original full-row hashes and exact-head CI. Backup contains the reviewed function before-image; recover only that definition after comparing exact installed hashes/metadata, without rewriting task rows or automatically reintroducing a known failure.

## Remaining programme boundaries

This does not accept the full Calendar state/role/provider/device matrix or real independent-agency working day. The Calendar range's existing legacy global team-membership prerequisite is retained and still needs SAS-04 fresh-agency/role reconciliation; the separate canonical Home/task access patch did not cover this reader. Do not infer new-agency Calendar acceptance from the existing Northstar owner canary. Other data sources and actual integrations remain subject to the programme register.

Parent PR 263 product verify passes; its product browser run was superseded by the later documentation head under existing workflow concurrency. Final parent head `7d71d9d` verify passes, browser run `40194412824` remains live. Parent PRs 261 and 262 full CI are green at their recorded exact heads.

## Installed staging acceptance

Draft PR 264, product `2d1812bc539dda5bf25b263d5308ca0c5bc96eff`. Exact SQL is installed at canonical version `20261025124547`, full statement MD5 `e8fe4f886d28869bcff672d63091860e`. Tool-generated version `20261025125137` was normalised only under exact name, single-statement/full-MD5 and absent-canonical-version guards. OID 28989, postgres owner, authenticated/service-only ACL, fixed empty search path and definer mode are retained. Installed body is exactly `0df2efa05dd397890a42d89ac52f5419`; security/performance finding sets match before observation timestamps. Frontend and worker remain unchanged.

The actual authenticated-role fully rolled-back K1 canary passes open/in-progress admission, canonical completion/disappearance affecting only one same-title player task, Undo restoring exact original `in_progress` and both list rows, wrong-workspace exclusion and immediate membership revocation. The first run expected a later staff error; the actual resolver correctly denies revoked workspace access earlier. Correcting only that test expectation yields the full pass, and original hashes match after both rolled-back runs. No guard was relaxed. Final rollback capture `2f89230c-54e5-42fc-ac46-75e95d955b60` and both tasks are absent.

Signed-in K2 acceptance passes on the unchanged READY frontend: two same-title rows clearly retain Leo/Marcus context and Jesse ownership; direct tick on Leo completes exactly that in-progress task and removes only its row. Undo restores the raw `in_progress` state and both list rows. A full browser reload retains the restored row, confirming hosted reader recovery rather than only a temporary client override. The inspected screenshot `calendar-active-restored-cold-load.png` shows both rows. The selected-day strip and existing navigation remain usable; full physical-device/role/provider/visual-density acceptance is still separate.

Exact guarded cleanup removes capture `ec3153ff-2257-429b-ada4-530ece3f8d05`, tasks `7c8b3638-c5b8-4f83-862f-099793c4b648` / `058e5a6b-67ff-4959-bee9-d553cb4cb48c` and actions `7e14738f-505e-4367-813d-af37eae59f14` / `ad3a4dc5-4abf-4932-a848-31fe4db3b9f8`. Two audits/two events are retained. All nine original full-row hashes match, including seven players `6e9392dc6b3dc877bfb90c47aeedbb93` and 46 AI events `480049812f2c25c338afb8915e230889`. No fixture, model call, auth user, membership or permission change persists. Final catalog/role/UI/cleanup evidence is `calendar-active-final.json`, with exact seed/canary/cleanup SQL alongside it.

Product verify passes on run `40194981801`; full browser and final documentation-head CI remain pending. Parent final PR 263 verify passes and browser run `40194412824` remains live. No GitHub merge or production rollout. Next narrow SAS-04 issue is the retained Calendar global-team prerequisite, which must be reproduced and reviewed independently rather than inferred fixed by this status predicate.
