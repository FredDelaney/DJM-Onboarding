# Platform usability pass

Owner: Codex, requested by Jesse Edge on 15 October 2026.

## Outcome

Make everyday work feel calmer and more consistent without changing permissions, football meaning, publication gates or the existing platform architecture. Build on the live Home task and career-approval improvements.

## Scope and acceptance

- Use one accessible, clearable search control in Players, recruitment, Network and Opportunities. Preserve remembered searches, paging and existing filters.
- Improve the shared editor used by players, recruitment targets, clubs, contacts, needs and deals. Show readable labels and reachable Save/Cancel actions on phones and long forms.
- Preserve dirty drafts until explicitly discarded. Prevent unchanged and duplicate saves. Write only changed fields.
- Keep failed saves editable, distinguish a confirmed write from a failed refresh, and keep destructive actions behind their existing safety checks.
- Inspect main pages and detail panels at phone and desktop widths. Fix demonstrated visual friction without adding decorative complexity.
- Verify unit tests, TypeScript, production build, realistic browser journeys, accessibility geometry and a separate code review before production release.

## Execution

1. Audit existing screens and interactions. Initial editor check failed because unchanged forms could be saved. Four field-diff tests were written first and passed after implementing the helper.
2. Consolidate shared list search and record editing. Initial browser checks pass for dirty drafts, visible footer controls at 320/390/768/1440 pixels, simulated keyboard height, failed writes and narrow patches.
3. Run the full platform fixture and inspect screenshots. Update stale Home fixtures to reflect the already-live direct completion and Undo flow.
4. Independent review is approved after resolving nested-dialog keyboard handling and confirmed-write refresh recovery. The production-build matrix passes 236 screen/viewport combinations. Final clean `npm run check` passes all 1,734 tests, TypeScript and production build. Usability deployment `dpl_GtvkuMsjfiTU2GMkhvRJPmwFjP2B` is READY on `app.djmsports.com`. The 253 source hashes returned without API truncation match the local release, including the new shared controls and editor helper.

## Loading speed follow-up

Requested by Jesse after the usability release. Keep the existing fast in-app navigation and scoped data caches; reduce initial code instead of weakening access checks.

- Baseline actual production workspace entry: 671,296 decoded bytes / 183,982 gzip bytes. A compiled-output budget of 150,000 gzip bytes fails before the change.
- Defer the closed capture tool and four hidden workspace sections with Next dynamic imports. Start the visible authorized destination's code alongside its reads and preload on navigation intent. Background data warming does not download hidden page code; profile routes preload the profile, not the roster. The optional owner tool remains on demand.
- First resulting production entry: 495,771 decoded bytes / 140,311 gzip bytes. Final clean build after review refinements measures 495,906 / 140,823 bytes, within budget and about 23.5% less gzip entry code than baseline.
- A delayed-chunk browser check proves the closed capture does not download its module, the opening sheet shows status and can close immediately, focus returns to its trigger, and reopening reuses the module. The check now runs in `check:browser`.
- Independent performance review reports no remaining findings after its two minor preload/test-wiring suggestions are addressed. A 39-combination follow-up found one older Network 40-pixel touch-target declaration exposed by stylesheet splitting. Correcting that source rule to 44 pixels is verified by a production-build rerun of all five affected workspace pages at four widths (20 combinations), with no collected browser or layout/accessibility failures. Final delayed-capture and Home task regressions pass. The clean check passes all 1,734 tests, TypeScript and fixture typechecks, production build and bundle budget. Production release verification follows.
- Public HTML/assets are audited read-only with `scripts/site-loading-audit.mjs`. Asset bytes are not a signed-in timing or Core Web Vitals score. Sampled HTTP first-byte times vary, so no blanket latency guarantee is inferred.

## Completed release

The final clean check passes and production deployment `dpl_DDdqGyNKqUDo5zf1hFUNhQGYaqtV` is READY on `app.djmsports.com`, from source commit `e01a800439ef0270686927764b8c4aee3c8322c6`. All 255 complete source hashes returned by the truncated file API match. Six live documents and all their initial scripts/stylesheets return 200. Estimated initial workspace asset gzip size is 13% lower; compiled workspace entry gzip size is about 23.5% lower. No matching error/fatal logs were returned for the 30-minute deployment query. First-visit latency, real-iPhone timing and full monitoring coverage remain explicit measurement limitations in the operations record.

## Creation and connection release, 16 October 2026

The five quick-create forms now protect drafts, own and restore focus, keep Save/Cancel above a shortened visual viewport, and recover failed options or post-create list refreshes without duplicate writes. Optional reads respect idle time, visibility, connectivity and Save-Data/2G/3G conditions. All 1,744 tests, typechecks, production build and bundle budget passed. Nine creation scenarios, limited-connection checks, affected existing journeys and the 20-combination production matrix passed; independent review approved with no remaining findings.

Production deployment `dpl_JBrXf9jkJJMxmqJAnbgij9BN3BzM` is READY on `app.djmsports.com` from original source commit `3f6ae22808aa518b9d6263ec17a32c9f6d8b2e05`. Six live documents and all initial assets returned 200. The full 381-file source package fingerprint is `33b49aa07740fa5555fc2e0266be65d1854cbac5b0bf2bc8f715bf6b81804664`; local recovery after scratch reset reproduced it exactly. Details and measurement limitations are recorded in `docs/operations/platform-creation-2026-10-16.md`.

Jesse's subsequent iPhone recording requests a simpler player-profile and related-record experience with a clearer AI-assisted preparation path. Existing flows have been inspected and recording findings are in the operations record; the new in-chat design requires approval before product implementation.

## Release constraint

GitHub integration writes are unavailable. Do not retry blocked routes. Production can be released through the already-configured Vercel source deployment. Preserve both prior local commits, document the release, and report the remaining repository-sync limitation.
