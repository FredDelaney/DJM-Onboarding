# Mandate journey and opening facts

Scope: DOC-02 / DOC-06 / UI-11 / UI-12, stacked on draft PR 274. The complete 46-item/17-surface programme remains active.

## Observed problem and change

The existing mandate flow already supports an agency, club or player granting authority, an unlinked new player subject, territory, term, negotiated commission, editable clauses, explicit review and branded exports. Those implementations are retained.

Actual baseline exports expose a long-content defect: a 22-line territory field fills two opening PDF pages in a half-width metadata column and then repeats in the full body. The opening facts also omit the fee arrangement. This is a concrete document-reading problem, not a reason to replace the editor or invent contract terms.

The shared `documentBrief` now includes the existing commission field. Long territory/fee values reference the actual corresponding section title only when that section body includes the exact field variable and therefore still renders the full value. Renamed headings remain accurate. If the user removes the variable, the complete field stays in the opening facts; no value is truncated, hidden or silently moved to a nonexistent section. Preview, editable Word and PDF inherit one consistent result. No wording, schema, field, review, sharing or authority default changes.

## Focused acceptance

One script joins the existing document fixture/browser chain: `scripts/mandate-document-browser-qa.mjs`. Synthetic agency, club and player principals exercise blank negotiated values, a new subject without roster import, required-field focus, invalid-date correction, unfinished-clause review/share denial, four editable clauses, explicit review/save, Library reopen and retained principal/scope/fee values. Each case passes 320/390/768/1440 preview bounds and real editable Word/PDF downloads. Northstar and Atlas identities/colours remain separate. The player-principal case also saves/reuses an agency template for a new prospect and a different principal type; old names/term and review approval do not carry forward. Existing explicit template terms still require review. No AI, roster, share or send action is implicit.

The new model regression fails the preceding source. It protects short-fee visibility, long-value references, renamed headings and complete fallback values when a custom body no longer contains the variable. The initial fixture's trailing-space assertion is corrected to reflect the existing renderer's deliberate whitespace trim; no product wording is changed for that fixture.

Baseline long sample: Word four pages, PDF five. Revised identical content: Word three pages, PDF three. Short agency/player cases remain one Word/two PDF pages. All 12 final rendered pages are visually inspected. Text checks prove every one of the 22 scope entries and 12 fee notes appears exactly once in the long exports, and all pages retain tenant header/footer. Word editing protection is absent, and old roster subjects/unresolved variables/other product identities are absent. These are synthetic layout examples, not legal-validity or execution evidence. PDF is regenerated from the editable application draft, not a fillable form.

Evidence: `/tmp/redream-platform-programme/mandate-journey/`, including `before/`, `after/`, `final/`, baseline/final browser logs, model regression logs, render-verification JSON and the full-check log when complete. The final template-reuse script rerun exports the same inspected content before reusing it. CI retains the existing seven-day artifact policy.

## Frontend release manifest

Only `lib/agency-documents.ts` changes product source. Supporting changes: the focused browser script, existing model tests, browser-chain/artifact registration and this programme documentation. No migration, worker, Supabase configuration, provider, secret, schedule, production operation, external send/sign or merge. The already installed exact-reader migration 20261026231700 is a dependency; never reapply it or replay the excluded relationship migration.

After local checks, publish a draft based on `codex/redream-document-save-recovery`, stage the exact pushed SHA on project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `jesseedge10-8415s-projects`, independently verify source/project/READY and the canonical staging alias, and exercise one labelled synthetic normal mandate save/reopen/export. Archive only that canary through normal UI, retain its audit history, and compare original projections excluding that exact canary/dependencies. Use the existing deployment-only ignored-build override, preserving the project's branch rule. Immediate rollback is PR 274 b4ccf98 at immutable `redream-systems-staging-5pcq04zkt-jesseedge10-8415s-projects.vercel.app`, deployment `dpl_3aXR2gjkxTJw8uHPJPAMGSbjSoE3`.

