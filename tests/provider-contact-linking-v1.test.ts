import assert from 'node:assert/strict';
import {
  readFileSync,
} from 'node:fs';
import {
  test,
} from 'node:test';

const migration =
  readFileSync(
    'supabase/migrations/20260928150000_redream_provider_contact_linking_v1.sql',
    'utf8',
  );

const component =
  readFileSync(
    'components/AgencyProviderContactLinks.tsx',
    'utf8',
  );

const drawer =
  readFileSync(
    'components/AgencyConnectionsDrawer.tsx',
    'utf8',
  );

test(
  'provider contacts require explicit Network confirmation',
  () => {
    assert.match(
      migration,
      /redream_provider_contact_candidates/,
    );

    assert.match(
      migration,
      /redream_provider_contact_bind/,
    );

    assert.match(
      migration,
      /PROVIDER_CONTACT_NETWORK_LINKED/,
    );

    assert.doesNotMatch(
      migration,
      /insert into\s+djm_os\.people/i,
    );
  },
);

test(
  'linked provider identity becomes valid email context',
  () => {
    assert.match(
      migration,
      /redream_provider_contact_person_for_email/,
    );

    assert.match(
      migration,
      /provider_contact_sources/,
    );

    assert.match(
      migration,
      /platform_server_provider_email_contacts/,
    );

    assert.match(
      migration,
      /platform_server_provider_email_commit/,
    );
  },
);

test(
  'calendar can reuse confirmed provider identity',
  () => {
    assert.match(
      migration,
      /redream_enrich_provider_meeting_identity/,
    );

    assert.match(
      migration,
      /before insert or update of/,
    );
  },
);

test(
  'connections UI makes suggestions confirm-only',
  () => {
    assert.match(
      component,
      /Suggested:/,
    );

    assert.match(
      component,
      /Confirm before ReDream uses it/,
    );

    assert.match(
      component,
      /redream_provider_contact_bind/,
    );

    assert.match(
      drawer,
      /AgencyProviderContactLinks/,
    );
  },
);
