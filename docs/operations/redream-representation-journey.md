# New-player representation document acceptance

Scope: DOC-01 / DOC-06 / UI-11 / UI-12, stacked on draft PR 272. The complete 46-item/17-surface programme remains active.

## Change

The existing representation editor already supports a new document subject without importing or changing a roster player. Reuse is validated rather than replaced. One focused browser journey now protects blank negotiated fields, actionable missing-field guidance, invalid-date correction, custom clauses and agency colours, explicit review, denied sharing before save, a rejected save that retains the draft, retry, Library reopen, real Word/PDF export and template reuse for a different recipient. Template creation clears personal details and review while retaining agency terms. No AI, roster write, share, send or signature is implicit.

The actual staging review exposed two small copy defects: a single outstanding issue said `1 things` and `1 checks`. Both now use the singular; the journey asserts singular and plural states. No contract wording, architecture, document feature, schema or dependency changes.

## Local evidence

- Existing document collection/export browser checks pass for all five document kinds, Northstar and Atlas branding, long invoice content, logos, palettes, Unicode, links and export/share gates. Eleven Word and eleven PDF files are generated. All 18 baseline representation pages are rendered and inspected across both brands.
- The new representation journey passes at 320/390/768/1440. Its customised long agreement produces five Word and five PDF pages, all rendered and inspected. OOXML confirms editable, unprotected Word, correct agency colour/identity, resolved variables and no prior roster subject. PDF is regenerated from the editable application draft; it is not an interactive PDF form.
- The 24 existing document/model/database tests pass. Final `npm run check` passes 2,143 tests, every TypeScript project, production build and gzip 145,922 / 150,000 bytes. The final focused browser rerun also passes after the copy fix and singular/plural assertions.
- The new script is part of the existing browser CI chain, with its existing `/tmp/redream-platform-programme/representation-journey` artifact path. No framework or dependency is added. Generated QA route/type drift is excluded from the commit.

Private evidence: `/tmp/redream-platform-programme/representation-journey/`, including `before/`, `journey/`, `final-journey/`, `hosted/`, `document-tests.log`, `final-browser.log` and `final-check.log`. Synthetic local runs are labelled as such.

## Actual staging journey and cleanup

On the existing signed-in Northstar technical fixture at 390px, create `[QA] Representation Journey 2026-10-26-R1` without a roster import, correct the required fields, save, return through Library, reopen, append an explicitly synthetic paragraph, review and save again. Read-after-save confirms revision 2, exact 1 November 2026 through 31 October 2027 dates, custom clause, reviewed state and inherited Northstar branding. No roster record, global brand change, AI action or recipient link is created. Review is technical QA of synthetic wording, not acceptance or signature of an agreement.

Actual Word/PDF downloads are rendered: four Word pages and five PDF pages, all inspected. Both retain the saved synthetic party, custom clause and tenant identity, with no unresolved variables or old player names. Word has no editing protection. Normal Word/native-PDF pagination differs; no text is lost. Tenant header/footer furniture is verified directly rather than inferred from multi-image display omissions.

The exact QA document `ef0196f5-bd96-45b3-af9f-a9afe0132b2e` is archived through its normal Activity confirmation. Database read-after and the empty Library agree: revision 3, archived at `2026-10-26 22:49:16.905911+00`, zero active documents and zero shares. One archived synthetic row and its two existing created/saved activity events remain intentionally; this is not zero database footprint. All 13 retained business-data projections match, as do the three original document/share/event projections excluding that exact canary and its dependencies. The established public-profile projection excludes contract_expiry. Evidence: `hosted/acceptance.json`, `hosted/exports.json`, actual files/renders and archive screenshot. Northstar remains a technical fixture, not independent-agency acceptance.

This journey uses the preceding accepted staging source f925a9d. The only production-source delta in this increment is the two copy corrections above; exact pushed-head staging/read-only copy acceptance is recorded separately below when complete.

## Open save-confirmation gap

Source inspection establishes a separate unresolved case: the document coordinator currently uses a read deadline around Save. A stopped client request does not prove that the server rolled back. An initial create that actually committed can meet a duplicate-ID error on retry; an update can meet the existing revision guard. The ordinary explicit-rejection/retry test above does not prove lost-response recovery. The 100-row Library is not an exact document reader, so absence from that list cannot prove an unsuccessful save.

Keep DOC-01/DOC-06/UI-12 active. The next focused reliability slice should reproduce uncertain create/update acknowledgement, preserve the draft, confirm the exact saved document within the same authorised tenant, and distinguish matching, different, missing and still-unknown versions without automatic repeated writes or silent rebasing. Reuse the existing stable ID/revision protection and bounded-write helper. Any exact-reader/backend addition requires a separately reviewed additive manifest and permission tests. No such migration or backend implementation belongs to this increment. DOC-08 provider/external-action acceptance also remains separate.

## Frontend manifest and release boundary

Frontend source: only the two copy fixes in `components/AgencyDocumentStudio.tsx`. Supporting files: `scripts/representation-document-browser-qa.mjs`, `package.json`, `.github/workflows/ci.yml`, this manifest and the authoritative tracker. Parent PR 272 source f925a9d passes full CI run 40380637726 and remains the immediate staging rollback.

Publish as a draft based on `codex/redream-task-editor-focus`. Stage only the exact pushed SHA on project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `jesseedge10-8415s-projects`; independently verify source/project/READY before assigning `redream-systems-staging-jesseedge10-8415s-projects.vercel.app`. Preserve the project branch rule with the existing deployment-only ignored-build override. Verify the corrected copy read-only, without saving another canary, and retain new-head CI.

No migration, function/worker, Supabase configuration, secret, provider, schedule, production operation, external send/sign or GitHub merge. Never replay historical migrations or the excluded relationship migration. Ordinary-staff, physical iPhone/Safari, real provider/media, independent-agency and the wider UI/state gates remain open. No claim of legal validity or whole-programme completion.


## Final installed checkpoint

Draft PR 273 source `f0ce416279a6cdfce6bbbd8c3390c7a087a86036` is READY on staging at immutable `redream-systems-staging-5dle4wr30-jesseedge10-8415s-projects.vercel.app`, deployment `dpl_nAZPKj2X7FxmHrhcyY7ebNRHQz5f`. Full source, project, preview target and canonical staging alias are independently verified. The immediate rollback remains PR 272's accepted nvxfejqjb source f925a9d, with full CI 40380637726.

The exact-head signed-in 390px check displays both `1 thing to check before sharing` and `1 check before sharing`. Share remains disabled for the unsaved/unreviewed draft; page and viewport widths are both 390. The synthetic copy-check draft is discarded through normal confirmation without Save. Final SQL confirms zero active documents, zero saved copy-check documents, zero shares and the original QA document still archived at revision 3. All 13 original business projections are reverified; the three original document projections already matched after archive. Inspected screenshot: `hosted/exact-head-review-390.png`; final release evidence: `hosted/release-final.json`. No extra canary is saved.

Exact source CI run 40415733331 passes both verify and full browser journeys. Preserve that run; the installed documentation checkpoint continues on `codex/redream-document-save-recovery`. No save-confirmation feature is implemented in this checkpoint. The next coherent slice is the uncertain-save gap recorded above, after checking this confirmed-live CI run and fixing only real failures. All broader programme/role/provider/device/independent-agency limits and production boundaries remain unchanged.
