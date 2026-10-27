# Creation and connection usability release

Requested and approved by Jesse Edge on 16 October 2026. Builds on the live Home completion, career approval, shared editing and loading improvements.

## Changes

- The five quick-create forms use readable labels, calmer copy, generous controls and separately scrolling fields. Save and Cancel stay within the visual viewport, including a shortened keyboard-height viewport. Tenant colours remain intact through the portal.
- Dirty forms require explicit discard on Close, Cancel, Escape or backdrop dismissal. The modal makes the background inert, contains keyboard focus through loading and recovery, and restores the originating control, including React StrictMode replay.
- A failed create keeps entered values. An immediate ref guard prevents duplicate submissions while a write is pending. Writes are not automatically retried.
- Confirmed creation remains acknowledged if list refresh fails. Refresh retries repeat only the read; the saved panel can close while refresh is pending.
- Player options have a 12-second read deadline and explicit retry. Failed or malformed responses are distinct from an empty list. Retry retains the deal draft; late old responses cannot overwrite recovered choices.
- Optional workspace reads wait for a quiet period and browser idle time, skip hidden/offline/Save-Data/2G/3G conditions, cancel queued work and recheck before later batches. Explicit navigation intent starts requested reads immediately. Tenant/user/role cache scope and stale-result guards remain intact.

No backend endpoints, database schema, access permissions, approval gates or customer records are changed. Browser writes use isolated fixtures. Browser Back/reload draft persistence is outside this change.

## Verification before deployment

- The final clean `npm run check` passed all 1,744 tests, TypeScript and three fixture typechecks, a production build without QA routes, and the workspace bundle budget.
- Compiled workspace entry: 496,800 decoded / 141,142 gzip bytes against the 150,000-byte budget. This remains about 23.3% below the original 183,982-byte gzip baseline before the preceding loading work. Entry-code size is not a page-load-time percentage.
- Nine real-browser creation scenarios passed: dirty/clean dismissal and focus restoration; short-viewport layout and visible themed Save; confirmed-write refresh recovery; malformed choices; all five successful create types; failed writes and duplicate-submit protection; keyboard/backdrop handling; timed-out/late choices; genuinely empty choices.
- Save-Data and 3G browser checks passed with no hidden-section reads and immediate Players navigation-intent requests. The Pages fixture checks intent/reads; the production App Router matrix checks rendering separately.
- Existing delayed capture, shared search/editor, Home reply/date/refresh/direct completion/Undo, and career approval recovery checks passed.
- The production-build matrix passed 20 combinations across Home, Players, Market, Network and Calendar at 320/390/768/1440 pixels, with no collected browser errors or layout/accessibility failures.
- Independent review approved with no remaining findings after reproducing and fixing StrictMode return focus, focus during/after a failed write and focus ownership while retry controls change. The shared-control check caught a missing semantic attribute on Retry players; it was corrected.
- Damaged generated local Turbopack cache data was replaced before successful clean builds; no runtime source change was needed for that cache issue.

## Live release

- Original source commit: `3f6ae22808aa518b9d6263ec17a32c9f6d8b2e05`.
- Production deployment: `dpl_JBrXf9jkJJMxmqJAnbgij9BN3BzM`, READY on `https://app.djmsports.com`, Next.js on `dub1`. Remote build: 29.7 seconds.
- Deployment URL: `https://djm-player-k3cetsrzu-jesseedge10-8415s-projects.vercel.app`.
- Source package: 381 files, SHA-256 `33b49aa07740fa5555fc2e0266be65d1854cbac5b0bf2bc8f715bf6b81804664`. No QA routes or secrets are included. All 256 complete hashes returned by the truncated deployment file tree match, including creation TSX/CSS, workspace TSX, the new warming helper and package scripts.
- Live read-only HTTP audit: `/`, `/sign-in`, `/home`, `/workspace/djm`, `/settings`, `/career` and all their initial scripts/stylesheets returned 200.
- Workspace initial script/style assets: 414,524 estimated gzip bytes, about 13% below the original 476,825-byte baseline. This is a payload measurement, separate from entry-code size.
- Live first-byte samples: root 5,700 ms initially, then sign-in 267 ms, Home 206 ms, workspace 225 ms, Settings 251 ms, Career 218 ms. These single-client samples include connection/setup effects and are not signed-in or Core Web Vitals measurements or a guaranteed load time.
- Recent 30-minute deployment error/fatal log queries returned no matching logs. A two-hour request was rejected by the logs API because it exceeded Hobby retention; it is not evidence of an empty older window. Drains, full monitoring coverage and real-iPhone signed-in timing remain unverified.

## Local recovery and repository constraint

When the task resumed after inactivity, scratch had reverted to commit `38640dc`; the live release was still READY. The changed runtime files were restored from the recorded patches. The complete reconstructed 381-file source package has the exact original SHA-256 above, and critical files match their remote source SHA-1s. Regression fixtures and tests were restored and the 1,744-test suite was rerun successfully. This local recovery requires no new deployment.

GitHub integration writes remain blocked. Preserve the recovered local commit and this live release. Do not redeploy older Git main over the current fixes before repository sync is restored.

## New user feedback

Jesse supplied a 12.6-second iPhone recording of Dylan Gardiner's profile and requested a further cleanup with AI doing more of the data preparation. The recording exposes repeated identity/statistics, a persistent old source-check success card, a large optional-video prompt, an empty activity panel and expired/revoked club links in the default flow. Existing AI context research, sourced statistics refresh and editable profile preparation have been inspected. The new profile/related-record redesign has not been implemented in this release; its concrete in-chat design is awaiting the brainstorming skill's required design approval.
