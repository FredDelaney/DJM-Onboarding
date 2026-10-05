# Player data workflow

The staff Player Profile now contains the current-season figures, source evidence, background update status, human corrections and season history. Its figures use the same selector as the public Player Profile and statistics worker.

## Behaviour

- Match an explicitly recorded season, club and competition. Split-season aliases such as 2026/27 and 2026/2027 match. First-team, reserve-team, cup and historical records are never combined.
- Select one record. Prefer human-reviewed evidence, then coverage and source date. A recorded zero is zero; an unsupported figure stays unknown.
- Update statistics creates a persisted request in the existing refresh ledger. Requests deduplicate per player and replay by request ID. Reloading the profile recovers its status. Abandoned requests become recoverable failures after two minutes.
- Existing figures after research failure do not count as a successful check. A previous context's check is labelled as previous evidence.
- Manual corrections require context, non-negative whole figures, a valid source link and explicit source confirmation. Stale revisions and saves during an active update are rejected. Changing season, club or competition creates a record and preserves the earlier entry.
- Canonical career triggers request human verification and withdraw stale publication. Saving corrections and updating statistics never verify or publish a player.
- Custom club headline figures remain explicit. Use recorded statistics removes that override; publishing the revised profile is a separate action.
- Owner, admin, agent and operations roles may update. Other staff can read. All database mutations are server-only, tenant-scoped and audited.

## Verification

Run `npm run check` for the complete test suite, TypeScript checks and production build.

The workflow tests execute the real database migration, the existing career review trigger and the real Edge HTTP handlers against controlled external transports. Browser checks render the actual Player Profile and data panel; their API transport is simulated and persists its ledger across reloads. They do not research or mutate live players.

```sh
CODEX_PRIMARY_RUNTIME_NODE_MODULES=/path/to/node_modules \
CALENDAR_CHROMIUM=/path/to/chrome \
node scripts/calendar-browser-fixture.mjs scripts/player-data-workflow-qa.mjs scripts/player-review-context-qa.mjs
```

The browser toolchain needs Playwright. It is a test-runner dependency outside the production application. The fixture runner installs temporary routes and removes them and their generated development types after completion. The default fixture run includes the new workflow regression.

Coverage includes 320, 390, 430, 768 and 1440px viewports, source links, unknown/zero figures, persistent refresh recovery, failed refreshes, sourced corrections, retained drafts after conflicts, connection recovery, explicit verification against canonical figures despite custom club headlines, read-only access, safe history links and the custom-stat handoff.

The broader calendar workspace browser check failed its Today-at-a-glance assertion on unchanged main (4b18c63) as well as the feature checkout. It is a pre-existing regression outside this workflow. Its code was not changed.

## Release order

Production release requires explicit authorisation under AGENTS.md.

1. Apply `20261005182123_player_data_workflow.sql`. It adds server-only functions and an index; no existing migration is changed.
2. Deploy `refresh-player-stats-ai-worker`, `agency-os` and `player-profile-public`, including their shared module. The worker's explicit `refresh_ok` flag must be deployed with the new status handler.
3. Release the Next.js frontend to the connected application projects.
4. Check a staff profile with existing evidence, one authorised update, a sourced correction, subsequent verification and separate publication. Check a read-only role and the published club profile.

Rollback the frontend and Edge functions together if needed. The additive database functions and index can remain. Preserve canonical corrected data and review flags; do not automatically restore old publication or verification.
