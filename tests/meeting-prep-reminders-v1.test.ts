import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260929010000_redream_meeting_prep_reminders_v1.sql',
  'utf8',
);

const connections = readFileSync(
  'components/ConnectionsPanel.tsx',
  'utf8',
);

const calendar = readFileSync(
  'components/AgencyCalendarWorkspace.tsx',
  'utf8',
);

test(
  'meeting preparation has its own user preference',
  () => {
    assert.match(
      migration,
      /meeting_reminders boolean not null default true/,
    );
    assert.match(
      connections,
      /meeting_reminders: boolean/,
    );
    assert.match(
      connections,
      /title="Meeting preparation"/,
    );
    assert.match(
      connections,
      /mode === 'staff'/,
    );
  },
);

test(
  'meeting reminders only consider active staff-owned linked scheduled meetings',
  () => {
    assert.match(
      migration,
      /m\.status='scheduled'/,
    );
    assert.match(
      migration,
      /m\.owner_user_id is not null/,
    );
    assert.match(
      migration,
      /m\.person_id is not null[\s\S]*m\.organisation_id is not null/,
    );
    assert.match(
      migration,
      /membership\.role in \([\s\S]*'owner'[\s\S]*'admin'[\s\S]*'agent'[\s\S]*'operations'[\s\S]*'scout'/,
    );
  },
);

test(
  'meeting reminder cadence is 24 hours plus 2 hours without a 72 hour meeting alert',
  () => {
    assert.match(
      migration,
      /interval '2 hours'/,
    );
    assert.match(
      migration,
      /interval '24 hours'/,
    );
    assert.doesNotMatch(
      migration,
      /meeting_prep_72h|meeting-prep:[^\n]*72h/,
    );
  },
);

test(
  'minimal mode gets close prep only while normal and everything also get next-day prep',
  () => {
    assert.match(
      migration,
      /stage:='2h'/,
    );
    assert.match(
      migration,
      /in \('normal','everything'\)/,
    );
  },
);

test(
  'meeting preparation reuses central multichannel delivery and stage dedupe',
  () => {
    assert.match(
      migration,
      /private\.djm_queue_delivery/,
    );
    assert.match(
      migration,
      /'meeting-prep:'\|\|item\.id::text\|\|':'\|\|stage/,
    );
    assert.match(
      migration,
      /'meeting_prep_'\|\|stage/,
    );
  },
);

test(
  'meeting reminder job is isolated from the mature smart reminder scheduler',
  () => {
    assert.match(
      migration,
      /redream-meeting-prep-hourly/,
    );
    assert.match(
      migration,
      /select private\.redream_queue_meeting_prep_reminders\(\)/,
    );
    assert.doesNotMatch(
      migration,
      /create or replace function private\.djm_queue_smart_reminders/,
    );
  },
);

test(
  'notification deep link carries the exact meeting id',
  () => {
    assert.match(
      migration,
      /\/agency\?view=calendar&meeting=/,
    );
    assert.match(
      migration,
      /'meeting_id',item\.id/,
    );
  },
);

test(
  'Calendar opens the exact linked meeting brief from a reminder deep link',
  () => {
    assert.match(
      calendar,
      /useSearchParams/,
    );
    assert.match(
      calendar,
      /search\.get\('meeting'\)/,
    );
    assert.match(
      calendar,
      /entry\.meetingId === requestedMeetingId/,
    );
    assert.match(
      calendar,
      /Boolean\(entry\.personId \|\| entry\.organisationId\)/,
    );
    assert.match(
      calendar,
      /void openMeetingBrief\(item\)/,
    );
  },
);
