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
