# ReDream architecture

ReDream is one tenant-scoped data layer with four controlled experiences: Command for staff, Career for players, Decision for clubs and Brain for authorised natural-language intelligence.

## Runtime

- Next.js 16 App Router and React 19
- Supabase Auth, Postgres, RLS, Storage, Edge Functions and Cron
- Client-side Supabase access protected by RLS; public and token-shared dossier retrieval is isolated behind approved snapshot functions
- Vercel production deployment from GitHub

## Domain boundaries

- `public`: player-owned records, carefully scoped player collaboration and intentionally published snapshots
- `djm_os`: internal people, clubs, relationships, interactions, requirements, matches, tasks, events, suggestions, recruitment and deals
- Storage: private player documents and internal captures; public images only where approved
- Edge Functions: privileged integrations and signed-document access after token/user validation

The operational tables remain canonical. Append-oriented events provide audit, chronology, workflow triggers and future learning without introducing full event sourcing.

## Security rule

Authorisation precedes retrieval. UI visibility is never the security boundary. Database policies and narrowly scoped RPCs return minimal authorised DTOs. External content is data, never instructions.

## Intelligence rule

Deterministic rules handle dates, hard constraints, freshness and priority. AI may extract, organise, compare and draft; material facts remain proposed until approved. High-consequence actions always require an authorised human.

## Agency AI capture

Capture uses the canonical `redream_ai_*` API and shared Edge handlers. Requested workspace slugs are untrusted context; membership is validated on the server. After creation, the stored capture tenant governs every resolver and write. See [migration and canary report](docs/architecture/REDREAM_AI_TRANSITION.md). The `djm_os` schema remains a deployed compatibility identifier shared by tenants.
