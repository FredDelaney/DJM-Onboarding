import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workspacePath = new URL(
  '../components/AgencyOperatingWorkspace.tsx',
  import.meta.url,
);

const migrationPath = new URL(
  '../supabase/migrations/20260926085417_redream_important_dates_v1.sql',
  import.meta.url,
);

test('operations adds birthdays as important dates rather than fake deadlines', async () => {
  const migration = await readFile(
    migrationPath,
    'utf8',
  );

  assert.match(
    migration,
    /redream_autopilot_operations/,
  );
  assert.match(
    migration,
    /'important_dates'/,
  );

  assert.match(
    migration,
    /'birthdays'/,
  );

  assert.match(
    migration,
    /p\.date_of_birth/,
  );

  assert.match(
    migration,
    /p\.tenant_id=v_tenant/,
  );

  assert.match(
    migration,
    /29 February birthday is shown on 28 February/,
  );

  assert.match(
    migration,
    /not a contractual deadline or automatic outreach instruction/,
  );
});

test('important dates stay inside the existing tenant resolved read model', async () => {
  const migration = await readFile(
    migrationPath,
    'utf8',
  );

  assert.match(
    migration,
    /private\.redream_request_tenant\(\)/,
  );

  assert.match(
    migration,
    /revoke all on function public\.redream_autopilot_operations/,
  );

  assert.match(
    migration,
    /to authenticated,service_role/,
  );

  assert.doesNotMatch(
    migration,
    /create table/i,
  );
});

test('Calendar distinguishes birthdays playing contracts and agency agreements', async () => {
  const workspace = await readFile(
    workspacePath,
    'utf8',
  );

  assert.match(
    workspace,
    /The dates your agency cannot forget/,
  );

  assert.match(
    workspace,
    /BIRTHDAYS/,
  );

  assert.match(
    workspace,
    /PLAYER CONTRACTS/,
  );

  assert.match(
    workspace,
    /AGENCY AGREEMENTS/,
  );

  assert.match(
    workspace,
    /representation_record_end/,
  );
  assert.match(
    workspace,
    /contract_expiry/,
  );

  assert.match(
    workspace,
    /CakeSlice/,
  );
});

test('Calendar opens the exact player from a player related date', async () => {
  const workspace = await readFile(
    workspacePath,
    'utf8',
  );

  assert.match(
    workspace,
    /view=players&player=/,
  );

  assert.match(
    workspace,
    /Open player/,
  );

  assert.match(
    workspace,
    /encodeURIComponent/,
  );
});

test('Home reuses the same operations birthday evidence', async () => {
  const workspace = await readFile(
    workspacePath,
    'utf8',
  );

  assert.match(
    workspace,
    /operations\?\.important_dates\?\.birthdays\?\.items/,
  );

  assert.match(
    workspace,
    /const dayItems = \[/,
  );

  assert.match(
    workspace,
    /calendar_kind: 'birthday'/,
  );

  assert.match(
    workspace,
    /Turns \$\{item\.context\.turns_age\}/,
  );
});
