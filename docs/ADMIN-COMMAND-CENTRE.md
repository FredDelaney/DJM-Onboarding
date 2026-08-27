# Admin command centre

## Product assessment

The previous Admin home was a collection of records and controls. It made staff search for the meaning behind the data: which player needs a response, which opportunity is stalled, whether DJM has a current availability signal, and whether the player's opportunity pack can move today.

The new Admin home is an operating system for the roster. It turns existing source records into one ranked daily brief, then connects every signal to the exact player workflow where staff can act. It does not invent scouting grades, performance analytics or player value.

## Connected workspaces

### Today

- A ranked action queue combining player messages, support requests, availability and fitness signals, overdue DJM actions, opportunity next steps, verification review, travel documents, contract windows, weekly check-ins and preparation gaps.
- A portfolio brief covering attention load, weekly roster coverage, live opportunities, player responses and opportunity-pack readiness.
- A live roster pulse built from the current week's player check-ins.
- Direct actions into the correct player-detail tab and a one-click check-in nudge for staff with edit access.
- Connected routes into Market, Network and Recruitment when the next job is demand matching or research.

### Roster

- Search and operational filters for attention, readiness, current check-ins and live opportunities.
- A compact player view joining status, preparation readiness, opportunity count and the highest-priority reason to act.
- Direct entry to the player's connected workspace.

### Opportunities

- A portfolio pipeline across watching, targeted, contacted, materials sent, interested, meeting/trial, offer and paused stages.
- Inline stage progression for authorised staff.
- Player, club, next-action and due-date context in the same view.

### Player value

- Roster announcements connected to player notifications and the player Today experience.
- A resource studio for professional player material, with audience, format, category, featured and publication controls.
- Safe resource links limited to `http`, `https` or app-relative destinations.
- Starter ideas help staff create useful material but are never auto-published.

### Team access

- Admin-only role management for administrators and scouts.
- Player-level scout assignments with read and edit separation.
- Role changes are synchronised between `admin_allowlist` and an existing user's `profiles.role`.
- Revocation removes player assignments and returns an existing staff profile to the player role.

## Decision model

`lib/admin-command-centre.ts` derives the portfolio from existing RLS-protected records. Each issue receives an operational severity and score so that urgent player-originated needs outrank routine data hygiene.

The source order is intentionally human:

1. Player messages, support requests and unavailable/injured self-reports.
2. Overdue DJM actions and live opportunities without a current next move.
3. Verification, expiring document and contract risks.
4. Missing weekly signals, exposed opportunity packs and requests waiting on players.

Preparation readiness reuses the player-facing career-readiness model. It measures whether DJM has the current context and assets needed to act quickly; it is never a talent, form, selection or transfer-value rating. Scouts without sensitive-record access see a deliberately limited view rather than a misleading low score.

## Data and permission boundaries

- No new tables, migrations or production-data mutations were required.
- Full administrators retain portfolio-wide access through existing RLS policies.
- Scouts see only players assigned through `staff_player_access`.
- Sensitive preparation inputs and editing controls are shown only where the scout has the corresponding access.
- Team access, announcements and resource publishing remain administrator-only.
- New Admin bootstrap queries name their required columns explicitly rather than fetching whole rows.
- Every priority links back to a source record and a real workflow; no synthetic player data is persisted.

## Verification evidence

- Production TypeScript and Next.js build pass on Next.js 16.3.3.
- Desktop and mobile browser passes cover all five workspaces.
- Opportunity stage changes, resource editing and team-access controls were exercised in the browser.
- Automated accessibility testing reports zero violations after contrast and scroll-region fixes.
- No browser console errors or Next.js error overlay were observed.
- Visual QA used temporary local-only administrator data because no test-admin credentials were available. The fixture was removed before the final build and is not part of the repository or production data.

## Operational note

Role removal currently performs a short sequence of policy-protected updates from the client: remove assignments, remove the allowlist entry, then update an existing profile role. A future database function could make that sequence atomic if team-management volume or audit requirements increase. The current flow reports failures and does not bypass RLS.
