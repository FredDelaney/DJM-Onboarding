# Branch file review inventory

Base: `a6257822f67ec2df9b77764610424a6b00b56bb2`. Original reviewed head: `d270149bce510a3a03d4b97baeec0b290978dfe5`, plus the review fixes in this commit. CSS renames appear as removed and added paths in this name-only inventory.

Review method: compare moved implementations to their predecessors, inspect behavioral changes, classify presentation/import changes against the copy manifest, and review regression assertions separately. This inventory records scope, not a claim of live verification.

| File | Review focus |
| --- | --- |
| `ARCHITECTURE.md` | Documentation, compatibility identifiers, rollout claims |
| `README.md` | Documentation, compatibility identifiers, rollout claims |
| `app/(djm-os)/brain/benchmarks/import/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/(djm-os)/brain/data/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/(djm-os)/brain/performance/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/(djm-os)/djm/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/(djm-os)/layout.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/(djm-os)/market/deals/[id]/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/(djm-os)/network/clubs/[id]/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/(djm-os)/network/contacts/[id]/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/(djm-os)/network/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/(djm-os)/opportunities/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/(djm-os)/recruitment/[id]/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/(djm-os)/settings/connections/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/(djm-os)/settings/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/(djm-os)/settings/player-experience/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/(djm-os)/settings/team/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/(djm-os)/tell/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/activate/[tenantSlug]/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/admin/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/admin/players/[id]/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/career/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/check-in/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/connections/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/cv/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/documents/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/forgot-password/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/home/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/inbox/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/launch/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/onboarding/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/p/[slug]/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/page.tsx` | Host/runtime and return-route boundaries; tenant-conditional presentation / request isolation |
| `app/platform/AgencyActionBar.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/platform/AgencyActivationCard.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/platform/AgencyGoLiveCard.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/platform/AgencyInterventionCard.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/platform/join/[token]/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/platform/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/privacy/page.tsx` | Host/runtime and return-route boundaries; tenant-conditional presentation / request isolation |
| `app/profile/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/reset-password/page.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `app/sign-in/page.tsx` | Host/runtime and return-route boundaries; tenant-conditional presentation / request isolation |
| `app/workspace/[tenantSlug]/capture/page.tsx` | Capture lifecycle, route context, offline origin, session/permission boundaries |
| `components/AdminResourceStudio.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/AdminShell.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/AgencyOperatingWorkspace.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/AgencyShell.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/AiCapture.module.css` | Styles moved; mobile safe-area and viewport contracts retained |
| `components/AiCapture.tsx` | Capture lifecycle, route context, offline origin, session/permission boundaries |
| `components/AiFullPage.tsx` | Capture lifecycle, route context, offline origin, session/permission boundaries |
| `components/AiLauncher.module.css` | Styles moved; mobile safe-area and viewport contracts retained |
| `components/AiLauncher.tsx` | Capture lifecycle, route context, offline origin, session/permission boundaries |
| `components/AiRecentCaptures.module.css` | Styles moved; mobile safe-area and viewport contracts retained |
| `components/AiRecentCaptures.tsx` | Capture lifecycle, route context, offline origin, session/permission boundaries |
| `components/AppExperience.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/CaptureSession.tsx` | Capture lifecycle, route context, offline origin, session/permission boundaries |
| `components/ClubNeedCardResource.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/ClubReadyPanel.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/ConnectionsPanel.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/DjmGlobalSearch.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/DjmOsShell.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/DjmQuickCapture.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/DjmTellDjmLauncher.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/DjmWorkspaceHeader.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/LegacyCaptureRoute.tsx` | Capture lifecycle, route context, offline origin, session/permission boundaries |
| `components/MySeason.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/PlayerCareerNavigator.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/PlayerComparisonExplorer.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/PlayerConnectionHub.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/PlayerIntelligencePanel.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/PlayerShell.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/PlayerStatsPanel.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/PlayerVoiceLauncher.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/ProfessionalToolkit.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/QuickCapture.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/RemovePlayerSheet.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/ResearchLinkRail.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/SeasonRecordEditor.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/StaffAssignmentPicker.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/TellDjmCapture.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/TellDjmFullPage.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/TellDjmRecentCaptures.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/TenantRouteGate.tsx` | Host/runtime and return-route boundaries; tenant-conditional presentation / request isolation |
| `components/TenantRuntimeProvider.tsx` | Host/runtime and return-route boundaries; tenant-conditional presentation / request isolation |
| `components/WorkspaceHeader.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/WorkspaceSearch.tsx` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `components/useAiWorkspace.ts` | Capture lifecycle, route context, offline origin, session/permission boundaries |
| `components/useTellWorkspace.ts` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `docs/architecture/REDREAM_AI_TRANSITION.md` | Documentation, compatibility identifiers, rollout claims |
| `docs/architecture/redream-copy-migration.json` | Documentation, compatibility identifiers, rollout claims |
| `lib/admin-command-centre.ts` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `lib/ai-draft-save.ts` | Capture lifecycle, route context, offline origin, session/permission boundaries |
| `lib/ai-offline.ts` | Capture lifecycle, route context, offline origin, session/permission boundaries |
| `lib/ai-upload-queue.ts` | Capture lifecycle, route context, offline origin, session/permission boundaries |
| `lib/ai-workspace.ts` | Capture lifecycle, route context, offline origin, session/permission boundaries |
| `lib/auth-capabilities.ts` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `lib/brain.ts` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `lib/capture-polling.ts` | Capture lifecycle, route context, offline origin, session/permission boundaries |
| `lib/capture-return-path.ts` | Capture lifecycle, route context, offline origin, session/permission boundaries |
| `lib/clubReady.ts` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `lib/djm-context.ts` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `lib/djm-os.ts` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `lib/djm-performance.ts` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `lib/entity-context.ts` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `lib/intelligence.ts` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `lib/operation-performance.ts` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `lib/platform-client.ts` | Host/runtime and return-route boundaries; tenant-conditional presentation / request isolation |
| `lib/player-career.ts` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `lib/push.ts` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `lib/tell-djm-offline.ts` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `lib/tell-workspace.ts` | Canonical source alias/import or neutral platform copy; preserved API/data identifiers |
| `package-lock.json` | Pinned test dependency, TypeScript extension support, explicit JWT configuration |
| `package.json` | Pinned test dependency, TypeScript extension support, explicit JWT configuration |
| `supabase/config.toml` | Pinned test dependency, TypeScript extension support, explicit JWT configuration |
| `supabase/functions/_shared/ai-capture.ts` | Shared implementation, auth, stored tenant, provider cost, legacy dispatch |
| `supabase/functions/_shared/ai-process.ts` | Shared implementation, auth, stored tenant, provider cost, legacy dispatch |
| `supabase/functions/_shared/ai-router.ts` | Shared implementation, auth, stored tenant, provider cost, legacy dispatch |
| `supabase/functions/_shared/djm-ai-router.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/functions/_shared/football-data/providers.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/functions/_shared/football-data/wyscout.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/functions/club-pitch-response/index.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/functions/djm-calendar-feed/index.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/functions/djm-network-capture/index.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/functions/djm-network-import/index.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/functions/djm-player-voice-message/index.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/functions/djm-tell-capture/index.ts` | Shared implementation, auth, stored tenant, provider cost, legacy dispatch |
| `supabase/functions/djm-tell-process/index.ts` | Shared implementation, auth, stored tenant, provider cost, legacy dispatch |
| `supabase/functions/djm-transfermarkt-enrich/index.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/functions/import-player-evidence-json/index.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/functions/import-player-stats/index.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/functions/redream-ai-capture/index.ts` | Shared implementation, auth, stored tenant, provider cost, legacy dispatch |
| `supabase/functions/redream-ai-process/index.ts` | Shared implementation, auth, stored tenant, provider cost, legacy dispatch |
| `supabase/functions/refresh-player-data-universal/index.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/functions/refresh-player-data/index.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/functions/refresh-player-peer-data/index.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/functions/refresh-player-stats-ai-worker/index.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/functions/refresh-player-stats-free/index.ts` | Neutral presentation/import changes; deployed names and provider contracts retained |
| `supabase/migrations/20260915192303_tell_capture_workspace_boundary.sql` | Line review: tenant authority, dependency order, ACL, RLS, concurrency, rolling states |
| `supabase/migrations/20260915194224_redream_ai_canonical_api.sql` | Line review: tenant authority, dependency order, ACL, RLS, concurrency, rolling states |
| `supabase/migrations/20260915194621_redream_ai_activation_evidence.sql` | Line review: tenant authority, dependency order, ACL, RLS, concurrency, rolling states |
| `tests/ai-draft-save.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/ai-upload-queue.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/capture-polling.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/combined-workflow-cleanup-v2.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/connectivity-launch-polish-v1.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/djm-os-ux-overhaul-v1.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/edge-function-contract.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/final-release-hardening-v2.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/flexible-home-tell-djm.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/global-intelligence-admin-v1.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/opportunity-ui-contract.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/player-score-v3-universal.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/player-score-v5-information-fusion.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/redream-ai-compatibility.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/tell-djm-full-v1.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/tell-djm-hotfix.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/tell-djm-mobile-popup.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/tell-djm-refresh-stability.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/tell-djm-tenant-isolation.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/tell-workspace-database.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tests/tell-workspace-offline.test.ts` | Regression assertions, fixture limits, renamed contracts; suite executed |
| `tsconfig.json` | Pinned test dependency, TypeScript extension support, explicit JWT configuration |
