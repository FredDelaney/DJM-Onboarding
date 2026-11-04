# Connected player, club and request details

The review starts from the Athlivo-style Players layout and multi-agent roster work in PRs 298–302. The candidate includes the latest main at `608d503` with PR 303's roster alignment fix. It follows the existing list-to-record pattern for players, clubs, requests and deals. [Athlivo workflow reference](https://athlivo.co/guides)

| Walkthrough | Finding | Change |
| --- | --- | --- |
| Player profile and Tasks | A signed-in owner saw the same Player Profile action in three places. The Tasks tab displayed a suggested next move even though production contained five open player-linked tasks. | Keep one dossier action. Show saved follow-ups separately from the next-move suggestion. Open the exact task in the existing Calendar editor. |
| Player and club | The club detail could open a player, but the player only had a free-text club label. | Show the return link when the saved player-club association names an active club in the selected agency. |
| Deal | A linked deal on the player was displayed as a static row under Shortlisted & Pitched. The existing deal detail itself opened successfully. | Label actual deals and open each exact deal. Keep other recorded club interest in its own group. |
| Club and request | The request table relied on clickable rows and displayed the expiry month only. Its Active filter ignored expiry. Amounts could default to EUR and lose decimal precision. | Use a named keyboard-accessible action, actual expiry date, current active status and the same commercial formatting as the request brief. Club deals use the same card layout on narrow screens. The request links back to its recorded club. |
| Club and contact | The contact's club was buried behind a name-based search. | Put the saved employment link in the contact header and label the return action Back to Contacts. |

## Supabase contract and release order

The recent club-link, request-shortlist, player-status, lead-agent and multi-agent migrations are recorded in staging and production. The existing Player workspace routine has the same source and service-only grants in both environments. The selected-tenant Edge handler already limits that routine to owner and admin. Restricted player links use the existing assigned-player profile reader if the roster summary is absent.

1. After release review, apply `20261104133424_connect_player_detail_to_club_and_work.sql` as a forward migration. SHA-256 `275382d503298ef6dafad117eda3345fae1d0cdae75ce01f195547e07e89a451`.
2. Confirm `platform_server_player_workspace(uuid,uuid)` changes from body MD5 `6482a97b42785099023a154fbdb96fbe` to `8882b6b9c2a45e7563fa5db00e280e9d` with its existing owner, signature, security mode, path and grants. The response adds a verified club and up to 20 open agency tasks in due-date order. It uses the existing player and tenant predicates. Private Calendar rows still go through the existing Calendar owner checks.
3. Verify the matching frontend on staging using a labelled saved club association, an open task, a deal, a request and a contact. Confirm a restricted user stays on the assigned-player view. The frontend also handles the earlier response by reporting linked tasks unavailable. The existing `agency-os` action passes through the added fields, so this change requires no worker deployment.

## Evidence

- Signed-in production reads covered the current roster, player profile and tabs, club overview, request review, deal detail and contact. Database reads confirmed five open tasks connected to active players, six active club employments and the live request state `active`.
- The candidate ran on staging inside one transaction ending in ROLLBACK. Seven actual player responses retained every original field. Four had open tasks and their ordered IDs and counts matched the underlying rows. Staging had no saved verified club links. The positive link path is covered by the existing club-link database tests and the full workspace browser fixture. The follow-up database read confirmed the original routine hash and no candidate migration ledger entry.
- Thirty-six focused contracts pass. Players and request follow-through pass at 320, 390, 768 and 1440 pixels. The browser fixtures cover the exact route IDs, assigned-player privacy, mismatched records, retry, and a deployment where the task projection is unavailable. Temporary screenshots and logs are under `/tmp/redream-connected-details/` and `/tmp/redream-athlivo-qa/`.
- The production-style fixture walks from a saved club association to the player, exact Calendar task editor and exact deal, then through the club contact and request back to the same club. It also checks the Active/All filter, keyboard entry, and the unknown-currency amount on a phone.
- Main's initial workspace entry is 149,906 gzip bytes with the CI build environment. An initial candidate exceeded the 150,000-byte limit. Loading the responsibility control where task rows need it brings the rebased entry to 123,269 gzip bytes. Home task editing, completion, Undo and conflict recovery pass. All TypeScript projects and the production build pass.

The candidate migration remains unapplied. Production had zero saved verified club links at review time. Agencies can confirm existing links from the Club overview. A name match alone provides no link back from the player. Hosted acceptance of the new frontend and a physical-device check remain open. Player files and agency document drafts still have separate permissions and entry points. Exact document handoffs are a separate review item.

