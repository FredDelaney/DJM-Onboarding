# Page clarity pass, 9 October 2026

## Scope

Reduce repeated introductions, long headings, generic instructions and approval warnings in 22 frontend files across agency Home and Business, player pages, service review, negotiation, club/contact intelligence, messaging, settings and Capture.

Preserve form labels, draft recovery, error/retry guidance, human approval, field provenance, private/public boundaries, score meaning and currency limits.
No data-fetch, write, auth, role, tenant or sharing predicate was changed by this copy pass.
An empty service-review state now says Not Set rather than implying an established recorded position.

Home has one empty-work message. Capture has one approval warning beside Approve & save, with the duplicate preview badge and instructions removed.
Player review and negotiation headings describe the information shown. Missing records and evidence remain explicit.

## Verification

- Baseline local browser pass: 92 agency/player/settings screen and viewport combinations.
- First complete production-build browser pass: 204 screen/viewport combinations, no reported browser errors, overflow, undersized controls or missing labels.
- Screenshots reviewed for agency Home, Network, player profile, service review and Capture on mobile.
- Final detail/Capture production-build browser rerun passed 40 screen/viewport combinations after the last copy refinement.
- Final npm run check passed: 1,633 tests, zero failures, TypeScript including fixture projects and a clean production application build; exit 0.
- Tests that asserted superseded wording were updated to the new text. Existing RPC, permission, tenant, approval and private-data assertions remain.
- No dependency or stylesheet changes.

## Release

Batch this frontend pass with the already verified public-profile backend source into one PR and one production release per existing Vercel project.
vercel.json disables automatic deployments only for fix/public-profile-visibility-boundary. Other branches, including main, retain the default deployment behaviour.
Required GitHub verify and browser_journeys checks must pass before merging. Inspect the resulting main commit and production aliases; do not launch duplicate manual builds.
Public-profile database/Edge rollout evidence is recorded separately in public-profile-visibility-2026-10-09.md.
