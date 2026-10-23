# Retain profile statistic choices through the editor save

Status: actual staging failure reproduced and repaired locally. Hosted acceptance and CI remain open. PLY-02 follow-up to PR 255; production is unchanged.

## Actual failure and bounded repair

The first publication-trigger repair correctly preserves approved snapshots, but the normal editor's preceding settings upsert still fails: `private.normalize_cv_key_stats()` converts an empty automatic array into 55 combined senior/reserve appearances. The next publication treats these as custom figures. Its exact pre-repair body hash is `f46035899762c318bb9880511833ecad` on both staging and production.

`agency-os` already authorizes the active tenant, player and operator before its service-role settings upsert. Preserve this existing write path and its sanitized editorial pairs. Only the actual database `service_role` can use the preservation path; a request claim alone cannot enable it. Arrays remain bounded to six non-empty string label/value pairs of at most 50 characters; extra metadata is discarded. Empty arrays remain automatic; selected source references remain separate and retain their existing validation. Other database roles retain the old authoritative filtering. No new writer, permission, table policy or tenant bypass is added.

## Exact manifest

Apply only `20261023193512_preserve_profile_stat_editor_choices_v1.sql` for this increment. It patches only the verified trigger body, retaining its owner, empty search path and owner-only execute ACL. Unexpected body/configuration/grant drift aborts. There is no frontend or worker change, data rewrite, automatic republishing or reinterpretation of existing custom values.

The separate snapshot migration `20261023191512_preserve_approved_profile_stat_snapshots_v1.sql` is already installed on staging with canonical version and retained ACL. Do not replay it. PR 254's frontend `151ba22` is already READY at deployment `dpl_845i7uFoKSgkbFgZTrS8xAg4YaoE` on the canonical staging alias; rollback target is `dpl_Bo3dRZwtNMMH2kenqvXYiQ4JjnSa`. Staging workers remain agency-os 56 and player-profile-public 9. Production promotion remains a separate explicit gate.

## Verification and remaining acceptance

The existing PostgreSQL release test now includes the actual settings trigger and service-role upsert before the real publisher and publication trigger. Sixteen focused cases pass, including reproduction of both failures, automatic/selected/custom/empty preservation, zero values, metadata stripping, invalid array rejection, spoofed browser claim rejection and definition/configuration/ACL drift refusal. No mocked settings writer substitutes for this regression.

`npm run check` passes all 2,000 tests, all TypeScript projects, production build and bundle limits (143,963 / 150,000 workspace gzip bytes). No additional dependency or framework is introduced.

Staging PR 254 passes full CI. At 390x844 the actual Northstar preview fills x=0/y=0/390x844, its 44px Close remains at y=10, content scrolls independently (1688px) while the underlying page remains at 1299px, and Escape restores opener focus and page scrolling at the same position. The editor is within the viewport (x=8/y=32/374x780), its 44px save/publish actions are reachable and page width remains 390px. Screenshot `/tmp/redream-platform-programme/staging-preview-fixed-390.png` was visually inspected. These are hosted browser checks, not physical iPhone acceptance or acceptance of all other overlays.

Before hosted acceptance, apply only this exact migration with bounded locks and the canonical ledger version, then use the synthetic player's existing Use latest stats and normal publish controls. Compare settings, stored snapshots, unauthenticated public reads and actual rendered automatic/historical/custom PDF downloads. Unpublish and clean up only the recorded synthetic fixture; verify the seven original player rows still match their baseline hash. Full programme and production acceptance remain open.

## Rollback

Retain the exact original function definition and ACL before applying. Restoring only that original body leaves data, grants and migration history intact, but reintroduces the proven editor-choice corruption. Do not clear existing settings or rewrite customer snapshots as a rollback.
