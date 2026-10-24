# Retain profile statistic choices through the editor save

Status: settings repair applied to staging and automatic save/publication accepted. Shared-host route and SVG-logo export blockers are repaired locally; their final frontend/CI/hosted acceptance remains open. PLY-02/PLY-04 follow-up to PR 255; production is unchanged.

## Actual failure and bounded repair

The first publication-trigger repair correctly preserves approved snapshots, but the normal editor's preceding settings upsert still fails: `private.normalize_cv_key_stats()` converts an empty automatic array into 55 combined senior/reserve appearances. The next publication treats these as custom figures. Its exact pre-repair body hash is `f46035899762c318bb9880511833ecad` on both staging and production.

`agency-os` already authorizes the active tenant, player and operator before its service-role settings upsert. Preserve this existing write path and its sanitized editorial pairs. Only the actual database `service_role` can use the preservation path; a request claim alone cannot enable it. Arrays remain bounded to six non-empty string label/value pairs of at most 50 characters; extra metadata is discarded. Empty arrays remain automatic; selected source references remain separate and retain their existing validation. Other database roles retain the old authoritative filtering. No new writer, permission, table policy or tenant bypass is added.

## Exact manifest

Apply only `20261023193512_preserve_profile_stat_editor_choices_v1.sql` for this increment. It patches only the verified trigger body, retaining its owner, empty search path and owner-only execute ACL. Unexpected body/configuration/grant drift aborts. There is no worker change, data rewrite, automatic republishing or reinterpretation of existing custom values.

This exact migration is already installed on staging with canonical version `20261023193512`, source SHA256 `08f4664380b815fd4bcb071a05f5ee047181684c16ecb2b8a94838a69aa2ce2c` and applied wrapper MD5 `618e4b8ff1b661e36134604e6bf01058`. Installed trigger body MD5 is `59fb8aa073bf49b5d238a054677f35c1`; owner/configuration/ACL and security findings are unchanged. Do not replay it. Normal UI Use latest stats, editor save and publish now retain empty automatic settings and store/publicly return the reviewed reserve 24 appearances, 0 goals, source, period and date. The seven original player rows retain their baseline hash `6e9392dc6b3dc877bfb90c47aeedbb93`.

Two actual recipient/export blockers require the frontend from this PR as well: `TenantRouteGate` now admits only the existing single-segment `/p/<slug>` public route without requiring a private domain mapping. The public endpoint still enforces published/verified allowlisted snapshots and tenant branding; legacy/private/nested routes remain blocked. `downloadClubCv` reuses `documentLogo` to convert approved SVG assets to bounded PNGs before PDF rendering, avoiding unregistered font families embedded in SVG logo text. Unavailable assets retain the existing agency text fallback. No new image library, font dependency or parallel exporter is introduced.

The separate snapshot migration `20261023191512_preserve_approved_profile_stat_snapshots_v1.sql` is already installed on staging with canonical version and retained ACL. Do not replay it. PR 254's frontend `151ba22` is already READY at deployment `dpl_845i7uFoKSgkbFgZTrS8xAg4YaoE` on the canonical staging alias; rollback target is `dpl_Bo3dRZwtNMMH2kenqvXYiQ4JjnSa`. Staging workers remain agency-os 56 and player-profile-public 9. Production promotion remains a separate explicit gate.

## Verification and remaining acceptance

The existing PostgreSQL release test now includes the actual settings trigger and service-role upsert before the real publisher and publication trigger. Sixteen focused cases pass, including reproduction of both failures, automatic/selected/custom/empty preservation, zero values, metadata stripping, invalid array rejection, spoofed browser claim rejection and definition/configuration/ACL drift refusal. No mocked settings writer substitutes for this regression.

`npm run check` passes all 2,000 tests, all TypeScript projects, production build and bundle limits (143,963 / 150,000 workspace gzip bytes). No additional dependency or framework is introduced.

Staging PR 254 passes full CI. At 390x844 the actual Northstar preview fills x=0/y=0/390x844, its 44px Close remains at y=10, content scrolls independently (1688px) while the underlying page remains at 1299px, and Escape restores opener focus and page scrolling at the same position. The editor is within the viewport (x=8/y=32/374x780), its 44px save/publish actions are reachable and page width remains 390px. Screenshot `/tmp/redream-platform-programme/staging-preview-fixed-390.png` was visually inspected. These are hosted browser checks, not physical iPhone acceptance or acceptance of all other overlays.

Before remaining hosted acceptance, deploy the exact reviewed frontend after checks; do not replay the installed migrations. Compare the synthetic player's settings, stored snapshots, unauthenticated public reads and actual rendered automatic/historical/custom PDF downloads. Unpublish and clean up only the recorded synthetic fixture; verify the seven original player rows still match their baseline hash. Full programme and production acceptance remain open.

The existing public-host test now renders the actual route gate and checks the public slug route plus retained legacy/private denials and existing entrypoints. The existing four-width profile browser test downloads automatic/selected/custom PDFs with an SVG logo containing the actual problematic CSS font stack, and asserts the 300px raster logo is embedded in every file. Its first fixture attempt used a CSP-blocked hostname and only proved the fallback; the corrected fixture uses the existing approved storage host and verifies actual logo inclusion. No fallback-only run is claimed as logo acceptance.

All 2,003 tests pass with the route regression; the 14 focused actual PDF/gate tests, subsequent final TypeScript projects and production build pass. The corrected four-width browser/export check passes; all three rendered first pages were visually inspected with the actual logo and context. PDF errors now show a short retry message rather than internal renderer details. React review confirms no new effect or request lifecycle, an exact route allowlist, the existing bounded image conversion/cleanup and retained busy/retry behavior. Full CI and the actual hosted recipient/selected/custom/PDF checks remain required on the final frontend revision.

Frontend `c25a034` is READY on staging at `dpl_83jN7Uy3ySGNztujWgmFW7sK2unt`; its verify job passes. The public slug now opens, and normal automatic and selected-historical publication agree across settings, stored snapshots, unauthenticated API, public web and actual branded two-page PDF downloads. Historical Goals 0 retains 2025 / QA Former FC / QA historical evidence / 20 January rather than inheriting current output. The canary's custom-entry step then reproduced an existing UI bug: Apps 7 was saved alongside old selected refs and the next snapshot still published historical Goals 0. Typing custom key numbers now explicitly clears selected refs in the same form update; the editor explains selected mode before editing. The existing browser check verifies this transition, saved payload, displayed value and removed historical attribution. Final checks/rollout and actual custom/denial/cleanup acceptance remain open.

The custom-transition repair passes the full 2,003-test, TypeScript, production-build and bundle check again, plus the expanded existing four-width profile browser/export check. It changes only the explicit custom-input transition; opening/saving an unchanged historical selection still retains it.

## Rollback

Retain the exact original function definition and ACL before applying. Restoring only that original body leaves data, grants and migration history intact, but reintroduces the proven editor-choice corruption. Do not clear existing settings or rewrite customer snapshots as a rollback.
