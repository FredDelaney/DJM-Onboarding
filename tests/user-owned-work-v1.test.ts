import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260926094944_redream_user_owned_work_v1.sql',
  import.meta.url,
);

test('new open staff tasks require one active tenant user owner', async () => {
  const migration = await readFile(migrationPath, 'utf8');

  assert.match(
    migration,
    /redream_enforce_staff_task_owner/,
  );
  assert.match(
    migration,
    /open_task_owner_required/,
  );
  assert.match(
    migration,
    /task_owner_must_be_active_tenant_staff/,
  );
  assert.match(
    migration,
    /new\.owner_user_id:=v_actor/,
  );
  assert.match(
    migration,
    /before insert or update on djm_os\.tasks/,
  );
});

test('personal task commands only read work owned by that user', async () => {
  const migration = await readFile(migrationPath, 'utf8');

  assert.match(
    migration,
    /platform_server_user_task_commands/,
  );
  assert.match(
    migration,
    /t\.owner_user_id=p_user_id/,
  );
  assert.match(
    migration,
    /'owner_user_id',p_user_id/,
  );
  assert.match(
    migration,
    /Identically named tasks owned by different people are never merged/,
  );
});

test('personal Home replaces agency task signals with the signed in user task feed', async () => {
  const migration = await readFile(migrationPath, 'utf8');

  assert.match(
    migration,
    /platform_server_personal_home_commands/,
  );
  assert.match(
    migration,
    /c\.value->>'source_type'<>'task'/,
  );
  assert.match(
    migration,
    /platform_server_user_task_commands/,
  );
  assert.match(
    migration,
    /f\.actor_user_id=p_user_id/,
  );
  assert.match(
    migration,
    /suppressed_by_user_decision/,
  );
});

test('delegated commitments on Home are user owned', async () => {
  const migration = await readFile(migrationPath, 'utf8');

  assert.match(
    migration,
    /platform_server_user_commitment_summary/,
  );
  assert.match(
    migration,
    /c\.owner_user_id=p_user_id/,
  );
  assert.match(
    migration,
    /Only commitments owned by this active agency user/,
  );
});

test('ReDream Home uses the personal work contracts while shared signals remain agency wide', async () => {
  const migration = await readFile(migrationPath, 'utf8');

  assert.match(
    migration,
    /redream_autopilot_v2/,
  );
  assert.match(
    migration,
    /platform_server_personal_home_commands/,
  );
  assert.match(
    migration,
    /platform_server_user_commitment_summary/,
  );
  assert.match(
    migration,
    /Player, club, market and deal signals remain shared agency evidence/,
  );
});

test('internal ownership helpers stay service only and browser Home stays tenant resolved', async () => {
  const migration = await readFile(migrationPath, 'utf8');

  for (const fn of [
    'platform_server_user_task_commands',
    'platform_server_personal_home_commands',
    'platform_server_user_commitment_summary',
  ]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on function public\\.${fn}\\([\\s\\S]*?from public,anon,authenticated`,
      ),
    );
  }

  assert.match(
    migration,
    /revoke all on function public\.redream_autopilot_home\(integer\)[\s\S]*?from public,anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.redream_autopilot_home\(integer\)[\s\S]*?to authenticated,service_role/,
  );
});