Normal existing agreement review is technical QA of a synthetic sample; no party signs or accepts an agreement and no recipient link is created. Northstar/Atlas remain technical fixtures. Broader document/permission/AI/provider, ordinary-staff, physical iPhone/Safari, independent-agency and production acceptance remain open. Do not mark the programme complete.


## Final local checkpoint

The final mandate journey, representation journey and document save-recovery browser suites pass. Mandate template reuse clears the old subject/principal/term and review state; the new prospect and changed principal type resolve correctly without old names or an implicit action. The script records only explicit document/template saves. The model suite passes 16 tests; full `npm run check` passes 2,149 tests, every TypeScript project, production build and gzip 145,982 / 150,000 bytes. The final scripted exports contain the same inspected inputs/content before template reuse. Generated fixture routes and Next type drift are removed. No backend application or mutation is needed for this frontend increment.

Draft publication, exact staging save/reopen/export/archive acceptance and final-head CI remain pending. Parent PR 274 source b4ccf98 has verify green and full browser CI 40418885796 in progress; preserve that confirmed-live run. No production operation or merge is included.


## Final installed checkpoint

Draft PR 275 exact source `5f4f8fe40cf236b14ab76d90d95820ab71a0a0a3` is READY at immutable `redream-systems-staging-j6vbvb6cm-jesseedge10-8415s-projects.vercel.app`, deployment `dpl_9iMXyJL2Yfce4Zs3aGVwFUbgq5nJ`. Full source/project/preview target and canonical staging alias are independently verified. No backend change is included. Immediate rollback remains PR 274 b4ccf98/5pcq04zkt, with PR 273's full-CI accepted 5dle4wr30 frontend as the earlier fallback.

Actual signed-in 390px Northstar mandate acceptance passes: create an unlinked synthetic player/agency-principal draft; enter explicit scope, fee and dates; replace only the four unfinished sample placeholders with clearly synthetic technical-QA text; check review; save revision 1; return through Library and reopen. SQL confirms every field, 1 November 2026 through 15 February 2027, reviewed state and inherited Northstar brand. Preview shows both long-value references and the complete six scope entries/full fee below them. Page/viewport widths are 390/390. No roster import, AI, global branding change or recipient link is created. Technical QA review is not signature, legal acceptance or validity evidence.

Both actual downloads are inspected: two Word pages and two PDF pages, all four rendered and visually reviewed. Scope entries 1 through 6 and the fee wording are retained exactly once; references, dates, parties, tenant identity and per-page header/footer match. Word has no editing protection. Actual files/text/renders and render-verification JSON are in `hosted/`; inspected phone proof is `hosted-preview-390.png`.

Normal Activity archive withdraws exact document `316959a1-5646-4e6a-8131-54a37fa49089`, `[QA] Mandate Journey 2026-10-27 M1`, at revision 2, `2026-10-26 23:42:37.244604+00`. SQL and the empty Library agree: zero active documents, zero shares. The archived synthetic row and its single created event intentionally remain alongside earlier archived canaries; no zero-footprint claim. All 13 original business projections and three original document/share/event projections excluding only this new canary/dependencies match. The established public-profile projection excludes contract_expiry. Final release evidence: `hosted/release-final.json`.

Exact-source CI 40420970664 has verify green and full browser journeys in progress. Parent PR 274 exact source b4ccf98 also has verify green and confirmed-live full browser CI 40418885796 in progress. Preserve both; this installed documentation checkpoint continues on `codex/redream-player-pitch-journey`. No pitch feature is implemented here. After checking those runs and fixing only real failures, advance DOC-03/DOC-06 through the existing prospect acquisition pitch: truthful player priorities and agency evidence, personalised chapters, mobile preview, save/reopen and actual tenant-branded editable Word/PDF, reusing existing assistance/templates and never fabricating promises or football facts. All wider role/provider/device/independent-agency/programme gates remain open. No production operation or merge.


## CI follow-up

Exact final source 5f4f8fe now passes full CI run 40420970664 (verify and browser journeys), freshly verified during the player-pitch continuation. Parent PR 274 run 40418885796 is also fully green. Earlier in-progress notes above are historical. No new deployment, migration or mandate canary was needed for these results.
