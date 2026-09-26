import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pursuitPath = new URL(
  '../components/AgencyPursuitRoom.tsx',
  import.meta.url,
);

const actionPath = new URL(
  '../components/AgencyActionDrawer.tsx',
  import.meta.url,
);

const migrationPath = new URL(
  '../supabase/migrations/20260926092414_redream_owned_deal_follow_up_v1.sql',
  import.meta.url,
);

test('pitch follow-up is visibly owned by one agency user', async () => {
  const pursuit = await readFile(
    pursuitPath,
    'utf8',
  );

  assert.match(
    pursuit,
    /FOLLOW-UP CONTROL/,
  );
  assert.match(
    pursuit,
    /deal_owner_user_id/,
  );
  assert.match(
    pursuit,
    /deal_owner_name/,
  );
  assert.match(
    pursuit,
    /Every task and reminder belongs to one accountable agency user/,
  );
  assert.match(
    pursuit,
    /Assign owner first/,
  );
  assert.match(
    pursuit,
    /Set follow-up/,
  );
});

test('pitch follow-up reuses guarded deal actions and invents no date', async () => {
  const pursuit = await readFile(
    pursuitPath,
    'utf8',
  );

  assert.match(
    pursuit,
    /deal_control_fix_prepare/,
  );
  assert.match(
    pursuit,
    /deal_step_prepare/,
  );
  assert.match(
    pursuit,
    /step_type: 'set_next_action'/,
  );
  assert.match(
    pursuit,
    /will not invent the action or date/,
  );
  assert.doesNotMatch(
    pursuit,
    /now\(\)\s*\+\s*interval/,
  );
  assert.doesNotMatch(
    pursuit,
    /\.from\(/,
  );
});

test('universal action drawer asks for owner and follow-up inputs', async () => {
  const drawer = await readFile(
    actionPath,
    'utf8',
  );

  assert.match(
    drawer,
    /assign_deal_owner/,
  );
  assert.match(
    drawer,
    /owner_user_id/,
  );
  assert.match(
    drawer,
    /set_deal_next_action/,
  );
  assert.match(
    drawer,
    /next_action_text/,
  );
  assert.match(
    drawer,
    /next_action_at/,
  );
});

test('database guard routes an unowned deal into owner assignment first', async () => {
  const migration = await readFile(
    migrationPath,
    'utf8',
  );

  assert.match(
    migration,
    /p_step_type='set_next_action'/,
  );
  assert.match(
    migration,
    /d\.owner_user_id/,
  );
  assert.match(
    migration,
    /'assign_owner'/,
  );
  assert.match(
    migration,
    /platform_server_deal_owner_candidates/,
  );
  assert.match(
    migration,
    /jsonb_build_array\('owner_user_id'\)/,
  );
  assert.match(
    migration,
    /jsonb_build_array\(\s*'next_action_text',\s*'next_action_at'/s,
  );
});

test('pitch execution returns owner evidence with tenant-safe privileges', async () => {
  const migration = await readFile(
    migrationPath,
    'utf8',
  );

  assert.match(
    migration,
    /deal_owner_user_id/,
  );
  assert.match(
    migration,
    /deal_owner_name/,
  );
  assert.match(
    migration,
    /linked_deals_without_owner/,
  );
  assert.match(
    migration,
    /An unowned deal must be assigned before a new follow-up can be recorded/,
  );
  assert.match(
    migration,
    /revoke all on function public\.platform_server_prepare_deal_step/,
  );
  assert.match(
    migration,
    /revoke all on function public\.platform_server_pitch_execution_command/,
  );
  assert.match(
    migration,
    /to postgres,service_role/,
  );
});
