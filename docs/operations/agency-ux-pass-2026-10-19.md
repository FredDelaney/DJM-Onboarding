# Agency UX pass: 19 October 2026

## Changes

- Shared scroll and background-isolation ownership across the existing twenty overlay owners. Closing a parent before a nested confirmation no longer unlocks the background early or leaves it inert after everything closes. Releases are idempotent and restore the original inline overflow axes, priorities and scrollbar gutter.
- Confirmation dialogs fit short screens, scroll their content and keep actions reachable. Parent rerenders preserve keyboard focus. Warning confirmations inherit the tenant's primary colour; destructive confirmations retain their warning colour.
- More menus synchronise native dismissal before closing, so a queued close event cannot override an immediate reopen. Repeated keyboard close/reopen and selection are covered.
- Native modal dialogs prevent background page scrolling. Tell ReDream fits the visual viewport, with a sticky close control above long content and phone keyboards.
- Bound the workspace's primary and supplemental reads using the existing read-deadline helper. Speculative reads expire after three seconds; visible reads expire after twelve seconds. Home retains its existing fallback, so two consecutive stalled Home sources can take twenty-four seconds. Expired responses cannot write their result into the view cache. Mutation requests are unchanged.
- Loading labels identify the current destination in a compact status area instead of a large empty card saying “Loading current agency position”.
- “Add club need” names the form it opens. Player controls say “Review next step” before preparing an action. Desktop player rows keep the work view and next-step action together, and separate the action label from its due date. The visible next-step instruction matches the action being prepared; an unrelated saved task cannot supply a misleading overdue date. The Documents menu entry uses the same icon spacing and 44-pixel target as the adjacent tools.

## Verification

- 1,818 automated tests pass, including nested scroll/inert ownership and original-style restoration.
- Typecheck, production build and workspace bundle budget pass. Workspace entry: 142,586 gzip bytes against a 150,000-byte budget.
- Focused real-component browser checks pass for primary read deadlines, Retry, expired responses, warming recovery, roster layout, tenant-branded confirmations, keyboard focus, native modal scrolling and simulated keyboard viewport changes.
- Confirmation viewports: 320×320, 390×460, 768×380 and 1440×900. Roster checks include 390×844 and 1440×900.
- All existing browser suites pass, including 236 production-built Platform screen/viewport combinations, player entry/read/write recovery, public/profile journeys and shared design-system checks. A plain-textarea probe confirmed macOS Home-key behavior; the story test now selects the intended caret position explicitly while retaining real keystroke coverage.

## Inspection and limits

Read-only inspection covered the signed-in agency's Home, Players, Opportunities, Network and Calendar navigation, plus the Documents entrypoint. Customer records were not changed. Automated fixture coverage uses synthetic data and mocked service responses.

The hosted HTML/asset baseline was 98–144 ms TTFB for workspace, documents, settings and Platform, and 504 ms for the first sign-in request. These are unauthenticated document timings from one run, not signed-in render times or Core Web Vitals. This pass does not claim a measured improvement to backend latency.

Phone keyboard geometry was simulated in Chromium. Physical iPhone/Safari interaction and a fresh staging check remain release validation tasks. This pass does not deploy any code or Edge Function, change Supabase configuration, or mutate production data. The separate Document AI function's deployment/provider validation remains outside this pass.
