import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260929012000_redream_meeting_prep_reminder_security_v1.sql',
  'utf8',
);

test(
  'meeting reminder email tenant resolver is service-only',
  () => {
    assert.match(
      migration,
      /revoke all on function[\s\S]*email_outbox_tenant_id\(uuid,jsonb\)[\s\S]*authenticated/,
    );

    assert.match(
      migration,
      /grant execute on function[\s\S]*email_outbox_tenant_id\(uuid,jsonb\)[\s\S]*service_role/,
    );
  },
);
