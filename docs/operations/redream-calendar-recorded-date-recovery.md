# Calendar recorded-date recovery

Scope: PLY-03 / UI-09. Draft PR 260, stacked on PR 259 (`9a11378172cfc186cc2a3e7e3ac0c9b3b5f2e3d4`). Final product: `1eb7bc0469c69dda74244348a5e855503782d58c`; first date repair: `06c0ca890cb27f22156cab4da0cfd73964678be1`.

## Five reproduced Calendar repairs

- PostgreSQL returns all-day deadlines as timestamps. Appending another time produced invalid dates that were silently discarded. Normalize date-only inputs to their recorded `YYYY-MM-DD` at the existing shared boundary; retain timed-meeting behaviour.
- Null follow-up dates previously became 1 January 1970 and false overdue warnings. Undated work stays in No date.
- FullCalendar hides its decorative day number; our custom number is interactive. Its existing cell-mount hook now exposes only that button wrapper to accessibility APIs.
- The existing date picker anchors to its right edge so its open popup fits tablet widths.
- Month -> Agenda now scrolls the selected day into view even when the date itself has not changed.

No tenant-header loss was established: the installed SDK retains the explicit workspace header in the focused transport probe. No routing or permission change was guessed.

## Validation

The old source fails the actual timestamp-shape regression: only one timed meeting survives instead of six events. A second regression catches a date moving to the previous day in America/Los_Angeles. All 15 focused Calendar tests pass. Final `npm run check` passes 2,080 tests, every TypeScript project, production build and bundle budget (144,096 / 150,000 gzip bytes).

Both existing Calendar browser suites pass. Their original task creation/assignment, complete/reopen/archive/restore, undated work, drafts, stale revisions, nested-dialog focus/scroll and stalled-read checks remain. Added Month/Agenda coverage at 320/390/768/1440px in Europe/Rome and America/Los_Angeles verifies actual recorded contract/agreement/document timestamps, marker dates, selected-day rows, accessible day selection, undated exclusion, open-popup bounds and visible selected day after view changes. No assertion is waived. The existing CI artifact now captures the synthetic Calendar screenshots.

Evidence under `/tmp/redream-platform-programme/`: `calendar-date-before.log`, `calendar-date-after.log`, `calendar-final-browser.log`, `calendar-final-followup-check.log`, `calendar-staging-results.json`; screenshots in `calendar/`.

## Exact staging deployment manifest

**Frontend only. No migration or backend deployment.** No data mutation, secret, provider, schedule or configuration change. Existing agency-os 61/statistics 14/public 9 and installed migration provenance stay as recorded in `redream-player-details-review.md`. Never replay installed history, the removed F1 seed or excluded `20260930142119_restore_redream_relationship_person_entrypoint.sql`.

- Team: `jesseedge10-8415s-projects`.
- Vercel project: `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, `redream-systems-staging`, Next.js, preview target.
- Final exact SHA: `1eb7bc0469c69dda74244348a5e855503782d58c`.
- READY deployment: `dpl_3n8JzUtxgumbz3zBi4qQbGrLh7ad`.
- Canonical alias: `redream-systems-staging-jesseedge10-8415s-projects.vercel.app`, assigned only after READY; reread confirms final project/SHA.
- Immediate rollback: `dpl_6khPdwBHGb6zy7tdN1JjxUDgyH3M` / `06c0ca890cb27f22156cab4da0cfd73964678be1`.
- Pre-Calendar rollback: `dpl_Bb6ZrEQgQjLnpjBNxmxudP8JbbR3` / `be01d770c9625d3eeb765ece9fc1191dd7fa60c4`.

## Actual read-only hosted acceptance

Signed-in Northstar owner, existing Marcus Bell (`25be93d4-7dff-4086-94d9-5ffd3f6d6b0f`), unchanged contract expiry 28 November 2026. The authenticated reader with the explicit Northstar header returns that exact all-day timestamp. Month marker/day row and Agenda now show it. Open player retains Northstar and the profile header confirms the same expiry.

Desktop 1459px, responsive Chrome 390x844 and tablet 768px checks pass within their scope. The mobile row is reachable above the fixed navigation; Open player is 44x44px and page scrollWidth equals 390px. Open tablet picker x=449.55px, width=200px, right=649.55px; page scrollWidth equals 768px. Final Month -> Agenda keeps selected 28 November visible: day bounds 232-274px within strip bounds 18-372px. Loading resolves, the real row remains correct and the viewport is restored.

Screenshots: `calendar/hosted-recorded-expiry-desktop.png`, `hosted-recorded-expiry-390.png`, `hosted-date-picker-768.png`, `hosted-agenda-selected-day-390.png`. `hosted-agenda-selection-before-390.png` retains the discovered strip failure. Final database reread confirms seven original-player full rows retain MD5 `6e9392dc6b3dc877bfb90c47aeedbb93`, the expiry is unchanged and removed F1 is absent. No canary recreation was necessary.

## CI and remaining gates

Parent PR 259 at exact `9a11378172cfc186cc2a3e7e3ac0c9b3b5f2e3d4` passes verify and full browser CI on run `40122962486`. First Calendar run `40124363629` passed verify, then was cancelled when superseded by the follow-up; it is not full-browser acceptance. That product run was superseded by the documentation checkpoint. Exact final PR 260 head `e21343a63345559f4aa0373f04b77f4dc8f8b203` passes verify and full browser CI on run `40125721923`. No check is waived.

PLY-03 and UI-09 remain active. This accepts the scoped recorded-date owner journey, not every Calendar state, actual ordinary staff, provider integration, physical iPhone/Safari or real independent agency. All 46 programme items and 17 UI rows remain in the authoritative tracker. Keep draft; no merge or production rollout.
