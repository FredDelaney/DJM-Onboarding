# Calendar Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one clean calendar for private personal tasks, intentionally shared company tasks, existing meetings/follow-ups and recorded birthdays.

**Architecture:** Add a dedicated canonical store for new manual calendar tasks, with actor-checked RPCs and denied direct access. Keep legacy work read-only in this calendar and birthday permissions unchanged. Small typed calendar modules and components feed the existing lazy-loaded FullCalendar month renderer.

**Tech Stack:** Next.js 16.3.3, React 19.2.8, TypeScript, Supabase Postgres, PGlite 0.3.14, FullCalendar React 7.1.0, temporal-polyfill 1.0.5 and the existing browser QA harness. No new product dependency.

**Spec:** `docs/superpowers/specs/2026-10-04-calendar-workspace-design.md`

## Global Constraints

- Company tasks intentionally visible to all active internal staff in the tenant, personal tasks private to their owner, and no automatic sharing of existing tasks.
- Task titles are required, trimmed and limited to 200 characters. Optional notes are limited to 2,000 characters.
- Visibility and creator are immutable after creation in this release, avoiding accidental publication of personal content. No permanent delete.
- Staff birth years remain excluded from team-facing data.
- Touch actions are at least 44 by 44 px.
- No document-level horizontal overflow at 320, 375, 390, 430, 768 and 1440 px.
- Production migration, merge and deployment require explicit release approval under the repository rules; prior approval for PR #186 does not authorise this new release.
- No Unicode U+2014 in user-facing source. Existing task rows, public shares and automation contracts are unchanged.
- Implementation starts only after the user reviews this plan and selects the execution method.

## Review Focus

- A company assignee becomes inactive while the editor is open: save is rejected, draft is retained and reassignment is offered (Tasks 1 and 4).
- Two browser sessions edit the same task: the second stale revision cannot overwrite the first (Tasks 1 and 4).
- A local time occurs twice or never during a daylight-saving transition: save explains the invalid/ambiguous time without silently changing it (Tasks 2 and 4).
- The user switches tenant during a pending read or save: no old-tenant content or response enters the new calendar (Task 5).
- The month being browsed does not contain today: Today summary still shows today's work and next meeting, not that month's first meeting (Tasks 3 and 5).

## Files and responsibilities

- New migration generated with `supabase migration new calendar_workspace_tasks_v1`: table, actor/assignee/time validation, task RPCs, indexes and audit.
- `tests/calendar-tasks-database.test.ts`: isolated PGlite actor/tenant permission and write tests.
- `lib/calendar/tasks.ts`: task DTOs, mutation inputs, error mapping and typed RPC adapter.
- `lib/calendar/events.ts`: event normalisation, layers, grouping, Today projection and birthday greeting.
- `lib/calendar/preferences.ts`: versioned metadata-only preferences with birthday preference migration.
- `lib/calendar/dates.ts`: retain existing helpers and add timed-task/date navigation helpers.
- `tests/calendar-task-dates.test.ts`, `tests/calendar-events.test.ts`, `tests/calendar-preferences.test.ts`: deterministic unit tests.
- `components/AgencyCalendarTaskForm.tsx` and `.module.css`: accessible task creation/editing.
- `components/AgencyCalendarTaskRow.tsx`: task actions and permission/status labels.
- `components/AgencyCalendarToday.tsx`: compact filtered daily summary.
- `components/AgencyCalendarWorkspace.tsx` and `.module.css`: source coordinator, navigation, day layout, filters and undated section.
- `components/AgencyCalendarMonth.tsx`: task layer styling and selected-day interaction.
- `components/AgencyOperatingWorkspace.tsx`: pass user id and tenant id to Calendar alongside existing preference key.
- `scripts/calendar-workspace-browser-qa.mjs`: mock-RPC browser interaction/viewport checks; fixtures outside deployed app routes.

### Task 1: Private/company task storage and actions

