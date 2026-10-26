# Recoverable workspace read deadlines

Scope: UX-05 / OPS-03 / UI-06. Stacked on PR 268 at `330d332165816987d5511ec9553820c82fb84531`. All 46 programme rows and 17 UI surfaces remain open where not already accepted. No production change.

## Change and evidence

The actual staged Live deals timeout exposed raw database language. The existing `readWithDeadline` now translates only that known statement-timeout message into its existing recovery copy: "The request took too long. Please try again." It retains the original error as cause and preserves its code. Normal results, unrelated denials, network errors and user-request cancellations remain unchanged. Deadlines are released on success/failure, late success cannot change a settled failure and no retry is automatic. The separate confirmed/unknown write-outcome path is unchanged.

Four new read-boundary tests and five existing write-outcome tests pass. The existing actual workspace-coordinator browser suite injects the same SQLSTATE 57014, verifies the raw message is absent, observes exactly one failed read, then exactly one explicit Retry and recovery to the same tenant/deals list. Existing stale-response/warming/roster checks remain. Phone screenshots in `/tmp/redream-platform-programme/read-recovery/` are inspected; this is controlled local network-fault evidence, not a fabricated hosted failure.

The broader PR 267 run 40274708079 passes verify and the mobile capture correction but fails older page-scroll assertions. The full-screen deal owns an independent scrolling container and a covered-document lease. Editing must restore that parent lease rather than blindly unlock it. The updated existing tests capture the pre-editor state, prove exact restoration/interactivity, and retain the short-viewport real wheel-scroll assertion. Existing four-width Back/Escape tests prove final document unlock when the deal actually closes. No assertion is skipped and no production behavior changes for this test correction. Parent PR 268 final-head verify is green on 40275897226; its complete browser run remains live.

Full `npm run check` passes 2,139 tests, all TypeScript projects, production build and 144,908 / 150,000 gzip bytes. Corrected production-mode deal/club/contact editing, draft discard, scroll/focus return, short-screen wheel scrolling, page/drawer and read-only controls also pass. Source publication, exact staging rollout/healthy read and final-head CI remain pending at this checkpoint.

## Release boundary

Frontend only. Staging project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `jesseedge10-8415s-projects`, canonical alias `redream-systems-staging-jesseedge10-8415s-projects.vercel.app`. Verify exact full pushed SHA/project/READY before alias assignment. The branch-only ignored-build rule needs a deployment-scoped `exit 1` override; preserve project configuration. Immediate frontend recovery is the previously accepted immutable deployment `redream-systems-staging-a97c0vkk8-jesseedge10-8415s-projects.vercel.app` at `37ae4443cbddec56bf2168ab3d6479ac36c24b78`.

No migration, Edge Function, secret, provider, schedule, database/business row or persistent configuration changes. Do not replay the installed portfolio migration (actual ledger 20261026053920, reviewed filename/name mapping in its manifest), excluded relationship migration or any database history. No hosted synthetic fixture is needed for healthy read/navigation checks. Never induce a real production failure to verify recovery copy.

## Next connected journey: reuse these existing paths

The actual deal overview returns scoped root `warRoom.player.player_id` and `warRoom.club.organisation_id`; do not guess those fields inside `deal`. Existing canonical profile navigation is `?view=players&player=<uuid>&profile=1`; `workspaceIntelligenceHref` already validates UUIDs and tenant base paths. The current overview has no direct profile action.

`AgencyPlayerProfile.openShareComposer` already accepts a selected club/deal from an explicitly prepared profile, and `openShareFollowUp` already uses its selected deal with the approved `deal_step_prepare` / `set_next_action` workflow. Preserve those implementations and human approval; link creation does not prove an external send. The profile's late secondary DTO supplies `deals` and `clubs`; validate any source-deal preselection against that current, scoped DTO before choosing a target or showing a return relationship. The URL alone cannot establish it. Retain an explicit saved preparation choice over an inferred default.

The Edge `player_profile_detail` for assigned non-admin staff deliberately returns empty commercial `deals`, `clubs` and `shares`; preserve that projection. Inspect `profileContext`'s actual deal fields and existing ownership prerequisites before extending the UI. The next coherent increment is existing overview -> current player's club-ready profile -> validated same-deal sharing -> existing accountable follow-up, including missing/denied/late-context cases and exact return navigation. This checkpoint does not claim that workflow is complete.
