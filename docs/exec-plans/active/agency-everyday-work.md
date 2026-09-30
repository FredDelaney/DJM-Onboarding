# ReDream: everyday agency work

Source: user brief, 30 September 2026.

## Product rule

Make five jobs easier: manage players, capture demand, find the right player,
reach the right person, and close the deal. Each change must say what the agent
can now see, understand, or do differently.

Keep Home, Players, Opportunities, Network and Calendar as the everyday
navigation. Business is for management. Tell ReDream stays globally available.
No additional generic chat, dashboard widgets, unrelated social features, or
public marketplace before real network usage. Facts require provenance;
external sharing and material actions require approval.

## Build sequence and gates

1. Visual, mobile and speed QA across the existing primary and detail screens.
2. Instant Player Truth and one-step player import using permitted sources.
3. Simplify the player page.
4. Representation agreements and expiry intelligence.
5. Exceptional club-facing Player Profile with explicitly approved fields.
6. Multi-player Lists / Pitch Rooms and accurate engagement analytics.
7. Club need, explainable matching, shortlist and pitch in one workflow.
8. Sourced football deadlines and transfer-window consequences.
9. Club intelligence and evidence-backed potential needs.
10. Relationship intelligence and useful next contact actions.
11. Connected-work extraction with one-tap approval.
12. Suggested, prepared and permitted automated actions.
13. Deal, commission, invoice, receivable and payment continuity.
14. Trusted, explicitly scoped agency-to-agency sharing.
15. Consider a broader marketplace only after usage supports it.

Phase 1 must pass before Phase 2. Lists / Pitch Rooms, Representation Control
and Instant Player Truth are the highest-value products after that gate.
This roadmap does not authorize production deployment or external messages.

## Phase 1 acceptance

- An unfamiliar football agent can understand the main work on an iPhone in 30 seconds.
- One dominant action, readable cards, short copy, no dead ends.
- Five main screens and player/contact/club/opportunity details work at narrow widths.
- Loading, empty, failed and refreshed states tell the truth and preserve useful work.
- Navigation feels immediate; secondary reads do not block primary content.
- Keyboard focus, current location, disclosure state and touch targets are clear.
- Cross-tenant boundaries and player/club visibility contracts remain intact.

## Current implementation slice

Branch: `codex/agency-visual-qa`, based on `origin/main` at `a04f93a`.
The old local opportunity checkout is preserved, including all uncommitted work.

Home previously reported an all-clear before background reads completed and
converted failed reads into empty data. It now distinguishes pending, failed
and successfully empty states, preserves previous evidence on refresh failure,
and offers retry. Attention can remain usable while the daily context loads.

Home has Needs attention, Today, What changed and Recently handled by ReDream.
Recent changes use only conversations already returned by the authorised API;
links retain the current workspace and open the recorded player, recruitment
target, contact or club. Open follow-ups are no longer counted as completed
work. Empty change sections stay hidden. Calendar navigation uses client-side
navigation. The active workspace tab and attention disclosure expose their state
to assistive technology.

## Remaining acceptance gate

This slice is not completion of Phase 1. Verify all five authenticated screens,
mobile drawers and keyboard flow with live tenant data, plus slow/failing network
behaviour and the unfamiliar-agent exercise. A synthetic layout check cannot
certify authentication, live provider data, or the full agent workflow.
Do not start new import, signing, marketplace or automation features before this gate.

## Verification for this slice

- All 1,309 tests pass, including read-state and workspace-link regressions.
- TypeScript and production build pass with placeholder public configuration.
- Temporary synthetic Home preview checked at 390px and 1280px: no horizontal
  overflow; loading, empty, failure and retry states verified; no console errors
  or framework error overlay. The preview route was removed after verification.
- This does not certify live authentication, end-to-end navigation or provider
  connections. No database, production deployment or external message changed.

## Opportunities follow-up

Unread Opportunities tabs no longer receive fabricated empty payloads or zero
counts. A failed background read retains cached work, records the failure, and
offers retry. Main-screen load failures now offer a visible retry on mobile as
well as desktop. Opportunity filters expose their selected state.

Validation: all 1,311 tests, TypeScript and production build pass. A temporary
390px synthetic Opportunities preview verified unread, failure, retry and
confirmed-empty states without horizontal overflow, console errors or an error
overlay. The preview was removed. Authenticated five-screen acceptance remains
open; these checks do not certify live data or complete Phase 1.

## Calendar and deployment checkpoint

Calendar meeting preparation ignores stale responses after close or unmount.
The drawer receives focus, contains keyboard navigation, closes with Escape and
restores the opening control. Calendar range buttons expose their selected state.
A deferred synthetic request verified that closing, then completing the request,
does not reopen the drawer. Keyboard focus and dismissal passed in the browser.
All 1,313 tests, TypeScript and production build passed after merging main through
73d796c. Temporary preview routes were removed.

PR: https://github.com/FredDelaney/DJM-Onboarding/pull/174
An explicit staging preview deployment was attempted with authenticated Vercel
CLI 61.1.0. Vercel rejected it with api-deployments-free-per-day (100/day), advising
retry in 24 hours. No new deployment is live. The target was redream-systems-staging,
project prj_uMBOnfwXjmglJXpJblkGqNrDWAmK, preview environment. No production or
database changes were made. Resume deployment after the limit resets, then perform
authenticated five-screen acceptance.

## Recruitment and Network navigation checkpoint

Recruitment detail responses are bound to the selected target and request. Leaving
a target invalidates its pending reads and post-save screen updates. Switching
targets clears the previous contact draft; retrying the same target does not.
Failed or unavailable target reads offer retry. Network no longer keeps a previous
contact displayed when a different requested contact is absent from the directory.

Browser regression: start Alpha read, switch to Bravo, complete Bravo, then complete
Alpha. Bravo remains displayed and its URL remains selected. The temporary fixture
used deferred promises and synthetic records, and was removed afterward.
PR #174 remains open. Staging deployment and authenticated acceptance remain pending
the previously reported Vercel deployment limit.
