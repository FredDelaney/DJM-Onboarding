# Calendar workspace: personal work, company work and birthdays

Status: written design approved by Jesse on 4 October 2026. Implementation plan review and execution-method selection are the next gates. Production changes require separate release approval.

## Outcome and approved direction

Jesse wants the existing calendar to be substantially cleaner and more useful, combining company tasks, personal tasks and birthdays without extra manual work. The agreed direction is company tasks intentionally visible to all active internal staff in the tenant, personal tasks private to their owner, and no automatic sharing of existing tasks. Preserve the recently released Month/Agenda switch, date strip, meetings, follow-ups and birthday controls.

Success means an agent can see what needs attention today, create a task without leaving Calendar, and complete or reschedule it without hunting through other screens. Quality is measured by usable flows and privacy tests, not a claim to be the world's best.

## Approach and scope

Three approaches were considered: a visual-only refresh leaves task ownership unresolved; retrofitting private/company visibility into every legacy task consumer risks changing existing automation and Network contracts; a dedicated canonical store for newly captured calendar tasks gives explicit privacy while retaining legacy work as read-only calendar sources. Use the third approach for this release.

New calendar tasks are stored once, not copied into legacy tasks. They are a deliberately bounded manual-work domain. Home and Network integration beyond existing links is not part of this release. Existing follow-ups keep their existing ownership and underlying permissions; this release must not describe the legacy system as globally private.

## Calendar experience

- One restrained header: month/year, previous/next, Today and Add task. A labelled date picker supports distant jumps.
- Retain the Month/Agenda sliding control and horizontal numbered date strip. Remember view and filters per tenant and user; selection is retained between views.
- Filters: My tasks, Company tasks, Meetings, Follow-ups, Agency dates and Birthdays. Birthday subfilters remain Signed players, Club contacts and Our team. Defaults show all main layers, with club contact birthdays off.
- A compact Today section shows overdue tasks, tasks due today and the next upcoming meeting today. Counts are descriptive, not invented priority scores. Counts reflect the active filters and visibly indicate partial loading.
- Selecting a day shows its events and tasks below the month grid on mobile and alongside it on wide screens. Use text labels and icons as well as colour.
- A collapsed No date section keeps unscheduled tasks accessible without placing them on arbitrary dates. It lists authorised open manual calendar tasks, with ownership and visibility labels.
- Company tasks show the assignee. My tasks show a Private label. Existing follow-ups show Your follow-up, not a claim about other application surfaces.
- Birthdays open the relevant player/contact/team record. A Copy birthday message action copies a neutral editable greeting; nothing is automatically sent and no contact channel is invented. Provide a selectable text fallback when clipboard access fails. Staff birth years remain excluded from team-facing data.
- Preserve meeting preparation, meeting links, outcome recording and entity deep links.

## Task capture and actions

Add task opens one short accessible form: title, Personal/Company, due date, optional time, and owner. Default Personal, owner=current user, due date=selected day; users can select No date. Personal owner is fixed to the current user. Company tasks may be assigned to an active staff member of the same tenant. Company visibility is stated beside the selector before saving.

Task titles are required, trimmed and limited to 200 characters. Optional notes are limited to 2,000 characters. No player, club, email or external profile linking is introduced in this first version. The server validates the assignee and dates; client validation is only a convenience.

Actions are Edit, Reschedule, Complete/Reopen and Archive/Restore. Personal actions belong only to the owner. For company tasks, creator, assignee and tenant owner/admin may edit, reschedule, complete, reopen, archive or restore. Other active staff may read only. Visibility and creator are immutable after creation in this release, avoiding accidental publication of personal content. No permanent delete.

## Data and authorisation

Add `platform.calendar_tasks` in an additive migration with UUID id, tenant_id, creator_user_id, owner_user_id, visibility (`personal` or `company`), title, notes, due_on (nullable date), due_time (nullable time), time_zone (IANA zone for timed tasks), status (`open` or `done`), archived_at, created_at, updated_at and revision integer. A timed task requires due_on and a valid zone. Date-only tasks remain date-only across travel; timed tasks resolve to an instant and display in the viewer's current zone. Reject invalid or ambiguous/nonexistent daylight-saving local times with a useful error instead of silently moving them.

