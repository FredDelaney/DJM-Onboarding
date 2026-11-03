# Players experience fidelity pass, 3 November 2026

## Goal

Use the eight user-supplied Athlivo screenshots as visual and interaction references for the ReDream Players experience. Retain ReDream branding, routes, schema, permissions, and existing saved work.

## Delivered structure

- Desktop Players directory is a searchable, sortable, filterable player table, with sticky names, configurable columns, multiple selection, verified club crests where available, paging, an Add Player control, and a card-view alternative.
- Mobile uses spacious player cards by default while allowing table view on demand.
- Selecting a player opens one real workspace, not an extra intermediate screen. Its desktop layout has a permanent photo and identity rail, then a Profile, Tasks, Updates, and Deals content area.
- The Profile tab shows recorded club and contract information, agency agreements, assigned staff, links, documents and career context.
- Tasks, Updates and Deals reuse saved player next actions, activity history, actual deals and opportunities. No unrecorded statistics, matches, agent assignments or transfers are invented.
- Edit uses the existing tenant-scoped `redream_entity_patch` for editable identity, club, country, contract expiry and preferred display name. Photo, staff and contact editing reuse established components. Verified football data continues to the existing Player Profile verification editor.
- If an exact player read fails, show only already-authorised roster summary and require a successful record reload before edits. Do not repeat an unconfirmed mutation automatically.

## Important fidelity boundaries

Athlivo-branded graphics, logos, fixtures and example data from the screenshots are not imported. The existing ReDream camera/photo storage and verified crest service are used. The screenshot's match card, multi-club editing, independent update composer and player-specific task creation are not fabricated: the current authorised backend contracts do not yet provide those exact actions in this workspace. They can be developed separately after backend decisions and tests.

## Validation

- Existing full 2,339 unit tests: passed locally.
- Existing Find workflow: browser-verified against the updated direct-to-player navigation, cross-tenant isolation, pagination, stale-response and retry behaviour.
- Desktop/mobile player workflow: browser-verified roster, filters, four tabs, editing, navigation and screenshots.
- Existing visual polish checks: verified player page at 320, 390, 768 and 1440px.
- Full GitHub CI on the PR is required before merge, production release and claims of live authenticated edits.