## Club request workspace

The request brief and its source sit next to the recorded candidates, shortlist and pitch history on desktop. On a phone the two sections stack. A private draft, a prepared link and a send confirmed by an agent each have their own status. Replies submitted through a link retain their unverified identity status. Owners and admins can record the most recent response they received outside ReDream by phone, email or another channel. The workspace displays the latest entry from each source and uses the same saved pitch history in Player → Deals.

Pitch review now uses the exact match ID. Two requests at the same club can refer to the same player without sharing history. The existing one-active-link-per-player-and-club publication guard remains in effect. Standalone shares with no saved request context stay outside this history.

All 2,354 automated tests pass. The new PostgreSQL fixture verifies the exact request and match, tenant and role boundaries, and retry-safe saves that preserve the separate link response. The 390px browser journey exercises the full sequence with synthetic data and shows the same reply on the player's Deals tab. Existing request, deal, salary, keyboard and recovery browser checks pass. TypeScript and the production build pass, with the workspace entry at 123,317 of 150,000 gzip bytes. A read-only staging check confirmed the existing dependencies and that the new migration is pending.

### Staging release order

1. Apply `20261104133424_connect_player_detail_to_club_and_work.sql` using the checks above.
2. Apply `20261104142417_exact_club_request_pitch_history.sql`. SHA-256 `b2e8a960c5ee0a02d6caef191bd12623c79299251710cc0f353760d6f8d76d83`. Check RLS and the service-role-only grants for `platform_server_club_request_pitch_history` and `platform_server_record_club_pitch_staff_reply`.
3. Deploy `supabase/functions/agency-market/index.ts` to ReDream staging. Deploy the matching frontend after both RPCs are available.
4. With a labelled synthetic player and two requests at the same club, shortlist the player, create a draft, publish a link, confirm a test send, and record a reply. Reopen the request and Player → Deals. Check the same reply and the exact return link. Verify that the second request stays separate, that restricted staff cannot read the history, and that a retry retains a single reply. Repeat the controls on a physical phone before promotion.

## Players and Requests screenshot workflows

- Players uses a nested roster filter, a profile identity rail, a club contract card and saved provider links. Agent Management shows the assigned staff and opens the existing searchable multi-select editor. Explicit Save keeps the current revision and permission checks in place.
- Requests adds a sortable table, row selection, column visibility, search and filters. The editor saves age and commercial ranges, foot, origin, loan terms, notes, contact and staff on the existing request. The phone layout keeps the same review, shortlist and pitch journey. The seasonal preference is separate from official registration dates.
- Transfer windows uses FIFA's public registration periods with country search, status counts, three categories and a scrollable timeline. The local check returned 203 associations from the official source. The drawer handles an unavailable feed with Retry. [FIFA registration periods](https://inside.fifa.com/transfer-system/player-transfers)

Local evidence includes 2,356 automated tests, database tests for exact decimal ranges, tenant and role checks, stale revision and atomic create, and browser fixtures for saving and reopening a request, filters, timeline recovery and keyboard dismissal. Players and Requests were exercised at 320, 390, 768 and 1440 pixels. The desktop table, editor and timeline were compared with the supplied references at 1512 × 828. TypeScript and the production build passed. The workspace entry is 123,336 of 150,000 gzip bytes.

Remaining screenshot differences include a verified next-match card, a roster Strategy filter backed by saved data, and safe club reassignment for a request with linked candidates and pitches. The request editor keeps position and currency as editable text so older values remain usable. Agency agreement expiry is managed through the agreement workflow. Full reference parity and signed-in staging acceptance remain open.

### Complete staging manifest for this candidate

1. Apply `20261104133424_connect_player_detail_to_club_and_work.sql` and `20261104142417_exact_club_request_pitch_history.sql` in order, using the checks above.
2. Apply `20261104184712_club_request_editor_preferences.sql`. SHA-256 `adf43ce9d1810d45123f3e4ef21c29ef4936df1223491ccd38f223358fac179d`. Check that the create wrapper is service-role only, the patch rejects stale revisions and restricted staff, and reads and assignments stay within the selected tenant.
3. Deploy `agency-market` and `agency-os` to ReDream staging, then the matching frontend. Confirm that the official transfer-window feed loads from the deployment.
4. With staging fixtures, create and edit a request, reopen its exact record, and verify assignment, ranges and the shortlist-to-reply journey. Repeat with a restricted staff member and a second tenant to confirm isolation, then verify the modal and timeline on a physical phone.
