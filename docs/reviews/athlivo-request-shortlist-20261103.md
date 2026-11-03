ReDream | Club request shortlist workflow | 3 November 2026

Purpose
Athlivo's Club Requests guide separates an internal shortlist from actually pitching a player. ReDream already has tenant-scoped recorded player matches and an existing pursuit/pitch flow, but did not let a DJM owner shortlist a player within the request. This release adds that one missing action without duplicating records or bypassing player-career, salary or eligibility reviews.

Behaviour
- In Opportunities > Needs, expand a request and review its recorded player opportunities. For a player match at suggested/reviewing/shortlisted stage on an active unexpired request, the owner can shortlist or remove them.
- The shortlist is strictly internal: it never creates a pitch or starts a deal; the existing Open opportunity action remains the path to pursue or pitch.
- The match status is saved into the existing djm_os.player_matches row, with a tenant-scoped, owner/admin-checked RPC and an immutable platform.audit_events record naming the actor, previous status and action.
- A match already pitched or progressing beyond the internal shortlist cannot be downgraded from the shortlist button. Expired or archived requests, archived players and wrong-tenant IDs are rejected. No automatic records are created or backfilled.
- The interface displays a confirmed shortlist marker, saving/error feedback and never claims a successful write after a failed API call. Once the record refresh succeeds, server data supersedes local confirmation state.

Verified
- PGlite: owner/agent/tenant restrictions, single mutation, idempotency, removal, audit trail, pitched-state protection, expired request, and restricted EXECUTE grants.
- Browser: 320/390/768/1440 request/pursuit flow; at 390 also tests simulated save failure, shortlist, remove, and zero external pitch actions.
- Staging database: migration source version 20261103120209 applied; anon/authenticated EXECUTE revoked, service_role allowed; no shortlist audit events created during checks.
- Staging Edge: agency-os version 72 ACTIVE, JWT still required, guarded action present. Production database and Edge intentionally not changed until release approval and CI.

Next gaps relative to Athlivo
Automatic exact/loose roster matching with provenance and live recalculation, recording a pitched-to club contact from request view, accepted/declined response workflow across player and club, structured transfer windows and budget ranges, and external share controls still need deliberate design and verification. Do not call this full Athlivo parity.

Release
Merge preceding PR #295 first (done). Rebase this branch onto merged main. Require green GitHub verify, full browser workflows and visuals; then apply reviewed migration and deploy exact agency-os route to production before merging the frontend. After merge, confirm both Vercel production deployments share the merge SHA and run signed-in owner + limited role acceptance. No real player shortlist should be fabricated just for smoke testing.
