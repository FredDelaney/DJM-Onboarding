<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.

This block is written and re-added by `next dev`. Verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# DJM Intelligence repository map

This is the production Next.js 16 / React 19 application for DJM Sports Management. Supabase Auth, Postgres, RLS, Storage, Edge Functions and Cron provide the backend.

Before changing a domain, read its source of truth:

- Product: `docs/product/DJM_INTELLIGENCE.md`
- Player intelligence: `docs/product/PLAYER_INTELLIGENCE.md`
- Visibility: `docs/product/VISIBILITY_CONTRACT.md`
- Architecture: `ARCHITECTURE.md` and `docs/architecture/`
- Security/RLS: `docs/security/`
- Environment and testing: `docs/operations/`
- Active implementation: `docs/exec-plans/active/djm-intelligence.md`

Critical rules:

- Preserve existing player, admin and club-share flows.
- Never expose DJM-internal data to players or public club shares unless explicitly approved for that surface.
- Preparation/readiness, player quality, Club Match and Opportunity Probability are separate concepts. Never turn preparation or profile completeness into a talent score.
- DJM Player Score is permitted as a distinct football-level measure only when evidence and benchmark coverage support it. Missing evidence must remain missing.
- Club Match percentages are contextual fit scores, not player-quality scores.
- Predictive percentages must expose meaning, evidence, confidence, freshness and model/manual provenance.
- Keep AI optional, sourced and approval-based for material external actions.
- Use additive migrations and preserve migration history.
- Keep the football pitch visual and useful football graphs. Simplify duplication, not football value.
- DJM-managed operational data should be editable in the UI when permissions and provenance allow it.
- External research/profile links must be manageable from the UI and retain saved-link provenance.
- Do not use Unicode U+2014 in user-facing content. `npm run sanitize:text` enforces this before development, checks and builds.
- Do not deploy or mutate production without explicit authorisation.
