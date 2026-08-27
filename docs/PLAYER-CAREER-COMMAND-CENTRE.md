# Player career command centre

## Product assessment

The previous player area was useful for administration but not compelling enough to earn a professional player's weekly attention. It exposed individual actions without connecting them to the player's real career questions: Am I ready when an opportunity appears? What does DJM need from me? Is my evidence strong enough? What is the next decision I should prepare for?

This slice changes the player product from a collection of forms into a private career operating system. It deliberately does not imitate a scouting database, expose internal CRM data or invent performance analytics.

## What was built

### Today (`/home`)

- A single highest-value weekly action, derived from current player context.
- A three-step plan that combines DJM requests, check-in state and readiness gaps.
- Clear status for opportunity readiness, contract context, availability, club-profile publication and footage.
- The latest player-visible DJM message or announcement.
- Direct paths to check in, update an asset, view the club profile or contact DJM.

### Career (`/career`)

- A seven-part opportunity-readiness model with a direct fix route for every component.
- An opportunity room for the assets DJM and clubs actually need: profile, footage and documents.
- Contract, mobility, current-club and representation context.
- A career timeline that preserves source attribution and never turns missing statistics into zero.
- Eight practical player playbooks: match evidence, a 48-hour opportunity pack, agent-call preparation, contract checkpoints, moving abroad, media preparation, setback communications and money-safety questions.
- DJM-published resources when genuinely useful resources exist. Existing shortcut-style records are excluded because they duplicate navigation rather than add professional value.

## Readiness model

The score is an operational preparation indicator, not a talent rating. It answers whether the player has the current information and evidence needed for DJM to act quickly.

| Component | Weight | Evidence |
| --- | ---: | --- |
| Identity and football profile | 18 | Required current player fields |
| Private career context | 15 | Contract, goals and mobility context |
| Weekly signal | 16 | A recent weekly check-in |
| Match evidence | 16 | Usable player footage |
| Documents | 12 | Current player documents |
| Club-facing profile | 15 | Published recruitment profile |
| Representation clarity | 8 | A current player-visible agreement |

The score and plan are computed from existing RLS-protected records. No new production tables, policies or data mutations are part of this slice.

## Privacy and security boundaries

- Staff-only `player_opportunities` are not queried or revealed.
- Hidden/internal request signals are not surfaced.
- Only `player_agreements.visible_to_player = true` records are requested.
- Player bootstrap uses explicit safe columns rather than the whole `players` row.
- Resource URLs are limited to safe `http`, `https` or app-relative destinations.
- Readiness is clearly labelled as preparation, never performance, selection quality or market value.
- Injury, money and contract playbooks are preparation checklists, not medical, legal, tax or financial advice.

## Verification evidence

- Production build and TypeScript checks pass on Next.js 16.3.3.
- Production dependency audit reports zero known vulnerabilities.
- Desktop and mobile browser passes completed for Today and Career.
- Unauthenticated access to `/career` redirects to sign-in.
- No browser console errors or Next.js error overlay were observed.
- Automated accessibility checks reported zero violations after contrast and ARIA corrections.
- Toolkit filtering and playbook expansion were exercised in-browser.

Visual QA used a temporary local-only player fixture because no test-player credentials were available. That fixture was removed before the final build and is not part of the repository or production data.

## Existing Supabase advisor backlog

The live project audit found pre-existing database advisories that this UI-only slice intentionally does not change:

- 75 authenticated GraphQL table-exposure warnings in the `djm_os` schema.
- 2 anonymous GraphQL table-exposure warnings for `player_public_profiles` and `site_content`; these may be intentional public surfaces but should still be reviewed.
- 10 executable `SECURITY DEFINER` findings across `get_club_share`, `track_club_share_view`, `validate_player_invite`, `validate_player_invite_v2`, `create_player_invitation` and `djm_attach_whatsapp_thread` (some functions are reported for both anonymous and authenticated roles).
- `pg_net` is installed in the `public` schema.
- Leaked-password protection is not enabled in Auth.
- `notification_outbox` has RLS enabled with no policies. This is deny-by-default, but its intended access model should be documented.
- 46 performance infos for unused indexes. These should be observed over a representative production period before any removal.

This backlog needs a separate migration PR, privilege audit and regression plan. It should not be patched directly in production as part of the player-interface release.

## Recommended next phases

1. Add persistent development goals and resource completion so player plans survive week to week and DJM can coach against agreed outcomes.
2. Create a deliberately player-visible opportunity model with stage-specific actions and disclosure controls, rather than exposing the staff pipeline.
3. Add licensed performance-data ingestion with provenance, review and player consent; keep manually entered or unknown statistics visibly distinct.
