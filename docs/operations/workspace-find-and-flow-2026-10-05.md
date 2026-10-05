# Workspace Find and list continuity

Date: 2026-10-05

## Behaviour

Find is available from the main agency navigation, including mobile and inline player profiles. Cmd/Ctrl+K opens it. It searches recorded players, recruitment targets, clubs, contacts, club needs and deals, with links to the selected record. Section jumps and quick add reuse the existing navigation and creation forms.

Player cards open the Player Profile directly. Work view remains available from both the roster and the profile. Back to players returns to the roster.

Players, Recruitment and Network retain their filters in the current browser session. Opening a record records the list's scroll position, which is restored on return. Filters and profile prefetches are scoped by tenant, user and role. Only bounded display preferences are written to session storage.

Search reads independent sources lazily and retains usable results when one source fails. Failed sources can be retried without restarting successful reads. Requests have a 12-second wait bound and the in-memory results have a 60-second freshness window. The existing APIs cap loaded records at 200 players, 500 recruitment targets, 100 clubs, 250 contacts, 100 needs and 100 deals. Search therefore covers the loaded recorded data rather than an unlimited server-side index. Archived records are excluded after archive status has loaded. A status read failure shows an explicit retry instead of presenting unchecked records.

No database, Edge Function, permission or publishing changes are included.

## Verification

- `npm run check`: 1,497 tests, TypeScript and production build passed.
- `scripts/workspace-flow-browser-fixture.mjs`: actual App Router and production UI components with synthetic tenant-scoped transport responses. Passed at 320, 390, 430, 768 and 1440 pixels.
- Browser coverage: keyboard shortcuts, focus trapping/restoration, exact record links, Enter opening a profile and focusing a club need, quick add, direct roster-to-profile navigation, Work view, filter and scroll restoration, reload, account separation, partial read failure and retry. No browser runtime errors or horizontal overflow.
- Existing player-data, player-review, Home-review and reminder-review browser regressions passed.
- The broader calendar workspace's pre-existing Today-at-a-glance failure is documented in [player-data-workflow.md](player-data-workflow.md). This change does not modify its behaviour.

The workspace fixture is installed only while its runner is active and removed in `finally`; it is not a production route. Browser tests do not modify real agency records or use a live signed-in session.

Example on macOS with an external Playwright installation:

```sh
CODEX_PRIMARY_RUNTIME_NODE_MODULES=/path/to/tools/node_modules \
CALENDAR_CHROMIUM='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/workspace-flow-browser-fixture.mjs
```

## Release checks

Before merge, require the exact feature commit's CI and staging preview to pass. After merge, verify both production deployments reference the merged commit and their public aliases are assigned. Public browser and asset checks confirm delivery; private workspace behaviour is verified by the component browser fixtures above.
