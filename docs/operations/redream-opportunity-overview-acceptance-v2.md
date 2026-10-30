# Opportunities release acceptance: evidence-first work overview

Status: implementation candidate only. This is not a release approval.

Source baseline: PR #284 commit b03dfc232823ccbc24c6f268ec9d25b04e639a84.

Changes: read-only Overview consumes existing `redream_opportunity_connected_context` (tenant-scoped). Only the existing server's exact need-scoped `open_followup` may be labelled a recorded follow-up, including its due date and owner state. Canonical deal and club-need ownership names are shown when supplied. Proposed next moves remain labelled as suggestions, not tasks, club interest, meetings or confirmed communication. Player access-route contacts never become owner assignments.

Do not claim world-class until:
- [ ] `npm run check` including bundle limits, TypeScript and tests passes on exact source.
- [ ] `npm run check:browser` passes, with the existing club-need `Manage` click tested without forced clicks or ignored errors.
- [ ] Run real staging with owner, ordinary-agent and revoked user, including independent agency data. Verify no cross-tenant work is returned.
- [ ] Check current and failed reads for Market, Deals and Connected Context. Never show stale or incomplete work as an unqualified complete list.
- [ ] Check club request -> player candidates -> pitch, proactive player placement, direct interest, out-of-order offer, multiple offers and shared staff actions.
- [ ] Verify one true source of task ownership/due date across Home, Opportunities and Calendar.
- [ ] Inspect phone widths 320/390, tablet 768 and desktop 1440 with actual text, long names and keyboard navigation. Check 44px controls, no horizontal scrolling and focus restoration.
- [ ] Verify incoming capture Save, retry, approval, Undo and an explicit user confirmation before external sends.
- [ ] Test 100+ opportunities, late response, network loss, sleep/resume and a slow 3G-equivalent connection.
- [ ] Confirm staging migration/Edge-function parity and release rollback; production change requires separate approval.

Known independent blocking evidence: CI run 41125636091, browser_journeys failure in `scripts/opportunity-follow-through-browser-qa.mjs:32` while Playwright clicked a `Manage` control; the HTML root intercepted pointer events. `verify` passed. Root cause has not been established. Do not hide this failure or bypass it by changing the test to a forced click.
