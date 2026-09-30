# Agency staging repair, 30 September 2026

## Scope and verdict

Local app branch: `codex/agency-visual-qa`, PR #174.
Database target: **only** `ltvmopvarlnidiozvpow` (ReDream staging).
No production changes, external messages, or tenant business-record writes were performed.

Home and Calendar failed authenticated mobile checks because required RPCs were
absent from staging. Network contact navigation then exposed a missing public
entry point even though the newer internal relationship implementation existed.
These reads now work. This is **not full Phase 1 acceptance**: hosted frontend
deployment, remaining detail flows, measured performance, and the unfamiliar-agent
exercise remain open. No Phase 2 feature was started.

## Applied database manifest

The first five files were existing repository migrations, applied unchanged after
dependency and access-control review. The sixth restores only the contact entry
point and its grants, preserving the newer internal relationship implementation.

| Repository migration | Staging ledger version |
| --- | --- |
| `20260926115238_redream_calendar_v2.sql` | `20260930141517` |
| `20260928130000_redream_messaging_thread_binding_v1.sql` | `20260930141651` |
| `20260928220000_redream_meeting_autopilot_brief_v1.sql` | `20260930141652` |
| `20260928235900_redream_connected_work_home_v1.sql` | `20260930141653` |
| `20260929013000_redream_post_meeting_aftercare_v1.sql` | `20260930141654` |
| `20260930142119_restore_redream_relationship_person_entrypoint.sql` | `20260930142137` |

The management API assigned application-time versions. Preserve this mapping;
do not blindly reapply these files or use an unreviewed whole-history `db push`.
This is a bounded repair, not promotion of all later messaging/provider migrations.
Home currently returns `redream_connected_work_home_v1`.
No Edge Functions or scheduled jobs were deployed or changed.

## Frontend changes

Native history calls now pass `null` as their state argument. Passing the existing
Next internal history marker made Next skip search-parameter updates: Open person
changed the URL but left the directory visible. The same correction covers club
links and URL cleanup in the operating shell and connections drawer.

Contact detail is keyed to the requested person. Until detail loads successfully,
the screen no longer invents empty relationship sections. Load failures use plain
language and offer retry.

## Verification

- Authenticated local app connected to staging at 390 x 844. Home, Players,
  Opportunities, Network and Calendar render without horizontal overflow.
- Repaired Home has no secondary-read error; Calendar displays recorded dates.
- Network Open person displays the selected contact and recorded relationship
  history. Browser Back returns to the directory; Forward restores the contact.
- Valid staff context succeeds for Calendar, connected work, aftercare and contact
  detail. Contact output retains the newer `followups` implementation.
- Invalid workspace and non-member contexts are rejected by the three repaired
  Home/Calendar reads. Reviewed public wrappers resolve the authorized tenant;
  internal helpers remain unavailable to anonymous and authenticated clients.
  Requesting a Northstar contact under the DJM workspace is rejected.
- Meeting outcomes has RLS enabled and no direct anonymous/authenticated table
  access. No outcomes were created. Existing capture counts were unchanged.
- Security advisors report 60 authenticated-callable definer functions, 89
  RLS-without-policy information notices and the existing leaked-password warning.
  New wrapper grants and tenant checks were reviewed; this is not a clean overall
  security audit. The new private outcomes table deliberately uses RPC-only access.
  See [definer-function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
  and [RLS-without-policy advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- `npm run check`: 1,314 tests pass, TypeScript passes, production build passes.

## Frontend deployment manifest and remaining gate

- Project: `redream-systems-staging`, `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`.
- Scope: `jesseedge10-8415s-projects`; environment: **preview**.
- Source: PR #174 / `codex/agency-visual-qa` after this repair commit.
- Previous explicit deploy rejected by `api-deployments-free-per-day` (100/day).
  No new hosted frontend deployment is claimed. Retry once the quota resets.
- Continue authenticated player-profile and opportunity/deal detail checks,
  mobile keyboard/failure behaviour, and performance verification after deployment.
- Human acceptance remains: an unfamiliar football agent understands the five
  screens within 30 seconds on an iPhone.
