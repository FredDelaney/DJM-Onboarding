import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const drawerPath = new URL(
  '../components/AgencyContactIntelligenceDrawer.tsx',
  import.meta.url,
);

const actionsPath = new URL(
  '../components/AgencyRelationshipActions.tsx',
  import.meta.url,
);

const memoryPath = new URL(
  '../components/AgencyRelationshipMemory.tsx',
  import.meta.url,
);

async function readMigration() {
  const migrationsUrl = new URL(
    '../supabase/migrations/',
    import.meta.url,
  );

  const names = await readdir(migrationsUrl);

  const name = names
    .filter((item) =>
      item.endsWith(
        '_redream_relationship_actions_v2.sql',
      ),
    )
    .sort()
    .pop();

  assert.ok(
    name,
    'Phase 5B.2 relationship actions migration must exist',
  );

  return readFile(
    new URL(name, migrationsUrl),
    'utf8',
  );
}

test('person drawer exposes direct relationship actions', async () => {
  const drawer = await readFile(drawerPath, 'utf8');
  const actions = await readFile(actionsPath, 'utf8');

  assert.match(drawer, /AgencyRelationshipActions/);
  assert.match(drawer, /PERSON/);
  assert.doesNotMatch(drawer, /CONTACT INTELLIGENCE/);

  assert.match(actions, /Log conversation/);
  assert.match(actions, /Add follow-up/);
  assert.match(actions, /Add promise/);
  assert.match(actions, /Update relationship/);
});

test('relationship actions use tenant-aware ReDream RPCs only', async () => {
  const actions = await readFile(actionsPath, 'utf8');

  assert.match(
    actions,
    /redream_relationship_record_interaction/,
  );
  assert.match(
    actions,
    /redream_relationship_add_work/,
  );
  assert.match(
    actions,
    /redream_relationship_update_route/,
  );

  assert.doesNotMatch(
    actions,
    /djm_network_log_contact_interaction/,
  );
  assert.doesNotMatch(
    actions,
    /djm_network_update_relationship/,
  );
  assert.doesNotMatch(actions, /\.from\(/);
  assert.doesNotMatch(actions, /supabase\./);
});

test('promises are visibly separate from follow-up', async () => {
  const memory = await readFile(memoryPath, 'utf8');

  assert.match(memory, /PROMISES TO KEEP/);
  assert.match(memory, /Promises/);
  assert.match(memory, /Open follow-up/);
  assert.match(memory, /Agency routes/);
});

test('write boundary resolves tenant and restricts server functions', async () => {
  const migration = await readMigration();

  assert.match(
    migration,
    /private\.redream_request_tenant\(\)/,
  );
  assert.match(
    migration,
    /workspace_access_denied/,
  );
  assert.match(
    migration,
    /m\.tenant_id = p_tenant_id/,
  );
  assert.match(
    migration,
    /revoke all on function public\.platform_server_relationship_record_interaction/,
  );
  assert.match(
    migration,
    /to postgres, service_role/,
  );

  assert.match(
    migration,
    /revoke all on function public\.platform_server_relationship_person\(uuid, uuid\)/,
  );
});
