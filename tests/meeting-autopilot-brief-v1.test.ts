import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260928220000_redream_meeting_autopilot_brief_v1.sql',
  'utf8',
);

const calendar = readFileSync(
  'components/AgencyCalendarWorkspace.tsx',
  'utf8',
);

const operating = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

const styles = readFileSync(
  'components/AgencyCalendarWorkspace.module.css',
  'utf8',
);
test(
  'meeting brief keeps Calendar V2 personal tenant visibility',
  () => {
    assert.match(migration, /m\.tenant_id=p_tenant_id/);
    assert.match(migration, /m\.owner_user_id=p_user_id/);
    assert.match(
      migration,
      /private\.user_has_staff_tenant_access/,
    );
  },
);

test(
  'meeting brief composes existing relationship and club intelligence',
  () => {
    assert.match(
      migration,
      /platform_server_relationship_person/,
    );
    assert.match(
      migration,
      /platform_server_club_account/,
    );
    assert.match(migration, /'relationship_memory'/);
    assert.match(migration, /'demand'/);
    assert.match(migration, /'commercial'/);
    assert.match(migration, /'pursuits'/);
  },
);
test(
  'legacy pre-tenant meeting brief is no longer a browser RPC',
  () => {
    assert.match(
      migration,
      /revoke all on function[\s\S]*djm_network_meeting_brief[\s\S]*authenticated/,
    );
  },
);

test(
  'Calendar linked meetings prepare in place through tenant RPC',
  () => {
    assert.match(
      operating,
      /AgencyCalendarWorkspace[\s\S]*rpc=\{rpc\}/,
    );
    assert.match(calendar, /redream_meeting_brief/);
    assert.match(calendar, /label: 'Prepare'/);
    assert.match(calendar, /MeetingBriefDrawer/);
  },
);

test(
  'meeting link stays inside preparation when context exists',
  () => {
    assert.match(calendar, /Join meeting/);
    assert.match(calendar, /meeting\.meeting_url/);
    assert.match(calendar, /RECENT CONVERSATIONS/);
    assert.match(calendar, /OPEN FOLLOW-UPS/);
    assert.match(calendar, /CLUB NEEDS/);
    assert.match(calendar, /LIVE BUSINESS/);
  },
);
test(
  'meeting preparation stays compact and mobile-first',
  () => {
    assert.match(styles, /\.briefDrawer/);
    assert.match(styles, /@media \(max-width: 620px\)/);
    assert.match(styles, /88dvh/);
  },
);

test(
  'meeting brief keeps outcome claims evidence-led',
  () => {
    assert.match(
      migration,
      /not predictions of deal success/,
    );
    assert.match(
      calendar,
      /not a prediction of the meeting or deal outcome/,
    );
  },
);