RLS is enabled with direct Data API access denied. Narrow authenticated RPCs enforce active tenant membership and staff role (`owner`, `admin`, `agent`, `scout`, `operations`) before reading or writing. No anonymous, player-role, public profile, club-share or foreign-tenant access. Personal rows are owner-readable even to tenant administrators; company rows are readable to current internal staff in that tenant. Service-role operations must not bypass the actor checks exposed by user-facing RPCs.

Define versioned RPCs for task range/undated reads, active staff assignee options, create and update actions. DTOs return only fields the actor can read and computed can_edit flags. Updating requires expected_revision to reject stale concurrent edits. Reads return explicit limited/partial flags; bounded range and pagination prevent silent truncation. An assignee leaving the tenant does not publish their personal tasks. Company tasks retain the recorded owner and display Needs reassignment when that owner is no longer active.

Writes append task lifecycle audit events. Shared audit payloads contain identifiers/action/revision but no personal task title, notes or due date. The authorised owner may read their private task details through the task RPC only. Do not feed personal task content to shared AI retrieval, exports, notifications or external integrations.

## Components and data flow

Keep `AgencyCalendarWorkspace` as the coordinator. Extract typed event normalisation/grouping and date calculations into focused calendar modules. Introduce small task form, task row and Today summary components. Continue using the existing lazy-loaded FullCalendar month renderer; no replacement calendar dependency is needed.

Load legacy calendar, birthdays and manual calendar tasks independently. Abort/ignore stale responses on tenant, range or filter changes. Never retain data from a previous tenant. Preserve current-range content during same-tenant refresh, mark failures clearly, and offer Retry for the failing source. Task changes read back the saved row and update both day list and Today counts. Failed writes retain form input and do not show a success state.

Filter/view preferences contain no task content, are scoped by tenant/user, and are versioned for compatibility with the currently saved birthday preferences. Date navigation does not issue one request per day within an already-loaded month. No speculative speed guarantees or fabricated timings.

## Visual and accessibility acceptance

- No document-level horizontal overflow at 320, 375, 390, 430, 768 and 1440 px.
- Touch actions are at least 44 by 44 px; clear focus states and labelled controls work with keyboard and screen readers.
- Reduced-motion preference disables sliding animation; touch scrolling must not accidentally switch views or trigger actions.
- Today, selection, overdue and company/private status are distinguishable without colour alone.
- Long names/titles and busy month cells do not clip buttons or push content under navigation. Mobile task actions retain accessible names.
- The task form has focus management, Escape/close handling and unsaved-edit confirmation. It follows the existing platform's tokens and button conventions, without decorative haze or unnecessary nested cards.

## Verification and release

Tests must cover cross-tenant denial, personal denial to colleagues/admins, company read-only roles, creator/assignee/admin mutation rights, inactive assignees, player/anonymous denial, direct-table denial, metadata-only audit, revision conflicts and archived-task exclusion. Confirm existing tasks are unchanged.

Date tests cover leap birthdays, optional birth years, Rome/Athens/UTC and a negative UTC offset, daylight-saving transitions, date-only travel semantics, timed-task conversion, month/year navigation and midnight rollover. Browser tests cover quick create, edit, reschedule, complete/reopen, archive/restore, No date, filter persistence, Month/Agenda retention, clipboard fallback and source-specific failure recovery.

Run the full repository checks, then staging migration and real multi-user allow/deny reads plus mobile/desktop browser verification. Prepare a reviewable PR. Production migration, merge and deployment require explicit release approval under the repository rules; prior approval for PR #186 does not authorise this new release.

## Deliberate exclusions

No recurring task engine, reminders, automatic birthday messages, external calendar writes, permission-selected colleague lists, private-to-company conversion, drag-to-reschedule, AI priority scores, new billing changes or platform-wide redesign in this release. These are separate decisions, not prerequisites for a clean useful calendar.
