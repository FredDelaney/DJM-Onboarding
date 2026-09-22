import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

const migration = fs.readFileSync(
  'supabase/migrations/20260922111426_add_redream_relationship_contacts_v1.sql',
  'utf8',
);

test('Relationships loads the tenant-native clubs and contacts contract', () => {
  assert.match(
    workspace,
    /redream_autopilot_relationships/,
  );

  assert.match(
    workspace,
    /p_contact_limit:\s*250/,
  );

  assert.doesNotMatch(
    workspace,
    /await rpc<any>\('redream_autopilot_clubs'/,
  );
});

test('Relationships keeps clubs and people in one operating surface', () => {
  assert.match(
    workspace,
    /relationshipView === 'clubs'/,
  );

  assert.match(
    workspace,
    /relationshipView === 'contacts'/,
  );

  assert.match(
    workspace,
    />\s*Clubs\s*</,
  );

  assert.match(
    workspace,
    />\s*Contacts\s*</,
  );

  assert.match(
    workspace,
    /contactsByClub/,
  );

  assert.match(
    workspace,
    /Who we know here/,
  );
});

test('Contact intelligence carries identity access activity and live club context', () => {
  assert.match(
    workspace,
    /relationship\.owner_name/,
  );

  assert.match(
    workspace,
    /relationship\.route_state/,
  );

  assert.match(
    workspace,
    /activity\.last_interaction_at/,
  );

  assert.match(
    workspace,
    /clubContext\.active_deals/,
  );

  assert.match(
    workspace,
    /clubContext\.confirmed_needs/,
  );

  assert.match(
    workspace,
    /View club context/,
  );
});

test('Relationships backend resolves tenant context before exposing contact intelligence', () => {
  assert.match(
    migration,
    /private\.redream_request_tenant\(\)/,
  );

  assert.match(
    migration,
    /public\.platform_server_relationship_contacts/,
  );

  assert.match(
    migration,
    /r\.tenant_id = p_tenant_id/,
  );

  assert.match(
    migration,
    /p\.tenant_id = p_tenant_id/,
  );

  assert.match(
    migration,
    /to authenticated, service_role/,
  );

  assert.doesNotMatch(
    migration,
    /djm-sports-management/,
  );

  assert.doesNotMatch(
    migration,
    /northstar-football-management/,
  );
});
