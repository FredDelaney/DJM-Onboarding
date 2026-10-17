# Platform usability release

Requested by Jesse Edge on 15 October 2026. Builds on the live Home task completion and career approval fixes.

## Changes

- One shared searchable-list control in Players, recruitment, Network and Opportunities. Clear and Escape reset the query and keep focus in search. Remembered list state and existing paging/filtering remain intact.
- Players places search and Add player in one controls row, in the same order as Network. Role checks and the existing player creation flow are unchanged.
- Shared record editors use calm, consistent typography and surfaces, readable phone inputs and separate scrolling fields. Save and Cancel remain reachable in long forms and shortened viewports.
- Editing snapshots the opened record, sends only changed allowed fields, disables unchanged/duplicate saves and protects unsaved drafts on Close, Cancel, Escape and backdrop dismissal.
- A failed write retains the draft. A confirmed write followed by a failed refresh displays saved confirmation and read-only refresh retry, never another save. Record-only strict list callbacks and quiet awaited detail reads cover the list, club, contact, deal and recruitment paths without changing ordinary refresh handling.
- Deletion still requires its existing preview and explicit confirmation. Preview reads can be cancelled; stale previews cannot replace a later editor. Permission checks and server RPC contracts are unchanged.
- Occasional Transfermarkt management lives in the profile More menu alongside the other secondary tools. Core edit, prepare and publish/share actions remain directly available.
- The player's seven career-tool destinations remain available in a compact native disclosure instead of a clipped horizontal strip. Privacy and approval guidance remain inside the expanded tools. Home no longer repeats the Waiting label.

No backend schema, permissions, publication gates or customer records are changed by this release. Browser writes use isolated fixture data.

## Verification

- 1,734 unit/source/integration tests pass.
- TypeScript and all three fixture typechecks pass.
- Shared-control browser checks pass for narrow patches, unchanged saves, dirty dismissal, keyboard focus, failed writes, pending controls, confirmed-write refresh failure and stale preview protection at 320/390/768/1440 pixels and a shortened phone viewport.
- Home direct completion, saved notes, follow-up, Undo, reply preservation, date-only task and refreshed reopened-work checks pass. Career strategy recovery and Calendar mobile recovery pass.
- Real Network failure/retry check passes through the production list consumer without repeating the write.
- Club, contact and deal post-save detail-read failures retain saved confirmation and retry only the read. These checks pass alongside initial read failure/delay, scroll and read-only detail checks.
- Independent read-only review identified the nested confirmation keyboard issue and swallowed refresh callbacks. Both were reproduced by failing browser checks, fixed, and rerun successfully. The reviewer reports no remaining Critical, Important or Minor findings after 29 targeted tests.
- The full production-build browser matrix passes all 236 combinations: 59 screens at 320, 390, 768 and 1440 pixels, with no collected browser errors or layout/accessibility failures. This includes initial/failing/delayed reads, native disclosures, protected reviews, role boundaries, capture approval and direct follow-up completion.
- Populated profile editing, retained drafts, secondary tools, saved visibility and failure/late-read recovery pass at four widths. Search/navigation checks pass at five widths, including remembered list position, account separation and complete 250-player pagination.
- Final `npm run check` passes after removing all temporary fixture routes: 1,734 tests, TypeScript and fixture typechecks, and the clean production build. The production route list contains no QA routes.
- Source package: 378 files, SHA-256 `5571349c59cde183924be1c1acf2740de47f4b40d40d8176b69c9c5d62b4a7ae`. It excludes test routes and secrets and preserves both earlier releases.
- Usability deployment `dpl_GtvkuMsjfiTU2GMkhvRJPmwFjP2B` is READY and aliased to `app.djmsports.com`. The deployment-file API truncates its source tree; all 253 returned complete file hashes match the release, including shared search, editing and Home code. Six public document requests and their initial assets returned HTTP 200. A subsequent loading follow-up will supersede this deployment.

## Loading follow-up

The shared capture launcher no longer imports its closed capture tool eagerly. Players, Network, Opportunities and Calendar load as separate chunks. Authorized visible-page code starts alongside its data reads; navigation intent warms the destination. Background data warming retains its existing tenant/user/role scope and does not load every hidden page's code. Profile routes preload the actual profile; the optional owner tool loads on demand.

