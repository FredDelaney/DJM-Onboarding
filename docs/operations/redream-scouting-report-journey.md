# Sourced scouting report journey

Scope: DOC-05 / DOC-06 / UI-11 / UI-12, stacked on draft PR 278. The complete 46-item and 17-surface programme remains active.

## Observed problems and changes

Three regressions fail the preceding implementation: converting a personalised report to a template retains literal player headings, legacy personalised templates silently reuse previous observations, and changing between different players with the same name retains the previous player's assessment. Clean reusable methodology sources are also discarded.

The existing report editor now clears personal headings, observations, sources and unused line items when converting an ordinary report or using an unmarked legacy template. Section IDs, count, order, page breaks and tenant branding remain. The selected original is unchanged. Explicit Duplicate still keeps the chosen report with review reset. Deliberately authored clean methodology templates retain their reusable guidance and sources; new subject fields and review still reset.

Optional private JSON properties record clean-template authorship (`scoutingTemplateVersion: 1`) and the copied published profile's player identity (`scoutingProfilePlayerId`). They convey neither roster assignment, permission nor factual verification. Same known player refresh retains authored observations; a different player, including a same-name player, or untracked legacy assessment starts afresh. Published profile evidence has a named source, preserves zero statistics and excludes unavailable values and private notes. No profile is imported automatically. New unlinked prospects remain the default path.

Replacing an established report requires the existing native confirmation dialog. It explains which evidence and observations will change, identifies the selected player, distinguishes missing published evidence and permits Keep current report or Escape. Scope, revision, current draft, paid lock and current player membership are checked again before applying. The pending selection uses React state so reopening the same dialog renders the correct subject and warning. The existing dialog now wraps keyboard focus at its boundaries, has a 44px Close target and one tenant-branded primary action. Source dates say Added rather than implying factual verification.

Actual export inspection found a short report leaving Sources alone on a nearly empty second page. Report-only Word/PDF spacing now keeps the short assessment and sources on one readable page. Body text stays 10.5pt; long content paginates naturally without truncation. Other document kinds retain their existing export layout.

## Validation

- Three before-failing model regressions and the final focused model/PostgreSQL/save-recovery/assistance checks pass. The existing authorised JSON writer and exact reader preserve private provenance; the explicit anonymous recipient projection omits both properties, even when a marker is forged. Existing tenant/role and paid/snapshot boundaries remain in the same database suite. No migration or grant is needed.
- The new browser journey reuses the existing document fixture and tests two tenant brands, four widths (320, 390, 768, 1440), a new unlinked prospect, unknown club/position, missing-field/source-link focus, explicit review, failed-save retention/retry and Library reopen. It covers original-preserving conversion, clean methodology reuse, legacy cleanup, same-player refresh, same-name replacement, Keep current report, Escape and keyboard focus. No AI, external share, send or payment action occurs.
- Actual short and long Word/PDF outputs retain each note exactly once, the tenant identity, author, recipient, limitations and live HTTPS source link. Word is unprotected. Both short outputs are one page; both 18-note outputs are three pages. All eight final rendered pages are inspected. PDF is regenerated from the editable draft, not a fillable form. Fictional QA wording proves layout and workflow only.
- Existing general-document, player-pitch, invoice-currency and save-recovery browser checks pass against the final source. Final `npm run check` passes 2,173 tests, every TypeScript project, production build and workspace gzip 146,026 / 150,000 bytes. Exact hosted acceptance and final-source CI remain pending until recorded below.

Evidence: `/tmp/redream-platform-programme/scouting-report-journey/`, including before-model failures, focused tests, final browser log/results, actual exports, all-page renders and render verification. The existing browser chain and seven-day artifact retention are extended; no dependency or framework is added.

## Exact release manifest and remaining acceptance

Product files: `lib/agency-documents.ts`, `lib/document-workflow.ts`, `lib/document-docx.ts`, `components/AgencyDocumentStudio.tsx`, its existing CSS and `components/AgencyDocumentPdf.tsx`. Supporting files are model/database tests, the existing fixture, one focused browser script, the existing pitch script's source-date label, browser registration and programme documentation.

**No backend migration, Supabase configuration, secret, schedule, provider or production change.** Existing staging currency/date/exact-reader migrations remain installed. Do not replay them or the excluded relationship migration. Existing writer/snapshot/reader/opener hashes match the accepted PR 278 backend. Private metadata uses existing JSON persistence and is absent from the existing recipient projection.

After final local validation, publish a draft based on `codex/redream-invoice-currency-review`. Deploy only the exact pushed frontend to staging project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `jesseedge10-8415s-projects`; independently verify full source, project, READY and preview target before assigning the canonical staging alias. Accept one labelled fictional owner report through normal edit/review/save/reopen/actual Word/PDF. Check clean conversion without saving unnecessary templates, archive only that new canary normally and retain its audit. Compare the original 13 business/related and three document projections excluding only this exact new QA and dependencies. Do not create a recipient link or send externally.

Immediate frontend rollback is accepted PR 278 source `52734b0a2d5c9008780af2a10b905ca59bd89197`, immutable `redream-systems-staging-au52rqzk8-jesseedge10-8415s-projects.vercel.app`, deployment `dpl_CenyPj85xDFPjjFHdNXFP6V1jkBw`. Retain the currency-aware backend. No merge or production rollout is included.

The actual signed-in staging Calendar read-only continuation also confirms Agenda/Month finish loading and the task drawer opens and cancels with focus returned, without saving. This is desktop browser evidence, not physical-device acceptance. Ordinary-staff permissions, actual AI/provider/media, physical iPhone/Safari, independent-agency, full lifecycle and production gates remain open. Jesse is the participant; Northstar and Atlas are technical fixtures.
