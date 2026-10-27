# Preserve approved profile statistics during publication

Status: locally reproduced and repaired; CI and hosted repair acceptance remain open. PLY-02 follow-up to PRs 253 and 254. Production is unchanged.

## Actual failure

The isolated staging canary correctly displayed 24 reserve appearances in the staff profile. Normal Verify & publish passed 24 and its source evidence to the canonical publisher, but the saved snapshot contained 55 combined senior/reserve appearances without the evidence metadata. The public automatic endpoint masked this by selecting the correct row again. Selected/custom profiles and consumers of the stored snapshot could still receive the wrong figures.

`private.set_public_profile_career_timeline()` unconditionally called the old full-period aggregator on every profile insert/update. Its actual source hash matches staging and production: `0c664e69200fe0dea818336f10165ff8`. HTTP-handler tests with an RPC mock did not exercise this trigger; the regression now uses the actual PostgreSQL publisher, publication guard, career projection, aggregator and refresh trigger together.

## Exact migration manifest

Only `20261023191512_preserve_approved_profile_stat_snapshots_v1.sql` belongs to this repair. There is no additional frontend or worker change. The earlier frontend/two-worker and three-migration manifests remain separate; do not replay them.

The migration changes only the verified trigger's headline-stat assignment. The existing guarded `publish_snapshot` context preserves the approved array, including source metadata, recorded zeroes, custom values and intentional empty selections. It must match the canonical player's tenant; browser roles are explicitly denied that path. Metadata/refresh writes keep an unchanged approved selection. Unscoped legacy/raw stat edits retain the existing authoritative filtering.

Reviewed-career projection and source-link/market sanitization still run. Publisher membership, verification, player lock, snapshot allowlist, privacy projection, tenant triggers, function owner, search path and grants are retained. The migration refuses unknown body/configuration/ACL drift. It performs no backfill, republishing, stored-stat rewrite or customer-data mutation.

## Evidence and staging gate

Thirteen actual PostgreSQL publication/reconciliation tests pass, including four added cases: reproduce the 55-appearance error; preserve automatic/historical/custom/empty snapshots and source privacy; retain approved figures through metadata and actual career-refresh updates while rejecting invented raw totals; deny browser/wrong-tenant contexts and preserve server-only publisher access; and refuse trigger drift without changing owner/grants.

`npm run check` passes all 1,997 tests, TypeScript projects, production build and bundle limits (143,963 / 150,000 gzip bytes). CI/review remains required. For controlled staging acceptance, verify the exact reviewed function/source/ACL first, apply only this migration with bounded locks and its canonical ledger version, then repeat the existing isolated player's normal UI publication. Compare the actual returned/stored snapshot, public automatic/selected/custom responses, branded web preview and rendered PDF files. Exercise actual unpublished/unverified denial and complete fixture cleanup. Do not infer acceptance from the automatic public endpoint alone.

The profile-dialog frontend is PR 254's separate deployment. Its exact CI/build/alias gate remains unchanged. Production promotion requires explicit authorization and the complete reviewed release manifest; no production canary or publication is included.

## Rollback

Preserve the actual pre-release function definition and ACL. Restore only that reviewed function body if required, leaving every profile, career row and migration-history entry intact. Restoring the old body reintroduces the proven snapshot-clobbering defect, so it is a deliberate rollback decision, not an accepted permanent fix.
