import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260929013000_redream_post_meeting_aftercare_v1.sql',
  'utf8',
);

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

const drawer = readFileSync(
  'components/AgencyMeetingOutcomeDrawer.tsx',
  'utf8',
);

const styles = readFileSync(
  'components/AgencyMeetingOutcomeDrawer.module.css',
  'utf8',
);

test(
  'post-meeting aftercare is personal and tenant scoped',
  () => {
    assert.match(
      migration,
      /private\.user_has_staff_tenant_access/,
    );
    assert.match(
      migration,
      /m\.tenant_id=p_tenant_id/,
    );
    assert.match(
      migration,
      /m\.owner_user_id=p_user_id/,
    );
    assert.match(
      migration,
      /m\.provider in \('google','microsoft'\)/,
    );
  },
);

test(
  'aftercare waits fifteen minutes and expires after forty eight hours',
  () => {
    assert.match(
      migration,
      /m\.ends_at<=now\(\)-interval '15 minutes'/,
    );
    assert.match(
      migration,
      /m\.ends_at>=now\(\)-interval '48 hours'/,
    );
  },
);

test(
  'only an explicit outcome for the same scheduled meeting instance closes aftercare',
  () => {
    assert.match(
      migration,
      /scheduled_starts_at/,
    );
    assert.match(
      migration,
      /scheduled_ends_at/,
    );
    assert.match(
      migration,
      /unique\([\s\S]*tenant_id,[\s\S]*meeting_id,[\s\S]*scheduled_starts_at,[\s\S]*scheduled_ends_at/,
    );
    assert.doesNotMatch(
      migration,
      /from djm_os\.interactions i/,
    );
    assert.match(
      migration,
      /Only an explicit outcome recorded for this meeting closes the prompt/,
    );
  },
);

test(
  'provider meeting status is not rewritten as proof of attendance',
  () => {
    assert.doesNotMatch(
      migration,
      /update\s+djm_os\.meetings[\s\S]*status\s*=/i,
    );
    assert.match(
      migration,
      /A passed calendar event does not prove that the meeting happened/,
    );
  },
);

test(
  'outcome writer accepts only the owning agent linked ended provider meeting',
  () => {
    assert.match(
      migration,
      /m\.owner_user_id=p_actor_user_id/,
    );
    assert.match(
      migration,
      /m\.person_id is not null[\s\S]*m\.organisation_id is not null/,
    );
    assert.match(
      migration,
      /m\.ends_at<=now\(\)/,
    );
    assert.match(
      migration,
      /meeting_already_resolved/,
    );
  },
);

test(
  'meeting outcomes are explicit human states',
  () => {
    assert.match(migration, /'happened'/);
    assert.match(migration, /'did_not_happen'/);
    assert.match(migration, /'rescheduled'/);
    assert.match(
      drawer,
      /Did this meeting happen\?/,
    );
    assert.match(drawer, />Happened</);
    assert.match(drawer, /Didn&apos;t happen/);
    assert.match(drawer, />Moved</);
  },
);

test(
  'happened meeting reuses canonical relationship memory and follow-up writers',
  () => {
    assert.match(
      migration,
      /platform_server_relationship_record_interaction/,
    );
    assert.match(
      migration,
      /platform_server_relationship_add_work/,
    );
    assert.match(
      migration,
      /'MEETING_OUTCOME_RECORDED'/,
    );
  },
);

test(
  'follow-up stays optional and requires a canonical person',
  () => {
    assert.match(
      migration,
      /followup_requires_contact/,
    );
    assert.match(
      drawer,
      /canCreateFollowup[\s\S]*meeting\?\.person_id/,
    );
    assert.match(
      drawer,
      /Follow-up needs a Network contact/,
    );
    assert.match(
      drawer,
      /The meeting outcome can still be saved/,
    );
  },
);

test(
  'meeting outcome storage is internal while browser uses tenant wrapper RPCs',
  () => {
    assert.match(
      migration,
      /revoke all on djm_os\.meeting_outcomes[\s\S]*authenticated/,
    );
    assert.match(
      migration,
      /platform_server_meeting_record_outcome[\s\S]*to postgres,service_role/,
    );
    assert.match(
      migration,
      /redream_meeting_record_outcome[\s\S]*to authenticated,service_role/,
    );
  },
);

test(
  'Home loads aftercare beside Connected Work and reloads after save',
  () => {
    assert.match(
      workspace,
      /redream_meeting_aftercare/,
    );
    assert.match(
      workspace,
      /meeting_aftercare: readValue\(2\)/,
    );
    assert.match(
      workspace,
      /MEETING FOLLOW-UP/,
    );
    assert.match(
      workspace,
      /Record outcome/,
    );
    assert.match(
      workspace,
      /AgencyMeetingOutcomeDrawer/,
    );
    assert.match(
      workspace,
      /onSaved=\{async \(\) => \{[\s\S]*await loadView\(\)/,
    );
  },
);

test(
  'outcome drawer never claims automatic external communication',
  () => {
    assert.doesNotMatch(
      drawer,
      /send_message|send_email|whatsapp_send|instagram_send/i,
    );
    assert.match(
      drawer,
      /The workspace records a conversation[\s\S]*after you confirm it here/,
    );
    assert.doesNotMatch(
      drawer,
      /ReDream|DJM Sports Management/,
    );
  },
);

test(
  'meeting outcome drawer is mobile first and safe-area aware',
  () => {
    assert.match(
      styles,
      /env\(safe-area-inset-bottom\)/,
    );
    assert.match(
      styles,
      /@media \(max-width: 680px\)/,
    );
    assert.match(
      styles,
      /88dvh/,
    );
    assert.match(
      styles,
      /grid-template-columns: 1fr/,
    );
  },
);
