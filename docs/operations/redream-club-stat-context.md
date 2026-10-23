# ReDream club-profile statistic context

Status: locally validated; hosted staging and production acceptance remain open. This PLY-02 increment is stacked on PR 252 and does not expand either earlier migration manifest.

## Result

The public player profile and its actual PDF export describe the figures the agent chose. Automatic figures retain their real season, club, competition, source and checked date. Selected historical or mixed-period figures keep their individual evidence. Custom figures and older snapshots without that metadata explicitly show what was not recorded; they never inherit the latest career row's period or source.

The existing publication writer receives only an explicit allowlist of public football evidence. Private notes, ownership and commission fields are excluded. Agent selection, custom values, restricted-staff projections, verified/publication guards, tenant branding and source visibility remain unchanged. Missing goals/assists do not produce a fabricated G+A total, and career charts omit unknown metric values while retaining recorded zeroes.

## Exact deployment manifest

- Database migrations: none. The existing snapshot JSON contract already accepts the additional evidence fields.
- Frontend: this increment's reviewed application revision, after both parent PRs and this PR have passed their release gates.
- Edge Functions: `agency-os` with JWT verification enabled; `player-profile-public` with JWT verification disabled and its existing public visibility guards preserved. Deploy their reviewed recursive source dependencies, including the new pure helper `_shared/profile-stat-evidence.ts`.
- No other worker, secret, configuration, schedule or customer-data change is required by this increment.
- No backfill, automatic republishing or stored-statistic rewrite. Older published custom/selected snapshots without metadata remain explicitly unattributed until an agent reviews and republishes them. Existing automatic-stat refresh behavior is retained.

The parent manifests remain separate: PR 251 has exactly its two guarded change-review/RLS migrations; PR 252 has exactly its one guarded owner-branding restoration. Never replay historical migrations or the excluded relationship-entrypoint migration.

## Evidence and release gate

- `npm run check`: 1,993 tests pass, all TypeScript projects pass, production build and bundle limits pass.
- Focused dossier/publication tests: 25/25 pass. The real HTTP handlers prove selected historical metadata reaches the canonical snapshot RPC, custom figures stay unattributed, automatic zero values retain their period and private fields are absent. Restricted staff retain the existing projection. Existing unpublished/unverified denial coverage passes.
- Extended existing `profile-enhancements-browser-qa.mjs`: custom, automatic and mixed-period preview context; real PDF downloads; no save/publish during preview/download; 320/390/768/1440 widths; existing photo, stale-selection and retry cases pass.
- Actual PDFs were rendered and visually inspected, including both selected-profile pages. Missing appearances are absent from the graph, a recorded zero remains visible, single-stat bands have no stray divider, and per-figure evidence wraps legibly. Synthetic QA PDFs and screenshots are retained in the existing CI artifact under `/tmp/redream-platform-programme/club-stats`.
- React review: derived presentation data only, no new network request/effect, pure dependency shared by frontend and workers, and no expansion of private data projections.

Before any promotion, require this PR's CI/review and staging validation of the exact deployed sources. Use isolated staging fixtures to compare staff preview, publication, public read and PDF for automatic, selected historic and custom modes. Retain revoked-role, unpublished and unverified denials. Production release requires its explicit gate; local fixtures and desktop screenshots do not satisfy physical iPhone or independent-agency acceptance.
