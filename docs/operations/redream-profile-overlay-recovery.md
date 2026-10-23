# Player Profile overlay recovery

Status: full CI and focused hosted mobile preview/editor checks pass. The wider overlay/device matrix remains open. UX-03/UX-04 increment stacked on PR 253.

## Defect and result

Signed-in staging showed the club preview trapped inside the workspace with its toolbar above the viewport. Its actual bounds were x 297.5, y -1089.5, height 1758.8 on a 643px-high browser. The workspace's existing view animation retains a transform after finishing, making it a containing block for fixed-position descendants.

The existing preview, profile editor, player-details verification, Transfermarkt and sharing dialogs now render through React portals into the body. Their content, approval/write guards and tenant styling are preserved. The preview is a named modal with an always-reachable 44px Close button, its own long-content scroll area, safe-area padding, background isolation and a leased page-scroll lock. Escape closes it; Tab stays inside; closing returns focus without moving the underlying profile; reopening starts at the player identity. Player/workspace changes close any old preview.

## Verification

The existing workspace fixture now includes the actual animated view wrapper for profiles. The expanded existing profile-tools browser test fails on the old implementation at 320px because the preview does not fill the viewport, then passes on the repair at 320/390/768/1440. It checks bounds, actual Close hit target, independent scrolling, stationary background, initial focus, forward/reverse Tab containment, Escape/Close recovery, reopening at the top and the More-menu entrypoint.

Existing populated-profile browser checks pass all four widths, including editing, retained drafts, saved visibility, failure recovery, publish guards and keyboard focus. Existing clean-profile, photo/verification, stale-player, save-retry, statistics and real PDF-download checks also pass. Screenshots `preview-overlay-390.png` and `preview-overlay-1440.png` under the existing club-stats CI artifact were visually inspected.

`npm run check` passes 1,993 tests, all TypeScript projects, production build and bundle limits (workspace gzip 143,963 / 150,000 bytes). No new dependency or test framework is introduced. React review confirms bounded event listeners, cleanup on close/unmount, shared scroll/inert leases and no new fetch effect.

## Deployment manifest and remaining acceptance

PR 254 head `151ba22cdab2ab3c012e8d72fc7b33733ac58af8` passes verify and browser CI. Its exact staging deployment `dpl_845i7uFoKSgkbFgZTrS8xAg4YaoE` is READY and assigned only to `redream-systems-staging-jesseedge10-8415s-projects.vercel.app`. At 390x844 the signed-in preview fills the viewport, independently scrolls, retains the toolbar and 44px Close, and restores the opener focus/background position after Escape. The editor and its save/publish footer fit the same viewport without horizontal overflow. Actual screenshot `/tmp/redream-platform-programme/staging-preview-fixed-390.png` was inspected. Production is unchanged.

Deploy only the reviewed frontend revision to the existing ReDream staging project after CI. No additional migration or worker deployment belongs to this increment. The previous staging build/alias target from PR 253 remains the rollback target; its database/worker manifests are unchanged and must not be reapplied.

Before accepting the repair on staging, open a long player profile after scrolling, check the preview toolbar/content/Close and editor footer at desktop and mobile widths, verify focus/scroll recovery and tenant branding, and continue the outstanding automatic/selected/custom publication/public-read/PDF canary. Dedicated provider, physical iPhone and independent-agency acceptance remain separate programme gates. Other product overlays remain in the full UI matrix; this profile increment does not accept them automatically. Production promotion requires its explicit release gate.
