# Player Profile editor, public link and PDF recovery

Status: focused staging acceptance passes. PR 256 product head `28bcc0791d4ae05f5551a5aee82328cc5489cb29` passes verify; full browser CI remains on its existing job. Production is unchanged. This is a PLY-02 / PLY-04 increment, not complete programme acceptance.

## Problems and resulting behavior

- The actual settings trigger converted an empty automatic selection into combined senior/reserve totals. The existing authorized service-role writer now retains automatic/selected/custom choices as bounded editorial pairs. Browser/legacy filtering, selected-reference validation, tenant/operator authorization and grants remain.
- Explicit custom input previously retained an earlier source selection, silently publishing that selection instead. Entering custom figures now replaces selected refs in one form update; opening/saving an unchanged selected profile preserves it. Editor guidance explains the current mode.
- Shared-host `/p/<slug>` links were stopped by the private domain gate. Only this exact existing single-segment public route is now allowed; the endpoint still controls approved, published, verified snapshots and tenant branding. Legacy/private/nested routes remain blocked.
- SVG logo text could contain CSS font stacks unsupported by React PDF. The export reuses the existing bounded document-logo raster conversion and agency text fallback. Errors use a short retry message. No new image library, font dependency or parallel exporter was added.

## Exact release manifest

Frontend: `28bcc0791d4ae05f5551a5aee82328cc5489cb29`, staging deployment `dpl_HPmFJBAcHXzDmeQrTN7n7cwjqEaK`, READY on `redream-systems-staging-jesseedge10-8415s-projects.vercel.app`, project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`. Immediate frontend rollback target is `dpl_83jN7Uy3ySGNztujWgmFW7sK2unt` (c25a034); that revision reintroduces the custom-transition defect. PR 254's earlier dialog build is `dpl_845i7uFoKSgkbFgZTrS8xAg4YaoE`.

The only additional migration for PR 256 is `20261023193512_preserve_profile_stat_editor_choices_v1.sql`, already installed on staging `ltvmopvarlnidiozvpow` under its canonical version. Source SHA256 `08f4664380b815fd4bcb071a05f5ee047181684c16ecb2b8a94838a69aa2ce2c`; applied wrapper MD5 `618e4b8ff1b661e36134604e6bf01058`. Verified old trigger body MD5 `f46035899762c318bb9880511833ecad`, installed body `59fb8aa073bf49b5d238a054677f35c1`. Owner postgres, empty search path and owner-only execute ACL are retained; unknown body/configuration/grant drift aborts.

PR 255's separate snapshot migration `20261023191512_preserve_approved_profile_stat_snapshots_v1.sql` is also already installed on staging; its source/hash/rollback are in `redream-profile-stat-publication-recovery.md`. Do not replay either migration or the three earlier programme migrations. Staging workers remain agency-os 56 and player-profile-public 9; there is no additional worker rollout. No secret, authentication configuration or schedule changed. Existing custom values/snapshots are not reinterpreted or backfilled; agents must explicitly review/reset/republish them.

## Local and CI evidence

The final full `npm run check` passes 2,003 tests, all TypeScript projects, production build and bundle limits (143,988 / 150,000 workspace gzip bytes). Sixteen actual PostgreSQL publication/settings tests reproduce both legacy trigger failures and cover automatic/selected/custom/empty choices, zeroes, invalid input, metadata stripping, browser-claim/foreign-context denial, raw-write filtering and drift/owner/ACL preservation. The existing public-host test renders the actual route gate, and the actual PDF layout tests also pass.

The expanded existing profile browser check passes at 320/390/768/1440, including photo/save recovery, selected-to-custom replacement and all three PDF downloads. Each PDF is asserted to contain the 300px raster logo from an SVG with the actual problematic CSS font stack. The first CSP-blocked fixture only tested fallback and was corrected before logo acceptance. No new framework/dependency was introduced.

PR 254 and PR 255 pass full CI. PR 256 product-head verify job `120824662926` passes; browser job `120824663133`, run `40077667261`, is still observed rather than restarted. No in-progress CI job is claimed passed.

## Actual staging working loop

The disposable Northstar player was created by the existing guarded agency writer. Actual signed-in UI save/publication, stored settings/snapshots, unauthenticated public responses, recipient web pages and downloaded PDFs agree for:

| Mode | Actual accepted result |
| --- | --- |
| Automatic | 24 reserve appearances, 0 goals, 2026/27, QA Example Reserves / QA Regional League, reserve source checked 20 October. The separate senior row is not added. Settings stay empty/automatic. |
| Selected | Historical Goals 0, 2025, QA Former FC / QA Historical League, historical source reviewed 20 January. Saving unchanged selection retains it. |
| Custom | Apps 7, no selected refs and no inherited period/source/date. Public web/PDF explicitly mark those fields unrecorded. |

All three actual two-page PDFs were downloaded from the hosted public profile, text/privacy checked and all six pages rendered/visually inspected. Northstar's logo, colors, agency identity and contact remain present. The private career sentinel is absent from all public responses, visible recipient content and PDFs. Actual custom recipient/editor width is 390px with no horizontal overflow; preview/dialog scroll/focus checks remain in the PR 254 manifest. Physical iPhone/Safari and independent-agency acceptance are still separate gates. Provider refresh failure used recorded-evidence fallback; this is not acceptance of a live football provider.

Normal UI unpublication returns `{data:null}` to unauthenticated callers and shows Profile unavailable to the recipient. A separate rollback-only fixture created through the actual service-role agency writer is rejected by the real publisher as unverified; browser publisher access remains denied. A direct edit to protected verification fields was also rejected and rolled back; no guard was disabled. Browser recovery used a fresh tab after the old debugger detached, not an authentication or privacy change.

## Cleanup and remaining work

The canary player `ade1f219-6996-45bb-ae53-e33595faec8c` was unpublished and removed with exact ID/tenant/name/no-user checks, external-record guards and before/after baseline verification. Its profile, settings, career rows and staff tags are absent. The original seven players match full-row hash `6e9392dc6b3dc877bfb90c47aeedbb93`. Its original creation activity event and audit records are deliberately retained; no claim of zero audit footprint is made. The unverified fixture was fully rolled back. The removed public slug still returns `{data:null}`. Security findings are unchanged excluding observation timestamps.

Evidence is under `/tmp/redream-platform-programme/hosted-club-stat-pdfs/`, `staging-public-custom-390.png`, `staging-public-unpublished-390.png` and the guarded canary scripts/results. Complete final CI, then continue PLY-03 sourced review and the whole agency loop in the authoritative programme plan. Do not promote production without the concrete reviewed release gate, or mark remaining provider/device/role/document/token-share work accepted by this canary.

## Database rollback

Preserve the actual original definitions/ACLs. Restore only reviewed trigger bodies if deliberately required, leaving profiles, data and migration history intact. Restoring either old body reintroduces a proven statistics corruption bug; do not use data clearing or customer snapshot rewriting as rollback.
