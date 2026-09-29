import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260929194000_redream_recruitment_chat_identity_v1.sql',
  'utf8',
);
const resolver = readFileSync(
  'components/AgencyConnectedIdentityResolverDrawer.tsx',
  'utf8',
);
const messaging = readFileSync(
  'components/AgencyMessagingConnections.tsx',
  'utf8',
);
const replyEdge = readFileSync(
  'supabase/functions/redream-connected-reply-draft/index.ts',
  'utf8',
);
const replyDrawer = readFileSync(
  'components/AgencyConnectedReplyDrawer.tsx',
  'utf8',
);

test('selected chat supports exactly one Network, signed-player or recruitment-target identity', () => {
  assert.match(migration, /add column if not exists bound_prospect_id uuid/);
  assert.match(
    migration,
    /num_nonnulls\(bound_person_id,bound_player_id,bound_prospect_id\) <= 1/,
  );
  assert.match(
    migration,
    /create or replace function private\.redream_keep_single_messaging_identity/,
  );
});

test('recruitment candidates are tenant-scoped active targets and handle match stays suggestion only', () => {
  assert.match(
    migration,
    /create or replace function public\.redream_messaging_prospect_candidates/,
  );
  assert.match(migration, /p\.tenant_id=v_tenant/);
  assert.match(migration, /p\.linked_player_id is null/);
  assert.match(migration, /p\.signed_player_id is null/);
  assert.match(resolver, /Exact Instagram handle/);
  assert.match(resolver, /onClick=\{\(\) => void bindProspect\(prospect\)\}/);
  assert.doesNotMatch(
    migration,
    /update djm_os\.messaging_threads[\s\S]{0,800}instagram_handle/,
  );
});

test('create target and bind calls the canonical Recruitment function with resolved SQL types', () => {
  assert.match(
    migration,
    /platform_server_recruitment_create_target\([\s\S]*null::date,null::text,3::smallint/,
  );
});

test('agent can explicitly bind an existing target or create one from a selected player chat', () => {
  assert.match(
    resolver,
    /redream_messaging_thread_bind_prospect/,
  );
  assert.match(
    resolver,
    /redream_messaging_thread_create_prospect_and_bind/,
  );
  assert.match(resolver, /Targets not signed yet/);
  assert.match(resolver, /Create target and link this chat/);
  assert.match(
    migration,
    /MESSAGING_THREAD_PROSPECT_BOUND/,
  );
});

test('future selected messages inherit target identity and mirror to recruitment memory', () => {
  assert.match(
    migration,
    /alter table djm_os\.captures[\s\S]*add column if not exists prospect_id/,
  );
  assert.match(
    migration,
    /alter table djm_os\.interactions[\s\S]*add column if not exists prospect_id/,
  );
  assert.match(
    migration,
    /create or replace function private\.redream_enrich_messaging_capture_prospect/,
  );
  assert.match(
    migration,
    /create or replace function private\.redream_mirror_connected_prospect_interaction/,
  );
  assert.match(migration, /source='connected_messaging'/);
  assert.match(migration, /last_reply_at=case/);
  assert.match(migration, /recruitment_stage=case/);
});

test('history bootstrap writes one unified interaction and one recruitment interaction for targets', () => {
  assert.match(
    migration,
    /platform_server_messaging_history_ingest/,
  );
  assert.match(
    migration,
    /player_id,prospect_id/,
  );
  assert.match(
    migration,
    /instagram_selected_chat_history/,
  );
  assert.match(
    migration,
    /external_ref=v_external_message_id/,
  );
  assert.match(
    migration,
    /identity_kind'[\s\S]*'recruitment_target'/,
  );
});

test('target reply drafts use only that target and agent recent context', () => {
  assert.match(
    migration,
    /num_nonnulls\(i\.person_id,i\.player_id,i\.prospect_id\)=1/,
  );
  assert.match(
    migration,
    /v_identity_kind='recruitment_target' and i\.prospect_id=v_interaction\.prospect_id/,
  );
  assert.match(
    migration,
    /i\.team_member_id=p_user_id/,
  );
  assert.match(
    migration,
    /connected_reply_drafts[\s\S]*prospect_id/,
  );
});

test('AI draft knows a target is not yet represented and never treats club context as authority', () => {
  assert.match(replyEdge, /recruitment_target/);
  assert.match(replyEdge, /Do not imply that the player is signed, represented or under contract/);
  assert.match(replyEdge, /target current club is display context only/);
  assert.doesNotMatch(
    replyEdge,
    /send_message|send_email|whatsapp_send|instagram_send/i,
  );
});

test('reply drawer and connected work can render target identity', () => {
  assert.match(replyDrawer, /recruitment_target/);
  assert.match(replyDrawer, /prospect_name/);
  assert.match(replyDrawer, /prospect_current_club/);
  assert.match(messaging, /bound_prospect_id/);
  assert.match(messaging, /recruitment_target/);
  assert.match(migration, /'selected_chats_needing_link',v_unlinked_count/);
  assert.match(
    migration,
    /mt\.bound_person_id is null and mt\.bound_player_id is null and mt\.bound_prospect_id is null/,
  );
});

test('Home follow-up can prepare a reply for a confirmed target interaction', () => {
  assert.match(
    migration,
    /create or replace function public\.platform_server_user_task_commands/,
  );
  assert.match(
    migration,
    /num_nonnulls\(i\.person_id,i\.player_id,i\.prospect_id\)=1/,
  );
  assert.match(migration, /reply_interaction_id/);
});

test('promotion from target to represented player automatically carries selected chat identity forward', () => {
  assert.match(
    migration,
    /create or replace function private\.redream_promote_messaging_prospect_identity/,
  );
  assert.match(
    migration,
    /bound_player_id=v_player_id,[\s\S]*bound_prospect_id=null/,
  );
  assert.match(
    migration,
    /MESSAGING_PROSPECT_IDENTITY_PROMOTED/,
  );
});