**Interfaces:** `CalendarTask` has `id, tenant_id, creator_user_id, owner_user_id, owner_name, visibility:'personal'|'company', title, notes, due_on:string|null, due_time:string|null, time_zone:string|null, due_at:string|null, status:'open'|'done', archived_at:string|null, revision:number, can_edit:boolean, needs_reassignment:boolean`.

RPCs return JSONB: `redream_calendar_task_create_v1(p_input jsonb,p_tenant_id uuid default null)` and `redream_calendar_task_update_v1(p_task_id uuid,p_expected_revision integer,p_action text,p_input jsonb default '{}',p_tenant_id uuid default null)` return `{task:CalendarTask}`. Actions: `edit,complete,reopen,archive,restore`. Edit accepts title/notes/due fields and company owner, never creator/visibility. Optional create input `id` is a client-generated UUID for retry idempotency: an identical retry by the same creator returns the existing row; conflicting input returns `task_create_conflict`.

- [ ] **Write failing database tests** in `tests/calendar-tasks-database.test.ts`, using the existing birthday test's PGlite pattern and authenticated actor fixtures. `personal_content_is_owner_only` asserts colleague/admin reads are empty and updates reject. `company_permissions` asserts all five staff roles can read, but only creator/assignee/owner/admin can mutate. `denied_actors` covers anon, player, inactive/foreign tenant and no actor under service_role. `revision_and_assignee_checks` asserts stale revision and newly inactive assignee reject. `audit_is_metadata_only` asserts a private title, notes and date occur nowhere in audit JSON. `existing_tasks_unchanged` compares seeded legacy rows before/after the migration. Assert input bounds, immutable visibility, idempotent retries and archive/restore semantics.
- [ ] **Run red:** `node --experimental-strip-types --test tests/calendar-tasks-database.test.ts`; expect failure because new migration/RPCs do not exist.
- [ ] **Implement migration** with the spec's columns, revision increment, row locking and actor/tenant checks using `private.redream_request_tenant()` plus active membership/tenant verification. Deny direct table grants and add an explicit deny RLS policy. Use metadata-only `platform.audit_events`. Add composite tenant/visibility/owner/date indexes. Reject edits of archived rows except restore; reject all company mutations except allowed actors. Authorised creators/admins can reassign an inactive company owner; do not reject an existing inactive owner merely when reading/archive/restore/completing. Grant RPC execute to authenticated/service_role but enforce auth.uid() inside every call.
- [ ] **Run green** with the same command, including `set role authenticated` direct-table denial and anon execute denial.
- [ ] **Commit:** `feat: add private and company calendar task commands`.

### Task 2: Range reads, undated reads and time semantics

**Interfaces:** `redream_calendar_tasks_v1(p_start date,p_end date,p_timezone text,p_mode text default 'range',p_include_done boolean default false,p_include_archived boolean default false,p_cursor jsonb default null,p_limit integer default 100,p_tenant_id uuid default null)` returns `{items:CalendarTask[],next_cursor:object|null,count:number,limited:boolean}`. Modes: `range`, `undated`, `overdue`. Range is end-exclusive, max 124 days, viewer-local boundaries for timed rows and literal dates for untimed rows. Overdue compares untimed dates to the viewer's today and timed instants to now. Cursor is deterministic keyset, actor/tenant filtered; counts include only authorised rows matching mode/status. Default reads exclude done/archived.

