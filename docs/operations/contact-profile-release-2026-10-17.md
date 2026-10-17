# Contact and player profile release, 17 October 2026

Jesse authorised continuing the prior build, preserving all current production changes, finishing the photo/CV and contact controls, and publishing the result.

## Recovered source

The live domain was on `dpl_8p9oNxpQHRsaws3XjtzFYqjwyDkq`. The old working checkout and GitHub main were behind that release. Its complete 385-file runtime source was recovered through a separate preview build without changing production. All 255 comparable source hashes matched; the build service adds the legacy project name to the recovered `vercel.json`, which was excluded from that comparison.

The existing signed photo upload backend is `agency-os` v42, with JWT verification enabled. The contact RPC and migration `20261016222641_record_contact_details_v1` were already deployed. Their current source was recovered; this release does not require applying a database migration or changing the Edge Function.

## Result

- Player, recruitment player and club contact pages have the same WhatsApp/email actions and compact editable contact form. Links update after a confirmed save. Clearing, narrow patches, country-code validation, stale-edit recovery and account isolation use the existing tenant-scoped contact RPC.
- The empty player photo is directly clickable. Existing photos can be replaced. Uploads use a signed JPG/PNG/WebP flow, capped at 8 MB, with retry of the same upload/attachment rather than silent duplicate writes.
- Club profile stats show the current CV selection. Using latest statistics writes only the stat selection, preserves other presentation fields, includes zero values and makes the publish step clear. Source links correspond to the displayed selection.
- The recovered profile tools, calmer related-record layouts, AI preparation and deferred workspace loading are retained.

## Independent review and fixes

A read-only independent review identified three important issues. Each was reproduced by a browser regression before correction:

1. Conflict recovery retained an untouched stale channel. Recovery now merges the edited fields with the latest values for untouched fields.
2. The existing contact verification checkbox was bypassed by the new contact save RPC. Explicit verification remains available for unchanged email, WhatsApp and phone values.
3. Custom CV statistics could show the automatic source URL. Automatic and selected-stat provenance are now separate; custom figures do not claim an automatic source.

The data-panel refresh flag is read through a ref, and asynchronous reload results check the current request generation. Background data reloads retain the profile draft. An older queued-refresh test counted Next.js's empty route announcement as an application error; it now rejects non-empty alerts instead. Literal-source assertions for mail links and the relocated tools menu were superseded by behavioural URL and keyboard tests.

## Validation

- `npm test`: 1,746 tests passed, zero failures. Test concurrency is limited to four to avoid exhausting process capacity in constrained runners.
- Real-component browser checks passed for all three contact kinds, clearing, validation, concurrent changes, account switching, legacy contact verification, signed photo upload, CV stat selection and zero values.
- Ten AI/profile scenarios passed, including queued updates, missing context, failure/timeout recovery, links and responsive layout.
- Club/contact/deal details, five-width player-data workflows, Home follow-ups and career-plan approval recovery passed.
- Profile tools-menu placement and Escape/focus recovery passed at 320, 390, 768 and 1440 pixels. Populated-profile screenshots and editing checks cover the same widths. The focused recovery rerun passed after the test explicitly expanded the existing older-links disclosure before checking archived links.
- The final clean `npm run typecheck` passed, including all three standalone fixture projects. No temporary browser-fixture routes were present.
- The contact helper preserves the raw empty-string baseline for optimistic concurrency; its unit regression was demonstrated failing before the correction and passing afterwards.
- `npm run build` passed with Next.js 16.3.8. All 49 static-page generation tasks completed; the production route list contains no test fixture routes.
- `npm run check:bundles` passed: the agency workspace entry is 141,776 gzip bytes against a 150,000-byte budget, across nine chunks.

## Production release

- Deployment `dpl_AWM5CNpASQyW5XdW6tEQJTxTmY7R` reached READY and owns `app.djmsports.com`, confirmed by a fresh domain lookup. It was built from 390 source-file references, using the normal `npm run build` and the existing production environment.
- Release runtime-source fingerprint: `948062f8fbe77fe1ac25d172b4c4a4743bf90a0a79227a03b97ca9613974fa3f` (SHA-256 of sorted path/SHA-1 pairs).
- All 257 source hashes exposed by the truncated deployment file-tree response match the submitted source. The response omits deeper paths and some component entries, so this is a partial independent comparison.
- The live `/`, `/sign-in`, `/home`, `/workspace/djm`, `/settings` and `/career` documents and all initial JavaScript/CSS assets returned HTTP 200. Live initial scripts contain the production Supabase project and no fixture backend URL. These unauthenticated checks do not assert successful signed-in customer workflows.
- The actual live sign-in page rendered at 390 and 1440 pixels, with visible email/password fields, no horizontal overflow and no browser page errors. The local headless browser required its proxy-certificate exception; the separate HTTP/asset audit used the runtime's trusted TLS configuration. No account was used or form submitted.
- No error/fatal runtime logs were returned for this deployment in the queried 30-minute window immediately after the smoke check. This is a narrow observation, not an uptime guarantee.

## Limits and handover

Browser journeys use synthetic records. A signed-in check on Jesse's real iPhone has not been performed. GitHub writes are unavailable, and the Mac's remote connection is offline. Preserve this complete release source and do not deploy old main over it.

The verified source is committed locally as `398df803f089d875752d25a0abcd01b9f98fae20`. A source archive and complete Git-history bundle were created and the bundle was verified. Automatic approval review rejected uploading either archive to the separate temporary Vercel workspace, because that copy of private source/history was not explicitly authorised. No retry or alternative transfer to that destination was made. The workspace was stopped. The normal production source deployment remains authorised and proceeded through the existing project; the complete archive and history are available locally for download.
