import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260929014500_redream_post_meeting_outcome_reminders_v1.sql',
  'utf8',
);

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

const connections = readFileSync(
  'components/ConnectionsPanel.tsx',
  'utf8',
);

test(
  'outcome reminder only considers active staff-owned linked provider meetings',
  () => {
    assert.match(
      migration,
      /membership\.role in \([\s\S]*'owner'[\s\S]*'admin'[\s\S]*'agent'[\s\S]*'operations'[\s\S]*'scout'/,
    );
    assert.match(
      migration,
      /m\.provider in \('google','microsoft'\)/,
    );
    assert.match(
      migration,
      /m\.owner_user_id is not null/,
    );
    assert.match(
      migration,
      /m\.person_id is not null[\s\S]*m\.organisation_id is not null/,
    );
  },
);

test(
  'outcome reminder waits until after the meeting and avoids old backlog spam',
  () => {
    assert.match(
      migration,
      /m\.ends_at<=now\(\)-interval '15 minutes'/,
    );
    assert.match(
      migration,
      /m\.ends_at>=now\(\)-interval '6 hours'/,
    );
  },
);

test(
  'recorded meeting outcome suppresses the reminder',
  () => {
    assert.match(
      migration,
      /not exists \([\s\S]*djm_os\.meeting_outcomes[\s\S]*scheduled_starts_at=m\.starts_at[\s\S]*scheduled_ends_at=m\.ends_at/,
    );
  },
);

test(
  'same meeting preference controls preparation and outcome follow-up',
  () => {
    assert.match(
      migration,
      /prefs\.meeting_reminders/,
    );
    assert.match(
      connections,
      /title="Meeting reminders"/,
    );
    assert.match(
      connections,
      /before linked meetings and ask for the outcome afterwards/,
    );
  },
);

test(
  'outcome reminder reuses central delivery and deduplicates per scheduled instance',
  () => {
    assert.match(
      migration,
      /private\.djm_queue_delivery/,
    );
    assert.match(
      migration,
      /'meeting-outcome:'\|\|[\s\S]*item\.id::text[\s\S]*item\.starts_at/,
    );
    assert.match(
      migration,
      /'meeting_outcome'/,
    );
  },
);

test(
  'outcome reminder copy asks rather than claiming attendance',
  () => {
    assert.match(
      migration,
      /'How did it go\? '\|\|counterparty/,
    );
    assert.match(
      migration,
      /Confirm whether the meeting happened/,
    );
    assert.doesNotMatch(
      migration,
      /attendance confirmed|you definitely met|we know the meeting happened/i,
    );
  },
);

test(
  'outcome reminder deep-links to the exact tenant Home outcome drawer',
  () => {
    assert.match(
      migration,
      /'\/workspace\/'\|\|[\s\S]*item\.tenant_slug[\s\S]*'\?view=home&meetingOutcome='/,
    );
    assert.match(
      workspace,
      /search\.get\('meetingOutcome'\)/,
    );
    assert.match(
      workspace,
      /item\?\.meeting_id[\s\S]*requestedMeetingOutcomeId/,
    );
    assert.match(
      workspace,
      /setMeetingOutcomeRequest\(meeting\)/,
    );
    assert.match(
      workspace,
      /next\.delete\('meetingOutcome'\)/,
    );
  },
);

test(
  'outcome reminder queue is private and isolated from task reminders',
  () => {
    assert.match(
      migration,
      /revoke all on function[\s\S]*redream_queue_meeting_outcome_reminders[\s\S]*authenticated/,
    );
    assert.match(
      migration,
      /grant execute on function[\s\S]*redream_queue_meeting_outcome_reminders[\s\S]*service_role/,
    );
    assert.doesNotMatch(
      migration,
      /create or replace function private\.djm_queue_smart_reminders/,
    );
  },
);

test(
  'outcome reminder queues hourly just before the existing dispatcher',
  () => {
    assert.match(
      migration,
      /redream-meeting-outcome-hourly/,
    );
    assert.match(
      migration,
      /'12 \* \* \* \*'/,
    );
    assert.doesNotMatch(
      migration,
      /net\.http_post|dispatch-player-push|dispatch-djm-email/,
    );
  },
);

test(
  'outcome reminder carries tenant and scheduled-instance evidence',
  () => {
    assert.match(
      migration,
      /'tenant_id',item\.tenant_id/,
    );
    assert.match(
      migration,
      /'scheduled_starts_at',item\.starts_at/,
    );
    assert.match(
      migration,
      /'scheduled_ends_at',item\.ends_at/,
    );
    assert.match(
      migration,
      /'stage','aftercare'/,
    );
  },
);

test(
  'Home loads enough outcomes for deep-link routing but renders only four',
  () => {
    assert.match(
      workspace,
      /redream_meeting_aftercare[\s\S]*p_limit: 12/,
    );
    assert.match(
      workspace,
      /meetingAftercare\.items\.slice\(0, 4\)/,
    );
  },
);