- [ ] **Write failing tests:** database reads cover personal hiding, cross-tenant counts/cursors, undated tasks, range boundary and limited pagination. `tests/calendar-task-dates.test.ts` asserts Rome `2026-03-29 02:30` and `2026-10-25 02:30` reject; `2026-10-25 03:30` resolves. Date-only `2026-10-04` remains that date in Rome/Athens/UTC/Los_Angeles. Timed conversion correctly changes the local displayed day.
- [ ] **Run red:** `node --experimental-strip-types --test tests/calendar-tasks-database.test.ts tests/calendar-task-dates.test.ts`.
- [ ] **Implement SQL time validation** inside write RPCs: validate IANA name; collect distinct offsets observed in UTC probes within 36 hours either side of the naive local timestamp, at 30-minute intervals; build candidate instants and retain only exact local timestamp round-trips. Require exactly one candidate. Return `task_time_invalid` for zero and `task_time_ambiguous` for multiple. Writes return derived due_at; no fake midnight for date-only/undated tasks. Add `redream_calendar_task_assignees_v1(p_tenant_id uuid default null)` returning `{items:[{user_id,display_name}]}` for active staff only. Implement paged reads with the same actor/tenant checks.
- [ ] **Implement `lib/calendar/tasks.ts`** DTO/input contracts and `taskErrorMessage(code:string):string`; use existing `Rpc` shape. In `dates.ts`, add `taskLocalInstant(dueOn:string,dueTime:string,zone:string):string` using Temporal disambiguation `reject`. SQL remains authoritative. Add leap-day and invalid-zone assertions.
- [ ] **Run green** with the same tests; rerun `tests/calendar-birthdays-database.test.ts` unchanged.
- [ ] **Commit:** `feat: read calendar tasks with explicit date and time semantics`.

### Task 3: Calendar projections and remembered controls

**Interfaces:** `CalendarLayer='personal'|'company'|'meetings'|'followUps'|'agencyDates'|'birthdays'`; `CalendarPreferences={version:2,view:'month'|'agenda',layers:Record<CalendarLayer,boolean>,birthdays:BirthdayFilters}`. `parseCalendarPreferences(raw:string|null):CalendarPreferences` migrates the current flat birthday object. `CalendarEvent` retains existing entity/link fields and adds optional `task:CalendarTask`, `layer:CalendarLayer`. `normaliseCalendarEvents(legacy:any,birthdays:any,tasks:CalendarTask[]):CalendarEvent[]`, `filterCalendarEvents(events,prefs):CalendarEvent[]`, `groupCalendarEvents(events,selectedDate,view,horizon,now):CalendarGroup[]`, `todayProjection(events,now):{overdue:CalendarEvent[],dueToday:CalendarEvent[],nextMeeting:CalendarEvent|null}`, `birthdayGreeting():string` returns `Happy birthday! Hope you have a great day.`

- [ ] **Write failing unit tests** for legacy deal-follow-up dedupe, company/personal layers, filter-aware counts, stable sorting, date-only birthdays, all-day versus timed task labels, Today independent from selected month, malformed localStorage, old birthday preference migration and no task content in serialized preferences. Keep existing navigation tests.
- [ ] **Run red:** `node --experimental-strip-types --test tests/calendar-events.test.ts tests/calendar-preferences.test.ts tests/calendar-date-navigation.test.ts`.
- [ ] **Implement the exact interfaces** in `events.ts` and `preferences.ts`; extract rather than duplicate the existing normalisation/grouping. Derive overdue at the viewer's date/instant without treating birthdays/meetings as overdue. Pass now explicitly to pure projections for repeatable tests.
- [ ] **Run green** with the same tests.
- [ ] **Commit:** `refactor: model calendar layers and daily priorities`.

### Task 4: Task form and actionable rows

**Interfaces:** `AgencyCalendarTaskForm({task?:CalendarTask,selectedDate:string,userId:string,assignees:Assignee[],busy:boolean,onSave:(input:TaskInput,task?:CalendarTask)=>Promise<void>,onClose:()=>void})`; `AgencyCalendarTaskRow({task:CalendarTask,onEdit,onAction})`, with `onAction(action:'complete'|'reopen'|'archive'|'restore',task:CalendarTask):Promise<void>`.

