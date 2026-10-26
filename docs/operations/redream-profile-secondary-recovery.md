# Profile source readiness and read recovery

Scope: UX-05 / UI-04 / PLY-04, stacked on PR 270. All unresolved programme and UI gates remain open. Frontend only; no production operation.

## Problem and correction

The real staged cold profile showed "Add support email" before secondary agency branding arrived. The old source reproduces that false requirement against the actual workspace coordinator with a held detail response; the new regression fails the old source for that exact reason. Before/after phone captures are inspected in `/tmp/redream-platform-programme/profile-secondary-recovery/`.

The existing `player_profile_detail`, saved-version and agency-club reads now use `readWithDeadline`, separate pending/error/confirmed-empty states, scoped request sequences and in-flight deduplication. Retry reads only its resource. Invalid successful DTOs remain errors. Core identity/football data stays visible; unconfirmed agency details do not become missing-data guidance or a publish-ready claim. General/prepared client previews wait for their agency details; existing approved version snapshots remain independent. A genuine empty agency contact still produces the existing editing guidance.

Detail recovery merges into the current player without resetting its presentation draft and is available inside the existing editor. Club and saved-profile retries preserve the chosen target and introduction. An explicitly saved version never silently becomes General after a failed or unlisted response: it remains selected, and creation requires a checked listed version or a deliberate General choice. The 50-version reader remains a limited list, so absence is described as unlisted, not deleted. Current server publication, version matching and tenant/role checks remain authoritative. The existing workspace profile is keyed by its user/tenant/role scope as well as player; late reads cannot enter a different identity's view.

## Validation checkpoint

The focused actual-coordinator browser suite is extended with four-width pending guidance, failed/malformed/empty detail states, editor-draft recovery, active-share focus/draft preservation, explicit saved-version approval and retry, malformed lists, hung deadlines, late success and player changes. No new browser framework, provider call, dependency or test-only production bypass. The new focused source-read/focus/draft cases, original deal/share/follow-up checks, existing profile-tools/preview and story/PDF suites pass. Full `npm run check` passes 2,143 tests, every TypeScript project, production build and 145,417 / 150,000 gzip bytes. Retry focus returns to the relevant editor/control when focus would otherwise be lost, while late reads leave an actively edited share introduction alone. Exact staging and new-head CI remain pending. The old source fails the new pending-as-missing regression; the edited source is restored after that comparison.

PR 270 exact product b29690eaaf77239307be41ad8979c11c99230bc5 now passes full CI run 40365884109. Its completed M2 cleanup and all 13 original hashes remain the accepted baseline; do not recreate that fixture. The full programme still includes real providers/media, physical iPhone/Safari, ordinary staff and independent-agency acceptance.

## Frontend rollout manifest

Staging project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `jesseedge10-8415s-projects`, canonical alias `redream-systems-staging-jesseedge10-8415s-projects.vercel.app`. Verify full pushed SHA/project/READY before alias assignment. The deployment-only ignored-build override remains `exit 1`; do not change project configuration. Immediate recovery is PR 270 immutable `redream-systems-staging-fnfo8ali8-jesseedge10-8415s-projects.vercel.app` at b29690eaaf77239307be41ad8979c11c99230bc5.

No migration, function, worker, secret, provider, schedule, database replay or excluded relationship migration. After local checks, commit/push and publish a draft based on `codex/redream-deal-profile-handoff`. Stage the exact frontend, run read-only original profile/branding/preview and available share-list checks, compare all 13 hashes and inspect new-head CI. Healthy hosted reads do not establish hosted fault injection, large-list completeness or the full device/role matrix.
