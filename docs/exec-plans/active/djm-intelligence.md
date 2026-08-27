# DJM Intelligence execution plan

Status: active
Started: August 27, 2026

## Baseline

- Next.js 16.3.3, React 19.2.8, TypeScript 5.8 and Supabase JS 2.57
- Baseline `npm run typecheck` and `npm run build` pass
- No lint or automated test command existed at start
- Live database contains 78 RLS-enabled public/internal tables, existing truth/event/suggestion/match/deal foundations and 329 internal events
- Current Supabase advisories: 90 security notices and 46 unused-index information notices. The material backlog is documented in `docs/security/SECURITY_AND_PRIVACY.md` and is not being changed directly in production in this run.

## Release objective

Deliver the highest-value safe vertical slice:

1. Unify internal navigation around Command, Players, Market, Deals and Brain.
2. Replace fake precision with explainable qualitative decisions and explicit hold states.
3. Make Command a modern action surface with evidence and human control.
4. Add a real structured Brain experience that refuses unsupported answers and remains useful without an AI provider.
5. Separate Market requirements from Deals execution while keeping existing URLs working.
6. Strengthen Career around the player's week, development, evidence, decisions and service—not club activity.
7. Rename and refine the club dossier as an intentional Decision Room while preserving PDF parity and secure shares.
8. Add an additive migration for visibility, truth, provenance, events, approvals, player goals/service and Decision Room snapshots. Do not apply it to production in this run.
9. Add domain tests, CI commands and long-term documentation.

## Phases

- [x] Repository, live schema, migration, policy and baseline audit
- [x] Product/architecture/security source-of-truth documents
- [x] Shared intelligence domain logic and tests
- [x] Command/navigation/Deals/Brain product slice
- [x] Career and Decision experience updates
- [x] Additive schema and RLS migration
- [x] Typecheck, tests, production build and public desktop/mobile browser verification
- [ ] Authenticated staging acceptance for Command, Players, Market, Deals, Brain and player Career
- [ ] Final production handoff

## Verification record

- Six deterministic domain tests pass, including hard blockers, insufficient evidence, hold, overdue action, qualitative deal credibility and Brain intent routing.
- TypeScript passes with no errors.
- Next.js production build passes with 21 routes, including new `/deals` and `/brain` routes.
- Public desktop and 390px mobile browser checks show meaningful content, zero error overlays, zero console warnings/errors and no horizontal overflow.
- Protected routes correctly redirect unauthenticated sessions to `/sign-in`.
- Live access alignment found one of two authorised staff profiles missing an active `djm_os.team_members` row. The prepared migration adds a transactional profile-to-membership trigger and safe backfill so all authorised admins/scouts reach every internal workspace after rollout.
- Authenticated visual acceptance remains a staging gate because no test browser session or production mutation was authorised.

## Rollout boundary

No production migration, external message, production deployment or destructive operation is authorised by this plan. Integration features remain visibly disconnected until real credentials and licences exist.
