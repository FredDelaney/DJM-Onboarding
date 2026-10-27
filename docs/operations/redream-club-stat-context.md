# ReDream club-profile statistic context

Status: local/full CI pass; exact frontend and workers deployed to staging. Hosted publication/PDF canary and production acceptance remain open. This PLY-02 increment is stacked on PR 252 and does not expand either earlier migration manifest.

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

## Staging deployment checkpoint

PR 253 head `98c77eed1e7a1a583a2d3bc314392868868a9b64` passed verify and the full browser job (run `40001447904`, browser job `120578279284`). Automatic Vercel status success initially represented an ignored/canceled build. An explicit staging-only preview build was therefore created for that exact SHA: `dpl_Bo3dRZwtNMMH2kenqvXYiQ4JjnSa`, READY. Only `redream-systems-staging-jesseedge10-8415s-projects.vercel.app` was reassigned; other domains and production projects were not promoted. The previous alias target is `dpl_jL1WDCAdNxkkoWb6L7HWGkux6F7A`.

The staging project's preview/production client URL was verified as `https://ltvmopvarlnidiozvpow.supabase.co`. Staging `agency-os` 56 (JWT true) and `player-profile-public` 9 (JWT false) contain exactly the reviewed recursive source files. The public worker's older season-selector dependency was brought into line with the already-deployed staff selector; reserve/senior matching remains part of publication acceptance. Previous worker source bundles were preserved for rollback. Unauthenticated agency access returns 401; an unknown public slug returns `{data:null}`.

Signed-in Northstar Home cold-loads successfully and its actual player-review disclosure works without displacing the five business priorities. Existing session and tenant context are retained. Full hosted statistic publication/public-read/PDF acceptance is still required; these deployment/read checks do not replace it.

The signed-in preview exposes a pre-existing overlay defect: its fixed surface is confined inside the workspace, and its toolbar can be off-screen after opening from a scrolled profile. This is retained as UX-03's next repair, not accepted as visually complete by the content/branding check.

The actual publication canary also exposed a required database follow-up: the legacy career-timeline trigger rewrites the approved snapshot's 24 reserve appearances to 55 combined appearances and removes its evidence metadata. The automatic public endpoint masks that stored error by selecting 24 again. The no-migration manifest above describes this PR's code scope, not completion of hosted publication acceptance. The separate required repair is recorded in `redream-profile-stat-publication-recovery.md`; publication remains unaccepted until its real trigger-path tests and hosted canary pass.
