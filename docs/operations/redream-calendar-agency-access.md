# Canonical agency Calendar access

Scope: SAS-04 / SAS-01 dependency / UI-09 / OPS-05. Stacked on draft PR 264 at `b0c8c6ccbb6bad2447a31eb16606788c862b418a`. All 46 programme items and 17 UI surfaces remain retained.

## Problem and resulting behaviour

A valid agency owner can resolve a workspace and use canonical Home/task functions but Calendar still additionally requires an active legacy global `djm_os.team_members` row. An actual authenticated-role fresh-agency rollback fixture reproduces `active_tenant_staff_required` when only that legacy row is inactive. This is independent of the preceding in-progress-list repair.

Remove only the three-line global-team join from the existing Calendar range membership guard. Active tenant, active canonical membership, the same five allowed staff roles, own meetings/tasks, active-status predicate, restricted staff projection and admin-only operations stay intact. Inactive legacy global records alone cease to be agency revocation; the existing canonical membership's suspended/ended state still denies immediately. No global backfill, new role, permission grant, API, writer, task/table rewrite or tenant bypass.

The inspected actual request resolver and admin resolver already use canonical membership; neither needs changing. Owner/admin operations retain their existing admin boundary and other staff retain the personal restricted projection. This aligns the existing reader with the canonical workspace/Home/task boundary rather than changing tenancy.

## Validation

The existing actual-source PostgreSQL suite reproduces the missing-global-row failure. Five staff roles then pass without that row; an inactive legacy row also passes. Invited/suspended/ended memberships, player role, inactive tenant and missing identity deny. Own meeting scope and colleague/foreign exclusion remain, as do active-task status, restricted projection, function identity/owner/ACL/configuration/security mode, replay and unknown-reader refusal. All 45 focused Calendar/birthday/confirmed-work/staff-projection checks pass. Final full check is pending at this checkpoint.

The installed-staging before-canary creates only a transient labelled agency/membership around Jesse's existing account and makes his legacy global row inactive inside one rolled-back transaction. It proves the real blocker without any persistent tenant/member/global-row or auth change. Private evidence in `/tmp/redream-platform-programme/`: `calendar-access-before.log`, `calendar-access-after-final.log`, `calendar-access-final-full-check.log`, `calendar-access-before.json`, `calendar-access-before-canary.sql`, `calendar-access-installed-canary.sql`. The initially expected SQL denials in a local transaction now use savepoints so later denial cases actually execute; no application guard was relaxed.

## Exact staging manifest

Only `supabase/migrations/20261025125836_canonical_agency_calendar_access.sql`, SHA-256 `2e2baa991a7d4ff26a3cd9a42c223305d6c9e41ecea05c72b4a4dd196ef1bca8`, statement MD5 `2b37913b8763285354dbd6879be712c9`. Existing `public.redream_calendar_range(date,date,text)`, OID 28989: prerequisite reviewed active-work source `0df2efa05dd397890a42d89ac52f5419` -> final `1c6035407151fbbd2545d83f879bbdaa`. Preserve postgres owner, ACL `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`, fixed empty search path and security definer. Exact body guards, post-contract assertions, idempotent replay, unknown-reader refusal and local 5s lock/30s statement limits remain. The active-work prerequisite is already installed on staging; unknown or older bodies are deliberately refused.

Supabase staging `ltvmopvarlnidiozvpow` only. No frontend/worker rollout: frontend remains READY `36d385f551a4b91aea73cce7ae72e500c6524c57` / `dpl_2uKap5VBvSx2vJi22QPgUBFcZXUt`. No production, provider, secret, configuration, schedule or GitHub merge. No migration replay; never execute excluded `20260930142119_restore_redream_relationship_person_entrypoint.sql`.

Pending: final full check, publish draft, exact SQL installation/catalog/ledger/advisor checks, real-role fresh-agency workspace/Home/Calendar -> canonical in-progress task -> current editor/note/date -> completion/disappearance -> Undo/restored list -> restricted agent Calendar -> cross-agency/revocation canary, original nine hashes and existing signed-in owner regression. Recover only the reviewed function before-image if required after exact metadata/hash comparison; no data rewrite or automatic reintroduction of a known access failure.

## Remaining acceptance

Technical synthetic-agency proof does not establish an independent real agency, ordinary-staff browser, physical iPhone/Safari, provider integration, complete UI matrix or no-developer onboarding. These remain explicit SAS/UX/VAL gates in the programme. Existing role schema has no dedicated viewer role; player denial is not read-only-staff acceptance. Keep every unresolved requirement.

Final local validation: `npm run check` passes 2,119 tests, all TypeScript projects, production build and unchanged gzip 144,768 / 150,000 bytes. Hosted installation and fresh-agency acceptance remain pending.
