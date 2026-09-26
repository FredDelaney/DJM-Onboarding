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
          '_redream_provider_connections_v1.sql',
        ),
    )
    .sort()
    .at(-1);

assert.ok(
  migrationName,
  'provider connection migration is missing',
);

const migration =
  readFileSync(
    `supabase/migrations/${migrationName}`,
    'utf8',
  );

const edge =
  readFileSync(
    'supabase/functions/redream-provider-oauth/index.ts',
    'utf8',
  );

const drawer =
  readFileSync(
    'components/AgencyConnectionsDrawer.tsx',
    'utf8',
  );

const shell =
  readFileSync(
    'components/AgencyOperatingWorkspace.tsx',
    'utf8',
  );

test(
  'provider accounts are tenant and user scoped with Vault token storage',
  () => {
    assert.match(
      migration,
      /create table if not exists djm_os\.provider_connections/,
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
      /refresh_secret_id uuid not null/,
    );
    assert.match(
      migration,
      /vault\.create_secret/,
    );
    assert.match(
      migration,
      /vault\.update_secret/,
    );

    const providerTable =
      migration.match(
        /create table if not exists djm_os\.provider_connections \(([\s\S]*?)\n\);/,
      )?.[1] || '';

    assert.doesNotMatch(
      providerTable,
      /\brefresh_token\b/,
    );
    assert.doesNotMatch(
      providerTable,
      /\baccess_token\b/,
    );
  },
);

test(
  'old connection tables are tenantised rather than reused across agencies',
  () => {
    assert.match(
      migration,
      /alter table djm_os\.calendar_connections[\s\S]*add column if not exists tenant_id uuid/,
    );
    assert.match(
      migration,
      /alter table djm_os\.channel_connections[\s\S]*add column if not exists tenant_id uuid/,
    );
    assert.match(
      migration,
      /unique\(tenant_id,user_id,provider\)/,
    );
    assert.match(
      migration,
      /private\.redream_request_tenant\(\)/,
    );
  },
);

test(
  'OAuth state is one-time and expires before callback storage',
  () => {
    assert.match(
      migration,
      /provider_oauth_states/,
    );
    assert.match(
      migration,
      /expires_at>now\(\)/,
    );
    assert.match(
      migration,
      /used_at is null/,
    );
    assert.match(
      migration,
      /extensions\.digest/,
    );
    assert.match(
      migration,
      /extensions\.gen_random_bytes/,
    );

    assert.match(
      edge,
      /redream_provider_oauth_consume/,
    );
    assert.match(
      edge,
      /redream_provider_connection_store/,
    );
  },
);

test(
  'Google and Microsoft use offline read-only productivity scopes',
  () => {
    assert.match(
      edge,
      /access_type/,
    );
    assert.match(
      edge,
      /offline/,
    );
    assert.match(
      edge,
      /calendar\.events\.readonly/,
    );
    assert.match(
      edge,
      /contacts\.readonly/,
    );
    assert.match(
      edge,
      /gmail\.readonly/,
    );
    assert.match(
      edge,
      /offline_access/,
    );
    assert.match(
      edge,
      /Calendars\.Read/,
    );
    assert.match(
      edge,
      /Contacts\.Read/,
    );
    assert.match(
      edge,
      /Mail\.Read/,
    );
  },
);

test(
  'OAuth callback authenticates start manually and never exposes provider secrets to the client',
  () => {
    assert.match(
      edge,
      /admin\.auth\.getUser/,
    );
    assert.match(
      edge,
      /GOOGLE_OAUTH_CLIENT_SECRET/,
    );
    assert.match(
      edge,
      /MICROSOFT_OAUTH_CLIENT_SECRET/,
    );

    assert.doesNotMatch(
      drawer,
      /CLIENT_SECRET/,
    );
    assert.doesNotMatch(
      drawer,
      /refresh_token/,
    );
  },
);

test(
  'connected work stays outside primary navigation and uses a compact drawer',
  () => {
    assert.match(
      shell,
      /AgencyConnectionsDrawer/,
    );
    assert.match(
      shell,
      /Connections/,
    );
    assert.match(
      shell,
      /PlugZap/,
    );

    assert.doesNotMatch(
      shell,
      /\{ key: 'connections'/,
    );

    assert.match(
      drawer,
      /Calendar/,
    );
    assert.match(
      drawer,
      /Contacts/,
    );
    assert.match(
      drawer,
      /Email/,
    );
    assert.match(
      drawer,
      /Optional/,
    );
  },
);
