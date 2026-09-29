import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const connect = readFileSync(
  'supabase/functions/redream-meta-connect/index.ts',
  'utf8',
);
const migration = readFileSync(
  'supabase/migrations/20260929204500_redream_instagram_identity_assist_v1.sql',
  'utf8',
);
const resolver = readFileSync(
  'components/AgencyConnectedIdentityResolverDrawer.tsx',
  'utf8',
);
const connections = readFileSync(
  'components/AgencyMessagingConnections.tsx',
  'utf8',
);

test('Instagram catalog preserves provider username and display name as thread evidence', () => {
  const catalog =
    connect.match(
      /async function syncInstagramThreadCatalog[\s\S]*?\n}\n\nasync function bootstrapInstagramThreadHistory/,
    )?.[0] || '';

  assert.match(catalog, /participant_username/);
  assert.match(catalog, /participant_name/);
  assert.match(catalog, /instagram_conversation_participant/);
  assert.match(catalog, /participant\?\.username/);
  assert.match(catalog, /participant\?\.name/);
});

test('catalog evidence never binds a canonical identity automatically', () => {
  const catalog =
    connect.match(
      /async function syncInstagramThreadCatalog[\s\S]*?\n}\n\nasync function bootstrapInstagramThreadHistory/,
    )?.[0] || '';

  assert.doesNotMatch(catalog, /redream_messaging_thread_bind_/);
  assert.doesNotMatch(catalog, /create_prospect_and_bind/);
  assert.doesNotMatch(catalog, /create_contact_and_bind/);
});

test('tenant thread read model exposes provider evidence without changing identity kind', () => {
  assert.match(migration, /'participant_username'/);
  assert.match(migration, /t\.metadata->>'participant_username'/);
  assert.match(migration, /'participant_name'/);
  assert.match(migration, /t\.metadata->>'participant_name'/);
  assert.match(migration, /'participant_identity_source'/);
  assert.match(
    migration,
    /identity_kind'[\s\S]*bound_player_id[\s\S]*bound_prospect_id[\s\S]*bound_person_id/,
  );
});

test('provider display name is only an editable prefill after the agent opens create', () => {
  assert.match(resolver, /const providerNameForPrefill/);
  assert.match(resolver, /thread\.participant_name/);
  assert.match(
    resolver,
    /setNewProspect\([\s\S]*providerNameForPrefill\(activeThread\)[\s\S]*setCreateProspectOpen\(true\)/,
  );
  assert.match(
    resolver,
    /setNewContact\([\s\S]*providerNameForPrefill\(activeThread\)[\s\S]*setCreateContactOpen\(true\)/,
  );
  assert.match(resolver, /onClick=\{\(\) => void bindProspect\(prospect\)\}/);
});

test('prefill refuses a provider name that is just the same handle', () => {
  assert.match(
    resolver,
    /name\.toLowerCase\(\) === handle\.toLowerCase\(\)/,
  );
  assert.match(resolver, /name\.length < 2/);
  assert.match(resolver, /!\/\[a-z\]\//i);
});

test('switching or backing out of a chat clears unfinished target creation state', () => {
  const resets = resolver.match(/setCreateProspectOpen\(false\)/g) || [];
  assert.ok(resets.length >= 3);
  assert.match(
    resolver,
    /setNewProspect\(\{[\s\S]*full_name: ''[\s\S]*current_club: ''[\s\S]*primary_position: ''/,
  );
});

test('Connections and resolver show provider name as evidence but keep handle primary', () => {
  assert.match(connections, /thread\.participant_username/);
  assert.match(connections, /thread\.participant_name/);
  assert.match(connections, /Identity needed/);
  assert.match(resolver, /activeThread\.participant_username/);
  assert.match(resolver, /providerNameForPrefill\(activeThread\)/);
});
