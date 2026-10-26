# Task editor focus and read recovery

Scope: UX-04 / UX-05 / UI-01 / UI-09 / DAY-03, stacked on draft PR 271. The full 46-item/17-surface programme remains active.

## Problem and change

Actual signed-in 390px staging Calendar opens an original task correctly but returns keyboard focus to BODY on Close. The editor captures its previous focus only after the asynchronous read disables the original Update button. A new delayed-read regression reproduces that failure in the unchanged source.

The existing HomeWorkControl now captures the actual clicked control before reading. It restores only an enabled, visible control for the same canonical work/action and current user/tenant/view. If the row is replaced, an available matching row can be used; otherwise the current page heading is the fallback. Restoration waits for modal cleanup and leaves another live modal or already focused control, including confirmed completion Undo, alone. No delayed retry of focus follows a network refresh. A tenant/view change invalidates the old target. Existing scroll leases, background isolation, drafts, discard confirmation, completion, Undo, read deadlines and write confirmation remain intact.

Opening and reloading failures now say that the task could not load. Failed or uncertain writes keep their existing save/confirmation language. A read does not imply that a save was attempted.

## Verification

The existing connected-followups suite covers delayed Close at 320/390/768/1440, retained list scroll, released isolation, failed-read recovery, dirty Cancel/Discard, Save, completion/Undo, direct-link heading fallback, a new modal, changed-record completion and tenant changes. Opening/closing is asserted to perform zero writes. The Home suite also checks delayed Close and confirmed Save; a replaced original row permits only the current Home heading fallback. Existing Home, Calendar lifecycle, role/current-record and stale-draft journeys remain the regression boundary. Local phone evidence stays labelled synthetic. Full validation and hosted acceptance are pending until recorded below.

## Frontend release manifest

Only frontend code, the existing browser tests/fixture, CI artifact path and documentation change. No migration, function/worker, Supabase data/configuration, secret, provider, schedule, external send, production operation or merge. Never replay migration history or the excluded relationship migration.

Use staging project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `jesseedge10-8415s-projects`, canonical alias `redream-systems-staging-jesseedge10-8415s-projects.vercel.app`. Verify exact pushed SHA/project/READY before assigning the alias; preserve the project branch rule with the existing deployment-only `exit 1` ignored-build override. Previous staged source is PR 271 `2dbfbb6b700d048d721fdbfd0cf26cb25dfffd67`, immutable `redream-systems-staging-evppdbjoz-jesseedge10-8415s-projects.vercel.app`. PR 270 `b29690eaaf77239307be41ad8979c11c99230bc5` at immutable fnfo8ali8 is the earlier full-CI accepted fallback.

After local checks, publish a draft based on `codex/redream-profile-secondary-recovery`, stage the exact frontend and verify original Calendar task open/Close focus without editing or saving. Compare the 13 retained baseline projections. No new canary is required. Existing owner/technical-fixture checks do not establish ordinary-staff, real provider, physical iPhone/Safari, independent-agency or the full UI matrix acceptance.


## Local delivery checkpoint

The final connected-followups, Home-work and Calendar-workspace suites pass. The old source fails the new delayed Close regression. Home's confirmed Save replaces its original DOM row in the recorded fixture, so a current-heading fallback is accepted only after proving that old opener is disconnected; an available matching row can still be restored. Completion keeps the already focused Undo. The tests also verify zero writes from opening/closing, released inert/scroll leases, retained list position, direct links, dirty confirmation, a new modal and tenant changes.

Full `npm run check` passes 2,143 tests, all TypeScript projects, production build and gzip 145,922 / 150,000 bytes. The React checklist is applied to the small existing component/fixture changes: no new dependency, global listener, unbounded timer, server surface or architecture. The bounded focus frame checks current scope and DOM before acting. Evidence is in `/tmp/redream-platform-programme/task-editor-focus/`, including `before-browser.log`, `final-browser.log`, `full-check.log` and the inspected phone capture.

Parent PR 271 full exact-source CI 40375973010 is green. Its staging alias/project and the 13 retained baseline projections are reverified before this frontend increment. The public-profile projection continues to exclude contract_expiry as in its established baseline. Draft publication, exact staging/owner read-only acceptance and new-head full CI remain pending. No production operation or merge is included.


## Final installed checkpoint

Draft PR 272 exact source `f925a9d535e7c54e510c6c00754a7ceeb81f55ce` is READY at `redream-systems-staging-nvxfejqjb-jesseedge10-8415s-projects.vercel.app`, deployment `dpl_6TwvDjuRKbGSm46xdsiJWMhZq6L5`. Full source/project/READY and the canonical staging alias are independently verified. Immediate rollback is the now full-CI accepted PR 271 evppdbjoz frontend at 2dbfbb6 recorded above.

Actual signed-in 390px Calendar opens the original Elias Novak reminder with its saved action/date, then Close returns focus to the exact enabled Update control. Its DOM work key is `player_next_action:f343ce03-789c-4897-91db-0fc51fd052b1`. Tab reaches Open player and Shift+Tab returns to Update. Page/viewport widths are both 390px, scroll stays 0 -> 0, and no inert/modal/scroll lock remains. No Save, completion or other business action is performed. All 13 retained baseline projections match. Phone captures 02/03 are inspected; `hosted-ui.json` and `release-final.json` retain exact read/release evidence. Hosted read-only owner acceptance does not establish hosted Save/Home, ordinary-staff, physical-device or independent-agency coverage.

Exact source CI 40380637726 has verify green and full browser journeys in progress. The installed checkpoint continues on `codex/redream-representation-journey` to preserve that run. No next feature is implemented here. The next coherent programme slice is the existing new-player representation-agreement journey with actual editable Word/PDF export acceptance, not another parallel document system. All unresolved programme and UI gates remain open. No production operation, backend change, external send or merge.
