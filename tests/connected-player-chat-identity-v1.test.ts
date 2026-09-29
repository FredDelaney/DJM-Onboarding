import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260929060000_redream_connected_player_chat_identity_v1.sql',
  'utf8',
);

const resolver = readFileSync(
  'components/AgencyConnectedIdentityResolverDrawer.tsx',
  'utf8',
);

const resolverStyles = readFileSync(
  'components/AgencyConnectedIdentityResolverDrawer.module.css',
  'utf8',
);

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

const aiProcess = readFileSync(
  'supabase/functions/_shared/ai-process.ts',
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

test(
  'selected chat has exactly one canonical identity at a time',
  () => {
    assert.match(
      migration,
      /add column if not exists bound_player_id uuid/,
    );
    assert.match(
      migration,
      /num_nonnulls\(bound_person_id,bound_player_id\) <= 1/,
    );
    assert.match(
      migration,
      /bound_player_id=null[\s\S]*bound_person_id=p_person_id/,
    );
    assert.match(
      migration,
      /bound_person_id=null[\s\S]*bound_player_id=p_player_id/,
    );
  },
);

test(
  'player identity candidates are tenant-native signed players only',
  () => {
    assert.match(
      migration,
      /create or replace function public\.redream_messaging_player_candidates/,
    );
    assert.match(
      migration,
      /private\.redream_request_tenant\(\)/,
    );
    assert.match(
      migration,
      /private\.user_has_staff_tenant_access/,
    );
    assert.match(
      migration,
      /p\.tenant_id=v_tenant/,
    );
    assert.match(
      migration,
      /not in \('retired','inactive'\)/,
    );
  },
);

test(
  'recorded Instagram handle is suggestion evidence, never an automatic bind',
  () => {
    assert.match(
      migration,
      /'instagram_handle'/,
    );
    assert.match(
      resolver,
      /Exact Instagram handle/,
    );
    assert.match(
      resolver,
      /redream_messaging_thread_bind_player/,
    );
    assert.match(
      resolver,
      /onClick=\{\(\) => void bindPlayer\(player\)\}/,
    );
    assert.doesNotMatch(
      migration,
      /update djm_os\.messaging_threads[\s\S]{0,900}instagram_handle/,
    );
  },
);

test(
  'player bind is explicit and scoped to the signed in agent thread',
  () => {
    assert.match(
      migration,
      /create or replace function public\.redream_messaging_thread_bind_player/,
    );
    assert.match(
      migration,
      /t\.tenant_id=v_tenant[\s\S]*t\.user_id=v_user[\s\S]*t\.provider=v_provider[\s\S]*t\.external_thread_id=v_external_thread_id/,
    );
    assert.match(
      migration,
      /MESSAGING_THREAD_PLAYER_BOUND/,
    );
    assert.match(
      migration,
      /actor_user_id,player_id/,
    );
  },
);

test(
  'player current club is not promoted to messaging organisation identity',
  () => {
    assert.match(
      migration,
      /'player_current_club'/,
    );
    assert.match(
      migration,
      /bound_organisation_id=null,[\s\S]*bound_player_id=p_player_id/,
    );
    assert.match(
      aiProcess,
      /player_current_club is display context only/,
    );
    assert.match(
      aiProcess,
      /Never treat that club as the sender organisation/,
    );
  },
);

test(
  'selected message capture inherits explicitly bound player identity',
  () => {
    assert.match(
      migration,
      /create or replace function private\.redream_enrich_messaging_capture_context/,
    );
    assert.match(
      migration,
      /new\.player_id:=coalesce\(new\.player_id,v_player_id\)/,
    );
    assert.match(
      migration,
      /'messaging_identity_kind','player'/,
    );
    assert.match(
      migration,
      /'messaging_identity_bound',true/,
    );
  },
);

test(
  'connected interactions can preserve player identity from their source capture',
  () => {
    assert.match(
      migration,
      /alter table djm_os\.interactions[\s\S]*add column if not exists player_id/,
    );
    assert.match(
      migration,
      /create or replace function private\.redream_enrich_connected_interaction_player/,
    );
    assert.match(
      migration,
      /split_part\(new\.source_external_id,':',2\)::uuid/,
    );
    assert.match(
      migration,
      /new\.player_id:=v_player_id/,
    );
  },
);

test(
  'connected work preserves player identity without requiring a Home conversation feed',
  () => {
    assert.match(migration, /'player_id',i\.player_id/);
    assert.match(migration, /'player_name',case/);
    assert.match(migration, /when i\.player_id is not null then 'player'/);
    assert.match(workspace, /AgencyConnectedReplyDrawer/);
    assert.doesNotMatch(workspace, /item\?\.player_name \|\|[\s\S]*item\?\.person_name/);
  },
);

test(
  'resolved player threads no longer remain in the identity queue',
  () => {
    assert.match(
      migration,
      /mt\.bound_person_id is null[\s\S]*mt\.bound_player_id is null/,
    );
    assert.match(
      resolver,
      /!thread\.bound_person_id &&[\s\S]*!thread\.bound_player_id/,
    );
  },
);

test(
  'AI planner uses signed player context without fabricating a contact',
  () => {
    assert.match(
      aiProcess,
      /Use current_context\.player_name as player_name and leave contact_name null/,
    );
    assert.match(
      aiProcess,
      /Never turn participant_label into a contact name for a player-bound chat/,
    );
    assert.match(
      aiProcess,
      /Network person or a signed player/,
    );
  },
);

test(
  'reply drafts support one player or one Network person identity',
  () => {
    assert.match(
      migration,
      /alter table djm_os\.connected_reply_drafts[\s\S]*add column if not exists player_id/,
    );
    assert.match(
      migration,
      /alter column person_id drop not null/,
    );
    assert.match(
      migration,
      /num_nonnulls\(person_id,player_id\)=1/,
    );
    assert.match(
      migration,
      /'kind',v_identity_kind/,
    );
    assert.match(
      migration,
      /v_identity_kind='player'/,
    );
  },
);

test(
  'player reply context is isolated to the same player and same agent',
  () => {
    assert.match(
      migration,
      /i\.team_member_id=p_user_id/,
    );
    assert.match(
      migration,
      /v_identity_kind='player' and i\.player_id=v_interaction\.player_id/,
    );
    assert.match(
      migration,
      /interval '90 days'/,
    );
  },
);

test(
  'reply Edge Function treats player club as context only',
  () => {
    assert.match(
      replyEdge,
      /connected_identity/,
    );
    assert.match(
      replyEdge,
      /player_current_club/,
    );
    assert.match(
      replyEdge,
      /must not be treated as the club speaking/,
    );
    assert.doesNotMatch(
      replyEdge,
      /send_message|send_email|whatsapp_send|instagram_send/i,
    );
  },
);

test(
  'reply drawer displays player identity when present',
  () => {
    assert.match(
      replyDrawer,
      /identity_name/,
    );
    assert.match(
      replyDrawer,
      /player_name/,
    );
    assert.match(
      replyDrawer,
      /player_current_club/,
    );
  },
);

test(
  'identity resolver clearly separates players from Network people',
  () => {
    assert.match(
      resolver,
      /OUR PLAYERS/,
    );
    assert.match(
      resolver,
      /NETWORK/,
    );
    assert.match(
      resolver,
      /Signed players/,
    );
    assert.match(
      resolver,
      /Club and football contacts/,
    );
    assert.match(
      resolver,
      /Instagram is normally player communication/,
    );
    assert.match(
      resolver,
      /WhatsApp is normally club and football contact communication/,
    );
  },
);

test(
  'identity picker remains mobile safe and exact-handle styling is evidence not success',
  () => {
    assert.match(
      resolverStyles,
      /\.playerExact/,
    );
    assert.match(
      resolverStyles,
      /\.exactHandle/,
    );
    assert.match(
      resolverStyles,
      /@media \(max-width: 680px\)/,
    );
    assert.match(
      resolverStyles,
      /env\(safe-area-inset-bottom\)/,
    );
  },
);

test(
  'player identity feature does not add an external send path',
  () => {
    assert.doesNotMatch(
      resolver,
      /send_message|send_email|whatsapp_send|instagram_send/i,
    );
    assert.match(
      resolver,
      /Nothing here sends an external message/,
    );
  },
);
