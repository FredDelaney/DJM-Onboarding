# Calendar mobile recovery

The phone recording showed reads remaining pending, zero task counts before reads resolved, and a task form covered by navigation and the microphone.

## Changes

- Calendar sources use independent request keys. Selecting another month or day does not restart Today, overdue work, undated work or assignee reads.
- Reads leave the loading state after 12 seconds and offer source-specific retries. Cancelled or expired responses are ignored. The underlying transport is not cancelled.
- Today distinguishes unknown and unavailable data from confirmed zero counts. Cached summary values remain visible with an updating or incomplete label. Saving one task does not establish a complete task count.
- The task form renders in the document body above navigation and the microphone. Background content is inert; focus remains inside the form and returns to the opener on close.
- The form follows the visual viewport and scrolls internally when keyboard space changes.
- Month/Agenda and Add task share a toolbar row. The date strip is shorter, and date jumping opens on demand. Task and birthday filters remain available.

## Browser check

Provide Playwright in the testing environment and `CALENDAR_CHROMIUM` if using a separately installed Chromium executable, then run:

```sh
node scripts/calendar-browser-fixture.mjs
```

The runner temporarily installs routes from `tests/fixtures/calendar`, starts the development server, runs both browser drivers and removes those routes. Temporary `pages` routes must be absent from production builds. Clear generated development route types before running the production check.

The fixture uses the actual animated `viewStage` ancestor and represents fixed navigation and microphone stacking. Only RPC transport is replaced. Coverage includes pending task/meeting summaries, never-resolving reads, retry recovery, independent Today reads, full viewport coverage, a shortened viewport, task lifecycle/conflict/error handling, tenant switching, and both views at 320, 375, 390, 430, 768 and 1440 pixels.

## Limits and release

The exact cause of the original phone network or authentication stall remains unverified. The fix provides bounded loading and recovery. Browser checks use Chromium; real iPhone Safari and its keyboard need a post-release check.

The release is based on main commit `b86e97ca48b0fea0d9934bffc1cc8f23591a3896`. Apply only the feature patch onto an isolated branch of current main. Do not push the recovered local snapshot history. No schema changes are required. Publishing access must be restored before opening the PR and deploying.
