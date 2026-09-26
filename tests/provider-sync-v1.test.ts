import assert from 'node:assert/strict';
import {
  readFileSync,
  readdirSync,
} from 'node:fs';
import {
  test,
} from 'node:test';

const migrationName =
  readdirSync(
    'supabase/migrations',
  )
    .filter(
      (name) =>
        name.endsWith(
          '_redream_provider_calendar_contacts_sync_v1.sql',
        ),
    )
    .sort()
    .at(-1);

assert.ok(
  migrationName,
  'provider sync migration is missing',
);

const migration =
  readFileSync(
    `supabase/migrations/${migrationName}`,
    'utf8',
  );

const edge =
  readFileSync(
    'supabase/functions/redream-provider-sync/index.ts',
    'utf8',
  );

const drawer =
  readFileSync(
    'components/AgencyConnectionsDrawer.tsx',
    'utf8',
  );

test(
  'provider sync keeps contact source evidence private and tenant scoped',
  () => {
    assert.match(
      migration,
      /create table if not exists djm_os\.provider_contact_sources/,
    );
    assert.match(
      migration,
      /tenant_id uuid not null/,
    );
    assert.match(
      migration,
      /user_id uuid not null/,
    );
    assert.match(
      migration,
      /revoke all on djm_os\.provider_contact_sources[\s\S]*authenticated/,
    );
    assert.match(
      migration,
      /enable row level security/,
    );
  },
);

test(
  'provider contacts link only by exact tenant email and never auto-create Network people',
  () => {
    assert.match(
      migration,
      /cm\.tenant_id = p_tenant_id/,
    );
    assert.match(
      migration,
      /cm\.channel = 'email'/,
    );
    assert.match(
      migration,
      /cm\.normalised_value/,
    );

    assert.doesNotMatch(
      migration,
      /insert into djm_os\.people/,
    );
    assert.doesNotMatch(
      migration,
      /insert into djm_os\.employments/,
    );
  },
);

test(
  'calendar sync is user owned idempotent and bounded to provider events',
  () => {
    assert.match(
      migration,
      /meetings_provider_event_unique/,
    );
    assert.match(
      migration,
      /owner_user_id/,
    );
    assert.match(
      migration,
      /external_event_id/,
    );
    assert.match(
      migration,
      /provider_last_seen_at/,
    );
    assert.match(
      migration,
      /provider_sync:/,
    );
  },
);

test(
  'calendar adapters ignore all-day and personal-only events',
  () => {
    assert.match(
      edge,
      /dateTime/,
    );
    assert.match(
      edge,
      /isAllDay/,
    );
    assert.match(
      edge,
      /emails\.length === 0/,
    );
    assert.match(
      edge,
      /uniqueEmails/,
    );

    assert.doesNotMatch(
      edge,
      /event\.description/,
    );
    assert.doesNotMatch(
      edge,
      /bodyPreview/,
    );
  },
);

test(
  'Google and Microsoft use current read APIs with bounded pagination',
  () => {
    assert.match(
      edge,
      /googleapis\.com\/calendar\/v3\/calendars\/primary\/events/,
    );
    assert.match(
      edge,
      /people\.googleapis\.com\/v1\/people\/me\/connections/,
    );
    assert.match(
      edge,
      /graph\.microsoft\.com\/v1\.0\/me\/calendarView/,
    );
    assert.match(
      edge,
      /graph\.microsoft\.com\/v1\.0\/me\/contacts/,
    );
    assert.match(
      edge,
      /nextPageToken/,
    );
    assert.match(
      edge,
      /@odata\.nextLink/,
    );
  },
);

test(
  'Google contact sync is incremental and can recover from an expired token',
  () => {
    assert.match(
      edge,
      /requestSyncToken/,
    );
    assert.match(
      edge,
      /syncToken/,
    );
    assert.match(
      edge,
      /status === 410/,
    );
    assert.match(
      edge,
      /google_contacts_sync_token/,
    );
  },
);

test(
  'refresh tokens remain service only and rotate through Vault',
  () => {
    assert.match(
      migration,
      /vault\.decrypted_secrets/,
    );
    assert.match(
      migration,
      /vault\.update_secret/,
    );
    assert.match(
      migration,
      /to service_role/,
    );

    assert.doesNotMatch(
      drawer,
      /refresh_token/,
    );
  },
);

test(
  'sync supports signed-in manual use and protected scheduled automation',
  () => {
    assert.match(
      edge,
      /admin\.auth\.getUser/,
    );
    assert.match(
      edge,
      /redream_provider_sync_context/,
    );
    assert.match(
      edge,
      /get_push_scheduler_secret/,
    );
    assert.match(
      migration,
      /redream-provider-sync/,
    );
    assert.match(
      migration,
      /37 \*\/6 \* \* \*/,
    );
  },
);

test(
  'Connections gives connected accounts one direct Sync now action',
  () => {
    assert.match(
      drawer,
      /redream-provider-sync/,
    );
    assert.match(
      drawer,
      /Sync now/,
    );
    assert.match(
      drawer,
      /contacts_linked/,
    );
  },
);