- [ ] **Write failing browser cases** in `scripts/calendar-workspace-browser-qa.mjs`: default Personal/user/selected day; Company explanatory visibility copy; No date clears time; long title/notes reject; personal owner/visibility cannot change on edit; Escape and focus return; dirty-close confirmation; inactive assignee, stale revision and failed save retain draft; duplicate Save does not create two tasks. Assert permission flags suppress mutations for read-only users.
- [ ] **Run red** through the existing local fixture/browser harness, using an isolated localhost fixture outside deployed routes; expect missing form/rows.
- [ ] **Implement form/rows** and scoped CSS, with 44 px actions, labelled inputs, pending state, mapped inline errors, focus trap/return and accessible action menu. Personal owner fixed; company assignees from Task 2. Reuse one edit form for rescheduling. Include Done and Archived inspection toggles so Reopen/Restore are reachable. No permanent delete or private-to-company switch.
- [ ] **Run green** on those browser cases and `npm run typecheck`.
- [ ] **Commit:** `feat: capture and manage calendar tasks in place`.

### Task 5: Clean calendar integration and independent source states

**Interfaces:** Calendar adds `tenantId:string,userId:string` props from `AgencyOperatingWorkspace`. `AgencyCalendarToday({projection,partial,onSelectToday})` consumes Task 3. Each source state is `{key:string,items:unknown,busy:boolean,error:string}`; key includes tenant/user and range. Mutation handlers use Task 1 RPCs, expected revision and saved row read-back.

- [ ] **Write failing browser cases:** task layers in both views; selected-day list beside month on desktop/below on mobile; Today while browsing a future month; undated expansion/pagination; filter/view persistence scoped to two tenants; tenant switch during delayed read/save; per-source Retry preserves only same-tenant known data; clipboard failure presents selectable greeting; scroll does not trigger a view swipe; midnight updates today highlight. Verify existing meeting preparation/outcome and entity links.
- [ ] **Run red** with the same QA script.
- [ ] **Implement coordinator/layout:** independently load legacy range, birthdays, paged manual range and undated tasks. For Today, reuse range data only if it contains today; otherwise read today's legacy range plus task range and overdue pages separately. Counts distinguish partial data; paginate instead of silently truncating. Reset source/form state synchronously for tenant/user changes and ignore old request results. Scope localStorage by existing preference key. Add date jump, compact collapsible filters, No date section, copy/fallback action and Task 4 mutations. Refresh now at local midnight and on visibility return. Retain existing lazy FullCalendar; use explicit layer labels/colours, reduced-motion styles and non-conflicting swipe regions.
- [ ] **Run green:** QA interactions plus both views at 320/375/390/430/768/1440; assert no document overflow, no page errors, long-title/busy-cell readability, keyboard/focus and >=44 px touch targets.
- [ ] **Commit:** `feat: unify calendar priorities tasks and birthdays`.

### Task 6: Staging proof and release handoff

- [ ] **Run `npm run check`** on the final tree; require zero test/type/build failures. Confirm no fixture route, generated cache, credentials or unrelated edits in the diff.
- [ ] **Apply the additive migration to staging only** (`ltvmopvarlnidiozvpow`), read security advisors and verify direct-table/anon denial. Run real two-user plus admin allow/deny canaries and revision-conflict test inside a transaction that rolls back, leaving no fake production or staging tasks. Do not weaken a policy to make a test pass.
- [ ] **Verify staging browser** create/edit/complete/reopen/archive/restore, filters, birthdays and meetings with the reviewed environment. Distinguish actual signed-in checks from fixture-only evidence in the handoff.
- [ ] **Review final branch** against spec and tests, preserving unrelated work. Record evidence and any unverified path in `docs/operations/CALENDAR_WORKSPACE_VERIFICATION_2026-10-04.md`.
- [ ] **Commit evidence and open a PR**, then ask for explicit production migration/merge/deployment approval. Do not deploy during this plan's execution without that new approval.

## Execution recommendation

Recommend Native: implement task-by-task in the current session using the executing-plans skill, then obtain one fresh independent branch review before release. The six tasks share DTO and date interfaces, so keeping implementation context together is useful; the database allow/deny tests are mandatory regardless of execution choice. Alternative: Subagent-driven task/reviewer gates, with higher context overhead. The user must review this plan and choose before product implementation begins.
