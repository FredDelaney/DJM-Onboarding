import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260929151626_redream_home_connected_reply_context.sql',
  'utf8',
);
const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

test('personal Home reply context stays tenant and owner scoped', () => {
  assert.match(migration, /t\.tenant_id=p_tenant_id/);
  assert.match(migration, /t\.owner_user_id=p_user_id/);
  assert.match(migration, /i\.tenant_id=p_tenant_id/);
  assert.match(migration, /i\.team_member_id=p_user_id/);
});

test('reply context exposes only one confirmed connected identity and a replyable direction', () => {
  assert.match(migration, /num_nonnulls\(i\.person_id,i\.player_id\)=1/);
  assert.match(migration, /'google_email'/);
  assert.match(migration, /'microsoft_email'/);
  assert.match(migration, /'instagram_selected_chat'/);
  assert.match(migration, /'whatsapp_selected_chat'/);
  assert.match(migration, /'inbound','received'/);
  assert.match(migration, /not in \('outbound','sent'\)/);
  assert.match(migration, /nullif\(trim\(i\.summary\),''\) is not null/);
});

test('reply provenance is additive and keeps the existing server-only function boundary', () => {
  assert.match(migration, /'interaction_id',t\.interaction_id/);
  assert.match(migration, /'reply_interaction_id',tg\.reply_interaction_id/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path=''/);
  assert.match(
    migration,
    /revoke all on function public\.platform_server_user_task_commands\([\s\S]*from public,anon,authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.platform_server_user_task_commands\([\s\S]*to postgres,service_role/,
  );
});

test('Home opens reply drafting only for one owned task command', () => {
  assert.match(workspace, /command\?\.source_type === 'task'/);
  assert.match(
    workspace,
    /Number\(command\?\.evidence\?\.task_count \|\| 0\) === 1/,
  );
  assert.match(workspace, /command\?\.reply_interaction_id/);
  assert.match(workspace, /onPrepareConnectedReply/);
  assert.match(workspace, /Prepare reply/);
  assert.match(workspace, /AgencyConnectedReplyDrawer/);
});