The actual compiled workspace entry fell from 671,296 decoded bytes / 183,982 gzip bytes to an initial measured 495,771 / 140,311 bytes. This is a 24% reduction in gzip entry code. A 150,000-byte gzip budget failed against the old production output and passed after splitting the modules; `npm run check` now checks the budget after building. This entry measurement excludes Next's shared runtime and is not a claim about all page assets.

The isolated delayed-module browser check passes: the closed tool downloads no capture chunk, the opening sheet shows loading status, Close remains usable with correct focus restoration, and reopening uses the same downloaded chunk. Shared editor, Home Update/completion/Undo, reply preservation, date-only follow-up, refresh, career approval and Calendar recovery regressions pass after the change. No customer data is written.

The read-only HTTP audit records each document and its script/stylesheet assets, with gzip sizes calculated consistently from decoded files. These are unauthenticated payload measurements, not signed-in timings or Core Web Vitals. Initial first-byte samples varied substantially while warm samples were generally short; no guaranteed page-load time is asserted. The existing public tenant lookup and private access rules remain unchanged.

The performance follow-up first checked 39 combinations across workspaces, player pages, Settings and capture: 38 passed and one Network touch target measured 40 pixels after its stylesheet moved into a separate chunk. Its original legacy CSS declaration now specifies 44 pixels, without adding another override. The final production-build rerun passes all 20 combinations of the five affected workspace pages at 320/390/768/1440 pixels, with no collected browser errors or layout/accessibility failures. Screenshots retain the calm list layout. Repeated delayed-module and Home Update/completion/Undo checks pass on the final code.

Independent review approved the follow-up with no remaining Critical, Important or Minor findings after the profile-only preloading and test-wiring refinements. A local compiler-cache corruption after session resumption was isolated to generated Turbopack data and resolved by rebuilding the cache; no production code change was needed.

The final clean `npm run check` passes: 1,734 tests, TypeScript, all three fixture typechecks, a production build with no QA routes, and the compiled bundle budget. Final workspace entry size is 495,906 decoded / 140,823 gzip bytes, about 23.5% less gzip code than the 183,982-byte baseline. This replaces the preliminary bundle figure above.

## Final production verification

- Source commit: `e01a800439ef0270686927764b8c4aee3c8322c6`.
- Deployment: `dpl_DDdqGyNKqUDo5zf1hFUNhQGYaqtV`, READY on `app.djmsports.com`, production in `dub1`. Remote build duration: 24.5 seconds.
- Source package: 380 files, SHA-256 `5022624a39309f62b251b48f7d74bf31db7c85975b9839bafb8ce6487d8cd014`, with no temporary QA routes or secrets. All 255 complete source hashes returned by the truncated deployment API match the local release, including the workspace, corrected Network CSS, shared search and package scripts.
- Read-only live audit: `/`, `/sign-in`, `/home`, `/workspace/djm`, `/settings` and `/career` and every initial script/stylesheet requested by the audit return HTTP 200. This verifies assets, not private signed-in records.
- Workspace initial script/stylesheet assets fall from 476,825 to 414,207 estimated gzip bytes, about 13% less. Decoded initial JavaScript falls from 1,225,040 to 1,050,130 bytes; initial CSS from 784,555 to 633,920. Settings also downloads one fewer script, reducing its decoded JavaScript from 931,185 to 902,713 bytes. The distinct compiled entry-code reduction above is about 23.5%; these measures are not interchangeable with load-time percentages.
- Live audit first-byte samples: sign-in 296 ms, player Home 227 ms, workspace 276 ms, Settings 221 ms and Career 320 ms. The first root request was 5,387 ms. These single-client observations include connection/setup effects and do not establish a guaranteed load time or signed-in/Core Web Vitals score. First-visit latency remains a monitoring limitation.
- The new deployment's error/fatal runtime-log query for the preceding 30 minutes returned no matching logs. Drains could not be confirmed because the earlier supported endpoint returned 404; production RUM/Core Web Vitals and real-iPhone signed-in timing are not verified by this release.

The usability and loading release is live. Repository sync remains blocked as described below; never redeploy older Git main over these fixes.

## Source and release

GitHub integration writes are blocked. Release uses the configured production Vercel source-file deployment and includes both previous local commits. Do not deploy the older Git main until these changes and the Home/career fixes have been synced back to the repository.
