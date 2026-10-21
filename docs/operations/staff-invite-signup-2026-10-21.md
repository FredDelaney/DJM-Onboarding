# Staff invitation signup repair

The production staff-registration endpoint was rejected by the legacy auth INSERT trigger, which treated non-allowlisted staff as players and required player privacy acknowledgement. Auth applies admin app_metadata after its initial user INSERT, so an app_metadata-only branch cannot repair real registration.

The additive migrations preserve the existing player trigger body. A new staff path checks the actual 64-character invitation capability against the private invitation hash, matching email, pending status, expiry and active agency. It creates a neutral legacy profile without player onboarding or global admin elevation. The existing token-checked completion RPC grants the recorded agency membership. The registration handler removes the temporary invitation capability before completion and sign-in. Role claims from the client are never used to grant access.

The join page reads structured function errors, explains retryable failures and switches existing accounts to sign-in when the endpoint returns account_exists with HTTP 409.

## Evidence

- Reproduced the original privacy failure from production Auth and Postgres logs.
- The unfixed database fixture failed staff registration. The additional fixture reproduced Auth's INSERT-before-app_metadata ordering and failed before the follow-up fix.
- 26 focused regression cases and all 1,890 tests passed. Type checking and a webpack production build passed.
- Staging and production synthetic HTTP registrations returned 200, password sign-in returned 200 and logout returned 204.
- Production SQL confirmed one active Admin membership in the invited agency, zero player records, a neutral legacy profile and no retained invitation token.
- A further production signup and profile edit preserved the active team identity and updated display name. All synthetic accounts and invitations were removed afterwards.
- Production agency-staff-invite-public version 13 and staging version 6 share bundle 3c038c1f4eea50e67ab116569059b8c2840e40499979209561070547b79d6a10.
- Existing production invitation links were preserved. No customer passwords or roles were changed.

Staging's historical Tell permission trigger was restored using the already tracked 20260928162000_fix_tell_djm_permission_tenant_conflict_v1.sql before its HTTP verification. Production already had that tenant-scoped trigger. The three staff-repair migration history rows are aligned to their canonical filenames without rewriting historical migrations.

Independent review reproduced a profile-edit regression in the legacy team-sync trigger. The third migration keeps active tenant staff in the team registry without elevating their global profile role; inactive memberships retain the previous deactivation behaviour. The reviewer approved the final fix after running the focused tests.

Local browser launch is blocked by the execution host's Unix socket restriction. The extended staff-invite browser journey therefore requires the browser_journeys CI gate; do not present local browser checks as passed. The local build uses webpack because this isolated checkout shares node_modules through a symlink, which Turbopack rejects.

The bundle QA script also cannot resolve webpack's percent-encoded dynamic-route paths in this local output; its CI/Turbopack check remains pending. GitHub branch and tree writes returned HTTP 403, Resource not accessible by integration. The backend repair is live; the improved frontend error messages and source sync are prepared but not published. The recovery patch targets main 05d1625b09dcd6d0baa7293bbdffa68b70dca4d4. Run the required CI gates before merging it.

## Reconciled platform-audit follow-up, 21 October

The earlier host and publishing limitations above describe the supplied archive's original run. This follow-up checked fresh main fe061994, confirmed the local worker byte-identical to live stage v6/prod v13 and verified the three canonical ledger rows and repaired function hashes in both projects. The frontend recovery and extended local browser checks now run successfully on this host.

A live isolated staging repeat caught missing Auth trigger wiring: membership was present but no legacy profile was created, and a profile PATCH returned zero rows. The guarded 20261021170117 migration restores only missing verified wiring and was applied to staging, with its ledger aligned to the canonical filename after exact SQL hash verification. Production's enabled canonical trigger was inspected and preserved. The repeated new/existing account canary required exactly one owned profile update, both intended agency roles, active renamed team identity, neutral global role, no player row and no temporary token. Wrong account and inactive links were denied. All QA users/agencies/invitations and temporary credentials were removed.

See platform-audit-2026-10-21.md and the review PR for this run's actual tests, remaining live acceptance requirements and frontend release status. No old migration or live worker was replayed.
