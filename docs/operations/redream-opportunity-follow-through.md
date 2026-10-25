# Opportunity review and decision continuity

Scope: REL-01 / REL-03 / DAY-03 dependencies, UX-03 / UX-04 / UI-06. Stacked on draft PR 266 at `aac5d27fc884851dcd48e1dc7c8f46e527e2b3e9`. All 46 programme rows and 17 surfaces remain retained. No production change.

## Actual journey findings and repairs

1. Actual Northstar Opportunities -> Live deals opens an unowned existing deal directly into owner assignment. The existing overview works through its supported scoped deep link but is not the row's consistent destination. The row's mouse/Enter/Space activation now always opens that existing overview; its explicit Assign owner / Fix now action remains unchanged and still prepares the same approved server action.
2. Actual assignment dialog leaves keyboard focus on the covered deal row and exposes background controls. The shared action drawer now owns initial and pending focus, Tab wrap, background isolation, busy Escape suppression and return to its actual opener. It remains in its existing tenant-themed DOM branch; scoped ancestor-sibling isolation reuses the existing leases, avoiding a new overlay or branding model. The opener survives development effect replay. Result transitions restore neutral Close focus when the previous control disappears. Existing approval/Undo/business mutations are unchanged.
3. The existing full-page overview also covers the workspace while leaving it keyboard-reachable. Its page mode now isolates the covered branch, owns its scroll lease, focuses its named heading and restores the actual opener on Back/Escape. A nested modal owns Escape; transition to another modal does not steal focus. The existing alternate drawer mode is retained.
4. Critical decision facts were truncated to one line and the close control shrank to 32px. Recorded context now wraps and the close target is at least 44px. Generated input/select labels explicitly use the existing field label, so staff choices do not become part of the control's accessible name.

No fact, score, probability, player availability, send, owner or commercial value is invented or changed. The existing deal-control/readiness meaning is preserved. Row review never implicitly prepares ownership. Staff/player/club visibility remains enforced by the unchanged server readers/writers.

## Validation

- Actual before screenshots 01 (Needs), 02 (Live deals), 03 (assignment), 04 (supported deep overview) are saved and inspected in `/tmp/redream-platform-programme/opportunity-follow-through-pass/`. The actual assignment has focus outside its dialog and no inert background. No existing record is edited or assigned during this audit.
- A focused actual-browser regression fails on the old nested action's missing focus. Expanded pursuit checks pass page/drawer parent presentations at 320/390/768/1440, with pending preparation Escape, focus/Tab/background isolation, long draft input, child dismissal, exact opener return, scroll leases and 44px Close.
- Four-width opportunity checks pass mouse/keyboard overview, explicit owner action, no ownership preparation on record open, readable long blocker, page heading/background/Back/Escape and nested modal return. The script is wired into the existing browser CI fixture; no new framework or dependencies.
- Existing short-screen overlay checks pass, as does the existing 250-player/exact-record/search/account/coordinator regression before the final page-isolation addition. Thirty focused opportunity/pursuit/deep-link/visibility-contract tests pass. Final `npm run check` passes 2,130 tests, all TypeScript projects, production build and bundle limits (workspace gzip 144,783 / 150,000 bytes). Hosted acceptance remains pending.

## Exact release manifest and remaining acceptance

Frontend only, branch `codex/redream-opportunity-follow-through`, staging project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `jesseedge10-8415s-projects`. Verify exact full pushed SHA and READY before assigning only `redream-systems-staging-jesseedge10-8415s-projects.vercel.app`. Immediate frontend rollback: `dpl_FgyZhjdtjwftS1JEiM8K7dTwXosc` / `e7451a43030c2da264793870cd48319b528c284b`.

No migration, database row, Edge Function, Supabase configuration, secret, provider, schedule, external send or production operation is required. Never execute the excluded relationship migration or replay database history. Current staging contract migration 20261025133959 and existing agency-os/public-profile/share functions remain as recorded in the parent dossier manifest.

Pending: draft publication, exact staging frontend, actual read-only owner list/overview/control/nested focus/Back/Escape and mobile context checks, original-data hashes, exact-head CI. No synthetic hosted fixture is necessary for this frontend-only read/prepare navigation acceptance. Parent PR 266 final documentation head `aac5d27fc884851dcd48e1dc7c8f46e527e2b3e9` passes verify and full browser CI on run `40228248061`.

This does not establish the complete connected opportunity -> approved profile -> club send -> response -> accountable follow-up journey. Continue that same existing workflow after this navigation/focus boundary, inspecting the actual scoped deal DTO and existing profile/follow-up entrypoints before adding anything. Real provider, staff/device/independent-agency and remaining programme/UI gates stay open.

The supported actual staging overview currently has no direct player-profile/share or ordinary follow-up entrypoint among its visible actions (control, negotiation and closeout). This is retained as the next REL-01/REL-03 investigation after this read/navigation boundary: inspect the actual scoped DTO and reuse the existing player/profile/follow-up paths, with no duplicate models or assumed sends.
