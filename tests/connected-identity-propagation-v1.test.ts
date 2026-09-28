import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260928230000_redream_connected_identity_propagation_v1.sql',
  'utf8',
);

test(
  'canonical Network email propagates to connected work',
  () => {
    assert.match(
      migration,
      /redream_propagate_network_email_identity/,
    );
    assert.match(
      migration,
      /djm_os\.provider_contact_sources/,
    );
    assert.match(
      migration,
      /djm_os\.meetings/,
    );
  },
);
test(
  'identity propagation is exact email and tenant scoped',
  () => {
    assert.match(
      migration,
      /s\.tenant_id = new\.tenant_id/,
    );
    assert.match(
      migration,
      /m\.tenant_id = new\.tenant_id/,
    );
    assert.match(
      migration,
      /lower\(btrim\(coalesce\(s\.email,''\)\)\) = v_email/,
    );
    assert.match(
      migration,
      /lower\(btrim\(coalesce\(m\.invitee_email,''\)\)\) = v_email/,
    );
  },
);

test(
  'propagation never overwrites an already linked provider identity',
  () => {
    assert.match(
      migration,
      /s\.person_id is null/,
    );
    assert.match(
      migration,
      /m\.person_id is null/,
    );
  },
);
test(
  'meeting link follows the current Network employment without overwriting explicit meeting club',
  () => {
    assert.match(
      migration,
      /e\.is_current = true/,
    );
    assert.match(
      migration,
      /organisation_id = coalesce\([\s\S]*m\.organisation_id,[\s\S]*v_organisation_id/,
    );
  },
);

test(
  'propagation records provenance and does not create people',
  () => {
    assert.match(
      migration,
      /CONNECTED_IDENTITY_PROPAGATED/,
    );
    assert.match(
      migration,
      /CONNECTED_MEETING_IDENTITY_BACKFILLED/,
    );
    assert.doesNotMatch(
      migration,
      /insert into\s+djm_os\.people/i,
    );
    assert.doesNotMatch(
      migration,
      /max\(u\.organisation_id\)/,
    );
  },
);

test(
  'private propagation function is not a browser API',
  () => {
    assert.match(
      migration,
      /revoke all on function[\s\S]*redream_propagate_network_email_identity[\s\S]*authenticated/,
    );
  },
);
