# Personal task context and active-work recovery

Scope: OPS-05 / DAY-03 / UI-01 / UI-09. Draft dependency: PR 262 at `cb1fa593ec088c27558c69a20c57133427fbd476`, plus parent workflow budget correction `f61d1fd34b337e78949fd19a552ca80010f2f5c6`. All 46 programme items and 17 UI surfaces remain retained.

## Behaviour and boundaries

The installed staging personal-task reader is the older title-only implementation. A fully rolled-back canonical Tell-writer canary reproduces two different players' identically named tasks collapsing into one copy group, then both disappearing when moved to `in_progress`. The existing October context implementation already separates player, contact, club, need and conversation. Reuse that body in a guarded forward change, retain canonical agency membership, include `open` and `in_progress`, and leave terminal tasks absent.

Player-labelled presentation is distinct from the raw saved task title. A single-task command carries its exact canonical title, context IDs and updated-at snapshot. The existing shared Home controller uses these only for a matching single task; true copy groups still require review. Real saved-title, context or version changes open the canonical editor without completing stale work. Successful completion and Undo retain the useful player label. Legacy commands remain compatible. No new model, route, feature, grant, task-row rewrite or fabricated information.

## Exact staging manifest

Frontend first: publish this exact reviewed branch and deploy it only to ReDream staging project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `jesseedge10-8415s-projects`; verify READY, project and full Git SHA before assigning `redream-systems-staging-jesseedge10-8415s-projects.vercel.app`. Immediate frontend rollback is `dpl_8ZZMqEd2DiHMuhNYGKbvDkkA9KKX`, product `10f7c9173b669fd68b9b8d0ee8d1791efc7266fc`. Frontend is compatible with the preceding reader.

Then install only `supabase/migrations/20261025085756_restore_personal_task_context.sql`, SHA-256 `bb40b0c99d6d6bcecec3d7728dceb8bed20ce25884a398ed5a14eff69633af79`, on staging `ltvmopvarlnidiozvpow`. Target: existing `public.platform_server_user_task_commands(uuid,uuid,integer)`, OID 28022, postgres owner, ACL `{postgres=X/postgres,service_role=X/postgres}`, fixed empty search path, security definer. Accepted source MD5s are canonical-access legacy `00ba3e3519f7f9cfa853a50faccc088f` and canonical-access current `a75e24785b5d9d8165e004be60a2c2c4`. Final source MD5 is `d6c581a48f1a5c788da80e1570d0688e`. Replay is idempotent, unknown source is refused, metadata is retained, and local lock/statement limits remain bounded. No historical replay; never execute excluded `20260930142119_restore_redream_relationship_person_entrypoint.sql`.

No Edge Function, provider, schedule, secret, configuration, production change or GitHub merge. Production requires separately reviewed prerequisite migrations and is not an installation target here.

## Validation and hosted acceptance

Final local `npm run check`: 2,113 tests pass, all TypeScript projects and production build pass, gzip 144,732 / 150,000 bytes. Extended existing PostgreSQL tests cover distinct contexts, genuine copies, raw/display titles, active/terminal statuses, canonical membership/revocation, service-only ACL, metadata/data preservation, replay, known modern upgrade and unknown-body refusal. Reply IDs remain actor/tenant/channel/direction scoped and exclude private conversation content. Expanded existing Home browser checks cover labelled direct completion/Undo, real title/context/version changes requiring review, grouped-copy review, plus existing draft/failure/double-click/mobile behaviour. Connected-followup and Tell browser suites also pass.

Private evidence directory: `/tmp/redream-platform-programme/`. Logs: `task-context-parity-before.log`, `task-context-parity-after.log`, `task-context-parity-exact-final-check.log`, `task-context-label-before-browser.log`, `task-context-label-final-browser.log`. Before-image/catalog/advisor/data backup: `task-context-parity-before.json`. Before hosted canary rolled back completely; no model request or external send.

Pending: exact published frontend READY/alias, exact installed SQL/ledger/metadata/advisors, real-role after-canary and signed-in labelled completion/Undo, exact fixture cleanup and all nine original hashes, full exact-head CI. Original seven players must retain full-row hash `6e9392dc6b3dc877bfb90c47aeedbb93`; original AI usage hash `480049812f2c25c338afb8915e230889` and 46 events remain. Restore only reviewed function before-image if necessary, with metadata checks; do not automatically reintroduce known broken behaviour.

Northstar and synthetic fixtures prove technical isolation only. Actual ordinary staff/read-only roles, real providers, physical iPhone/Safari and independent-agency working-day acceptance remain open.
