# Club dossier and approved contract snapshot

Scope: PLY-04 / UX-03 / UX-04 / UI-04 / UI-17. Stacked on draft PR 265 at `6ca2c3e89df3d8377945130572d57c298579bac4`. All 46 programme items and 17 UI surfaces remain retained. Production remains unchanged.

## Problem and result

Actual staging club-link creation succeeds but its `/s/<token>` URL is blocked by the shared-host tenant route gate. Local keyboard testing also reproduces focus escaping the share dialog. The existing profile preview is hard to find, missing contract expiry is overlooked for `under_contract`/`on_loan`, and an absent portrait reserves a large empty panel. A recorded contract date is omitted from approved public profiles and every recipient/export path.

The existing dossier now has a visible Preview action, specific optional video/research guidance and correct missing-expiry guidance. The existing share composer owns focus, Tab/Escape, busy dismissal and background scroll, including its nested selected-version preview. Failed link creation is visible inside the dialog, preserves club/note selections and retries only on explicit activation. The route gate admits only a single token segment; private, root and nested paths stay closed. The recipient and PDF omit duplicate identity introductions and empty portrait panels, retain meaningful authored introductions and format the existing status. A failed web portrait releases its empty panel.

Contract expiry follows the existing approval boundary: a nullable snapshot column, with no default or data backfill, is written from the verified canonical player only by deliberate publication. Club versions copy the approved general snapshot and validate any expiry against it. Immutable old versions never borrow a live date. Both existing public Edge projections and the PDF/web renderer use that snapshot field; private terms remain excluded. A missing or invalid date is omitted. No date/status/footage/source is invented.

## Exact deployment manifest

1. Frontend branch `codex/redream-club-dossier-flow`, after its full local check, to staging project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `jesseedge10-8415s-projects`. Assign only the canonical staging alias after checking READY, project and exact full SHA. Immediate frontend rollback: `dpl_2uKap5VBvSx2vJi22QPgUBFcZXUt` / `36d385f551a4b91aea73cce7ae72e500c6524c57`.
2. Apply only `20261025133959_include_approved_profile_contract_expiry.sql` to staging `ltvmopvarlnidiozvpow`. SHA-256 `46b10d472869d1d1cbaed26856baabc3244e28a5d22925a52ba33ad0b3c2129d`, complete statement MD5 `ce9fb2802ff7ea2b8238ccb3e17ed72d`. No history replay/db push; excluded relationship migration is never executed. The atomic migration refuses unknown bodies and an incompatible pre-existing column, verifies every scoped replacement, preserves OID/owner/ACL/configuration/definer and supports exact replay.
3. Deploy the existing `agency-os` bundle (8 files, JWT true; before version 61), `player-profile-public` (4 files, JWT false; before 9) and `club-share-public` (2 files, JWT false; before 6). Only the approved-field allowlists change. Preserve captured hosted file bytes for the other files, including the public function’s older unused refresh-outcome export and club entrypoint newline; no unrelated bundle drift is promoted. Exact payload file hashes are recorded in private `edge-manifest.json`; existing auth/tenant predicates stay. Deploy these after the schema/version guard. No secrets, config, schedules, provider or production changes.
4. Verify old profile hashes excluding only the newly added null column; old versions are unchanged. Deliberately republish only the disposable M1 fixture, then check actual general/token/version/PDF parity, revocation/unpublication, audit and exact cleanup. Compare function metadata, canonical migration ledger and advisor finding sets.

| Function | Before body MD5 | Installed target MD5 |
| --- | --- | --- |
| `public.platform_server_publish_player_profile_snapshot(uuid,uuid,uuid,jsonb)` | `14d97ec779ff7e208132581dfb9cf217` | `89bc32e73621efe8a584cbb68baa45c0` |
| `private.protect_public_profile_admin_fields()` | `892f6bbd5a84852275ca2224c2048357` | `37f58edc12aee45874525506027ae062` |
| `private.visible_public_player_profile(jsonb)` | `ccd5fa0ef4523b2f16a7bd96aef54632` | `addb0207b379bfd89e231a4d3d19ecf5` |
| `private.protect_player_profile_version()` | `c1f38d64bd79826d571e9d4de2505ec6` | `c7e881bd87863575a8a5845f745590f9` |
| `public.get_club_share(uuid)` | `b60b8a295564f1cd714504c99e9dd468` | `61edbdb4a3021e7c84d89a5a3e70ba8b` |
| `private.enforce_public_profile_publish_rules()` | `c43d7b83aaec7b1465cd1611e133625d` | `921841253cbbbf225e78ccce58588aa5` |

Recovery: retain exact before definitions and Edge bundles in the private current-run evidence directory. Reconcile known installed hashes and unchanged metadata before restoring a function. Do not drop the additive date column or erase reviewed snapshots. Backend/frontend recovery is a reviewed staging operation; production requires its separate release decision.

## Validation and current evidence

- Focused actual PostgreSQL, public HTTP/visibility, immutable-version, dossier helper, PDF layout/story, route-gate and missing-guidance tests: 76/76 pass. Includes no backfill, canonical-only publication, forged-date/admin/foreign denial, version consistency/immutability, old version omission, revoked/expired/unpublished denial, strict dates and unknown-function atomic refusal.
- Actual browser share/preview flow passes 320/390/768/1440: focus containment/return, nested preview, independent scroll, no busy dismissal, one request after double activation, visible failed-write feedback with preserved club/introduction and explicit retry, approved date/media visibility, no empty portrait panel/overflow and reachable 44px actions. Existing header contrast/editing checks pass at four widths.
- Actual long-story editor save/reopen/preview and PDF download pass at 390/1440. Local exported pages 1 and 2 were rendered and visually inspected; full narrative endings, context, zero statistics and layout remain intact. Further hosted export proof remains pending.
- Full local `npm run check` passes 2,129/2,129 tests, all TypeScript projects, production build and bundle limits (workspace gzip 144,780 / 150,000 bytes); staging rollout, hosted canary, exact cleanup and new-head CI remain pending. Original staging records are preserved; actual M1 fixture and its one synthetic share persist solely for that acceptance.
- Parent final PR 264 and PR 265 full CI now pass at `b0c8c6ccbb6bad2447a31eb16606788c862b418a` / run `40195449460` and `6ca2c3e89df3d8377945130572d57c298579bac4` / run `40196496039`.

Private evidence directory: `/tmp/redream-platform-programme/player-dossier-pass/`. Before screenshots 01 through 06 and audit notes record the actual flow, including the blocked token recipient. No existing original fixture has video or Transfermarkt data, so real provider playback is not accepted. Northstar is a technical fixture; independent-agency, ordinary-staff browser, physical iPhone/Safari and remaining programme acceptance remain open.
