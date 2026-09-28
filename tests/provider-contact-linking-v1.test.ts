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

    assert.match(
      migration,
      /having[\s\S]*count\([\s\S]*distinct person_id[\s\S]*\) = 1/i,
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


test(
  'confirmed provider contact links survive provider refresh',
  () => {
    const persistenceMigration =
      readFileSync(
        'supabase/migrations/20260928163500_preserve_provider_contact_identity_binding_v1.sql',
        'utf8',
      );

    assert.match(
      persistenceMigration,
      /person_id = coalesce\(djm_os\.provider_contact_sources\.person_id, excluded\.person_id\)/,
    );
  },
);


test(
  'confirmed provider email becomes canonical Network reach',
  () => {
    const reachMigration =
      readFileSync(
        'supabase/migrations/20260928180000_redream_provider_identity_canonical_reach_v1.sql',
        'utf8',
      );

    assert.match(
      reachMigration,
      /insert into[\s\S]*djm_os\.contact_methods/,
    );

    assert.match(
      reachMigration,
      /is_verified,[\s\S]*last_verified_at/,
    );

    assert.match(
      reachMigration,
      /canonical_contact_method_id/,
    );

    assert.match(
      reachMigration,
      /provider_contact_email_already_linked/,
    );
  },
);

test(
  'contact email uniqueness is tenant scoped',
  () => {
    const reachMigration =
      readFileSync(
        'supabase/migrations/20260928180000_redream_provider_identity_canonical_reach_v1.sql',
        'utf8',
      );

    assert.match(
      reachMigration,
      /contact_methods\([\s\S]*tenant_id,[\s\S]*channel,[\s\S]*normalised_value/,
    );
  },
);

test(
  'unlinking provider identity does not delete canonical reach',
  () => {
    const reachMigration =
      readFileSync(
        'supabase/migrations/20260928180000_redream_provider_identity_canonical_reach_v1.sql',
        'utf8',
      );

    assert.doesNotMatch(
      reachMigration,
      /delete\s+from\s+djm_os\.contact_methods/i,
    );

    assert.match(
      reachMigration,
      /canonical_email_retained/,
    );
  },
);
