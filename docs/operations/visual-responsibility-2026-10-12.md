# Visual polish and shared responsibilities, 12 October 2026

Continue from a4a10c0 in ux/visual-responsibility-oct12. The user authorised a full page-by-page visual pass and publishing to ReDream and DJM. Tasks and action reminders support several agency members, selected using removable name tags and a searchable dropdown.

Recovered changes: Home compact priority rows, Network expandable relationship cards, Calendar month/day simplification, detail-drawer visual consistency, task people picker, additive task/reminder migrations.

Remaining: finish reminder permissions and context, verify picker persistence and recovery, review all 60 route entries and responsive surfaces, run unit/browser/type/build gates, stage additive migrations, review and publish the same tested commit, verify both production apps.

Checks so far: 11 calendar/task database tests passed; TypeScript passed. Source schema checked against production metadata without changing data.

Ruling: keep the existing worktree and its changes. The recovered implementation is prior authorised work, so preserve it and extend its behavioural checks.

Verified reminders for all nine supported source kinds, including completion and cross-agency isolation. Found and fixed club-need owner access and duplicate/colliding calendar reminder identities (tests RED to GREEN). Existing source-shape tests still expected removed Home headings and repeated labels; updated only those obsolete presentation expectations, retaining ranking, five-item bounds and permission checks. Calendar create/edit/complete/archive/recovery and pursuit continuity browser checks passed.

Phone dropdown test reproduced overflow at 320px. Anchored the dropdown to its complete field rather than the inline Add people link. Included shared-reminder browser QA in the CI browser command.

Final review: four Important findings, no Critical or Minor findings. Fixed month-boundary task links (date carried into Calendar), assignment truncation (paged RPC and complete reads), stale same-scope requests (sequence guards), and undated shared legacy work (Home candidate plus Calendar No date list and contextual record links). Each was reproduced by a failing unit, database or real-component browser check.

Rulings: explicit assignment shares only the selected reminder title/date/context with active agency staff. Existing entity permissions still control profile and commercial detail destinations. Date-only parsing is correct because the live columns are SQL date. Full visual acceptance is decided using rendered checks; the code review alone does not establish beauty. Independent reviewer did not run gates; all release gates are run by the main executor.

Release gate: 1,643 automated tests passed, TypeScript passed, production build passed, no-em-dash passed, and git diff check passed. Full browser workflow checks passed; layout QA passed 236 screen/viewport combinations, followed by a populated agency visual pass at all four widths. The final visual adjustment removes duplicate Waiting text, places supporting links together and keeps the main action beside the task. Calendar empty states use plain white surfaces. A timed-out responsibility save reports that the save could not be confirmed.

All three additive migrations applied to staging. Anonymous endpoint access and direct table reads are denied. Staging has no suitable team with two active staff for a real-assignee transaction; equivalent behavioural assertions pass in PGlite, and a rolled-back production transaction is part of the release verification. New signed-in SECURITY DEFINER advisor entries are intentional guarded endpoints, verified for active tenant/staff membership and explicit row/revision permissions.
