
<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# DJM Intelligence repository map

This is the production Next.js 16 / React 19 application for DJM Sports Management. Supabase Auth, Postgres, RLS, Storage, Edge Functions and Cron provide the backend.

Before changing a domain, read its source of truth:

- Product: `docs/product/DJM_INTELLIGENCE.md`
- Visibility: `docs/product/VISIBILITY_CONTRACT.md`
- Architecture: `ARCHITECTURE.md` and `docs/architecture/`
- Security/RLS: `docs/security/`
- Environment and testing: `docs/operations/`
- Active implementation: `docs/exec-plans/active/djm-intelligence.md`

Critical rules: preserve existing player/admin/share flows; never expose DJM-internal data to players or club shares; never turn preparation or matching into a talent score; keep AI optional, sourced and approval-based; use additive migrations and do not deploy or mutate production without explicit authorisation.
