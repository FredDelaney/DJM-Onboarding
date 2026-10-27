# Player acquisition pitch journey

Scope: DOC-03 / DOC-06 / UI-11 / UI-12, stacked on draft PR 275. The complete 46-item/17-surface programme remains active.

## Observed problem and change

The existing pitch supports an unlinked prospect, stated priorities, five editable chapters, optional approved player import, sources, explicit review, tenant branding and landscape Word/PDF. Those implementations remain in use. No player, agency service, football fact or transfer promise is invented.

Two new model regressions reproduce a concrete reuse problem: conversion clears subject fields but retains literal personal chapter headings/bodies. A saved legacy template can therefore carry the preceding prospect's private details. Conversely, the existing conversion discards sources even when an agency deliberately authors reusable template copy.

Non-duplicate pitch conversion now starts with clean canonical chapter prompts, clears old personal fields/sources and unused line items, and keeps chapter IDs/order/page breaks, custom chapter count and agency branding. Custom chapter headings also reset to neutral prompts. The original document is not changed. Explicit Duplicate retains the deliberately selected content with review reset, as before.

An optional private content property, `pitchTemplateVersion: 1`, records the clean-template workflow. Only an actual agency template with that marker retains its subsequently authored reusable chapter copy and sources. A personalised document made from that template is not exempt when converted again. Unmarked legacy templates are left intact; applying them creates a clean new draft with an explicit notice. New prospect fields and review approval still reset. The marker is not factual verification, sanitisation, permission or a security boundary; agencies must still review their wording and evidence. It is persisted by the existing JSONB writer and omitted by the existing recipient snapshot projection. No migration or backend change is required.

The editor explains when pitch wording/sources have been cleared and asks for reusable agency wording. Existing review/share/save-recovery gates and all other document-kind semantics remain in place.

## Focused validation and limits

- Model regressions fail the preceding implementation and pass the fix: literal personal headings/bodies/custom chapters/private sources cannot silently carry over, layout/brand/original are preserved, intentional duplicate remains explicit, reusable agency copy/evidence survives, and a second personalised pitch is cleaned on reconversion.
- Existing real-PostgreSQL document tests prove clean-template save/Library reopen, new prospect creation and source retention through the current authorised writer; the workflow marker is absent from the public recipient snapshot. Existing role/tenant denials and snapshot tests remain in the same suite. This is local database evidence, not an external share or changed grant.
- `scripts/player-pitch-document-browser-qa.mjs` uses the existing document fixture/harness. Northstar and Atlas technical brands each exercise a blank new prospect without roster import, missing-field focus, personal chapter editing/review/save/reopen, clean template conversion, deliberate reusable agency wording/evidence, original preservation and a second new prospect. Review resets and unsaved sharing remains blocked. Only three explicit saves occur per case; no implicit AI, roster mutation, send or share.
- Both cases pass preview bounds at 320/390/768/1440 and actual editable Word/PDF downloads. Each output has a cover plus five landscape chapters, correct subject/priorities, agency identity/header/footer/page numbers and the reusable source. The previous subject/private context and workflow marker are absent. Word has no editing protection. All 24 rendered pages and phone/desktop screenshots are inspected. PDF is regenerated from the editable draft, not a fillable form. Synthetic wording is layout/workflow evidence, not proof of agency services or a real player commitment.
- Existing general document and save-recovery browser suites pass, retaining all-five-kind, recipient, optional assistance/failure and uncertain-save behaviour. Full `npm run check` passes 2,152 tests, every TypeScript project, production build and workspace gzip 145,980 / 150,000 bytes. Exact staged acceptance remains pending until recorded below.

Evidence: `/tmp/redream-platform-programme/player-pitch-journey/`, including before/after model logs, database log, browser results/log, actual exports, Word renders, four all-page review sheets and render-verification JSON. CI uses the existing browser chain and seven-day artifact retention, with no framework or dependency added.

## Release manifest and next acceptance

Product changes are limited to `lib/agency-documents.ts` and the existing template notices in `components/AgencyDocumentStudio.tsx`. Supporting files are existing model/database tests, one focused browser journey, existing browser-chain/artifact registration and programme documentation. No migration, worker, Supabase configuration, provider, secret, schedule, production operation, external action or merge.

The exact-reader migration 20261026231700 is already installed and accepted on staging; do not apply it again. Never replay the excluded relationship migration. Immediate frontend rollback is accepted PR 275 source `5f4f8fe40cf236b14ab76d90d95820ab71a0a0a3`, immutable `redream-systems-staging-j6vbvb6cm-jesseedge10-8415s-projects.vercel.app`, deployment `dpl_9iMXyJL2Yfce4Zs3aGVwFUbgq5nJ`. PR 275 CI 40420970664 and parent PR 274 CI 40418885796 are both fully green, freshly verified during this increment.

Publish a draft based on `codex/redream-mandate-journey`. Stage only the exact pushed frontend on project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `jesseedge10-8415s-projects`, verify full source/project/READY/preview target before assigning the existing staging alias, then accept a labelled synthetic new-prospect pitch through normal signed-in save/reopen/preview/export. Check clean conversion without saving unnecessary fixtures, archive the exact saved QA document through normal UI, retain its audit and compare the original projections excluding only that new canary/dependencies. Preserve final-source CI.

Northstar/Atlas remain technical fixtures. Wider role/ordinary-staff, actual AI/provider, physical iPhone/Safari, independent-agency, commercial lifecycle and production acceptance remain open. A scoped pitch delivery does not complete the full programme.
