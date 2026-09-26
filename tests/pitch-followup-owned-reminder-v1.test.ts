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

test('sent pitch follow-up becomes one explicit human action', async () => {
  const pursuit = await readFile(
    pursuitPath,
    'utf8',
  );

  assert.match(
    pursuit,
    /followUpMissing/,
  );
  assert.match(
    pursuit,
    /Set follow-up/,
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
    /FOLLOW-UP CONTROL/,
  );
  assert.match(
    pursuit,
    /Assign owner first/,
  );
  assert.match(
    pursuit,
    /never invented automatically/,
  );
});

test('deal next action preparation exposes what and when fields', async () => {
  const migration = await readFile(
    migrationPath,
    'utf8',
  );

  assert.match(
    migration,
    /jsonb_build_array\('next_action_text','next_action_at'\)/,
  );
  assert.match(
    migration,
    /reminder_owner_user_id/,
  );
  assert.match(
    migration,
    /reminder_owner_name/,
  );
  assert.match(
    migration,
    /reminder_assignment/,
  );
});

test('follow-up reminder is owned by the responsible agency user', async () => {
  const migration = await readFile(
    migrationPath,
    'utf8',
  );

  assert.match(
    migration,
    /v_owner:=v_deal\.owner_user_id/,
  );
  assert.match(
    migration,
    /deal_follow_up_owner_required/,
  );
  assert.match(
    migration,
    /ownership_required_first/,
  );
  assert.doesNotMatch(
    migration,
    /v_owner:=p_actor_user_id/,
  );
  assert.match(
    migration,
    /'deal_followup'/,
  );
  assert.match(
    migration,
    /owner_user_id/,
  );
  assert.match(
    migration,
    /redream:deal_followup:/,
  );
  assert.match(
    migration,
    /redream_tasks_open_deal_followup_uidx/,
  );
});

test('owned follow-up sync is tenant scoped and undo safe', async () => {
  const migration = await readFile(
    migrationPath,
    'utf8',
  );

  assert.match(
    migration,
    /t\.tenant_id=v_p\.tenant_id/,
  );
  assert.match(
    migration,
    /follow_up_task_before/,
  );
  assert.match(
    migration,
    /follow_up_task_after/,
  );
  assert.match(
    migration,
    /follow_up_task_changed_after_action_review_manually/,
  );
  assert.match(
    migration,
    /task_restored_on_undo/,
  );
});

test('shared action review shows reminder owner and the chosen date', async () => {
  const action = await readFile(
    actionPath,
    'utf8',
  );

  assert.match(
    action,
    /This follow-up reminder will belong to/,
  );
  assert.match(
    action,
    /reminderOwnerName/,
  );
  assert.match(
    action,
    /proposalPayload\?\.next_action_at/,
  );
  assert.match(
    action,
    /Responsible/,
  );
});

test('owned follow-up backend remains service-only', async () => {
  const migration = await readFile(
    migrationPath,
    'utf8',
  );

  assert.match(
    migration,
    /from public,anon,authenticated/,
  );
  assert.match(
    migration,
    /to postgres,service_role/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute[^;]+to authenticated/i,
  );
});

test('pitch execution returns canonical deal owner context for follow-up control', async () => {
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
    /d\.owner_user_id/,
  );
  assert.match(
    migration,
    /djm_os\.team_members/,
  );
});
