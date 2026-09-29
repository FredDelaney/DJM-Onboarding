import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260929080000_redream_selected_chat_history_bootstrap_v1.sql',
  'utf8',
);

const meta = readFileSync(
  'supabase/functions/redream-meta-connect/index.ts',
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

const helper = readFileSync(
  'lib/connected-messaging.ts',
  'utf8',
);

test(
  'history context requires selected chat plus one explicit canonical identity',
  () => {
    assert.match(
      migration,
      /t\.is_selected=true/,
    );
    assert.match(
      migration,
      /num_nonnulls\([\s\S]*t\.bound_person_id,[\s\S]*t\.bound_player_id[\s\S]*\)=1/,
    );
    assert.match(
      migration,
      /selected_identity_bound_thread_not_found/,
    );
  },
);

test(
  'history server contracts stay service-only',
  () => {
    for (const name of [
      'platform_server_messaging_history_context',
      'platform_server_messaging_history_ingest',
      'platform_server_messaging_history_complete',
    ]) {
      assert.match(
        migration,
        new RegExp(
          'revoke all on function[\\s\\S]*' +
            name +
            '[\\s\\S]*authenticated',
        ),
      );
      assert.match(
        migration,
        new RegExp(
          'grant execute on function[\\s\\S]*' +
            name +
            '[\\s\\S]*service_role',
        ),
      );
    }
  },
);

test(
  'history ingest preserves real inbound and outbound direction',
  () => {
    assert.match(
      migration,
      /v_direction not in \('inbound','outbound'\)/,
    );
    assert.match(
      migration,
      /direction,[\s\S]*v_direction/,
    );
    assert.match(
      meta,
      /selfIds\.has\(senderId\)[\s\S]*\? "outbound"[\s\S]*: "inbound"/,
    );
  },
);

test(
  'history ingest is deduplicated by provider message receipt',
  () => {
    assert.match(
      migration,
      /insert into djm_os\.messaging_message_receipts/,
    );
    assert.match(
      migration,
      /on conflict\(connection_id,external_message_id\)[\s\S]*do nothing/,
    );
    assert.match(
      migration,
      /'duplicate',true/,
    );
  },
);

test(
  'duplicate history refreshes only bootstrap interactions after an explicit rebind',
  () => {
    assert.match(
      migration,
      /i\.channel='instagram_selected_chat'/,
    );
    assert.match(
      migration,
      /i\.source_type='instagram_history'/,
    );
    assert.match(
      migration,
      /i\.source_external_id=v_external_message_id/,
    );
    assert.match(
      migration,
      /person_id=v_thread\.bound_person_id[\s\S]*player_id=null/,
    );
    assert.match(
      migration,
      /person_id=null[\s\S]*player_id=v_thread\.bound_player_id/,
    );
    assert.match(
      migration,
      /'identity_refreshed',[\s\S]*v_interaction_id is not null/,
    );
  },
);

test(
  'history completion records corrected identity count',
  () => {
    assert.match(
      migration,
      /p_identity_refreshed integer/,
    );
    assert.match(
      migration,
      /'history_identity_refreshed'/,
    );
    assert.match(
      migration,
      /'identity_refreshed'/,
    );
    assert.match(
      meta,
      /let identityRefreshed = 0/,
    );
    assert.match(
      meta,
      /ingested\?\.identity_refreshed/,
    );
    assert.match(
      meta,
      /p_identity_refreshed: identityRefreshed/,
    );
  },
);

test(
  'history becomes relationship or player context without creating retroactive work',
  () => {
    assert.match(
      migration,
      /insert into djm_os\.interactions/,
    );
    assert.match(
      migration,
      /'instagram_selected_chat'/,
    );
    assert.match(
      migration,
      /v_thread\.bound_person_id/,
    );
    assert.match(
      migration,
      /v_thread\.bound_player_id/,
    );
    assert.match(
      migration,
      /'instagram_history'/,
    );
    assert.doesNotMatch(
      migration,
      /insert into djm_os\.captures/i,
    );
    assert.doesNotMatch(
      migration,
      /insert into djm_os\.tasks/i,
    );
  },
);

test(
  'history stores bounded message evidence without duplicating raw text',
  () => {
    assert.match(
      migration,
      /raw_text,[\s\S]*summary,[\s\S]*confidence/,
    );
    assert.match(
      migration,
      /v_source_uri,[\s\S]*null,[\s\S]*left\(v_message,1800\),[\s\S]*1/,
    );
  },
);

test(
  'player club is not promoted to messaging organisation identity',
  () => {
    assert.match(
      migration,
      /when v_thread\.bound_person_id is not null[\s\S]*then v_organisation_id[\s\S]*else null/,
    );
  },
);

test(
  'history bootstrap is bounded to twenty recent messages and thirty days',
  () => {
    assert.match(
      meta,
      /messages\.limit\(20\)/,
    );
    assert.match(
      meta,
      /\.slice\(0, 20\)/,
    );
    assert.match(
      meta,
      /30 \* 24 \* 60 \* 60 \* 1000/,
    );
  },
);

test(
  'Meta reader has a conversation-object path plus messages-edge fallback',
  () => {
    assert.match(
      meta,
      /catalog_conversation_id/,
    );
    assert.match(
      meta,
      /payload\?\.messages\?\.data/,
    );
    assert.match(
      meta,
      /encodeURIComponent\(conversationId\) \+[\s\S]*"\/messages"/,
    );
  },
);

test(
  'history action reuses authenticated Meta connector and service RPCs',
  () => {
    assert.match(
      meta,
      /action === "instagram_thread_history"/,
    );
    assert.match(
      meta,
      /platform_server_messaging_secret/,
    );
    assert.match(
      meta,
      /platform_server_messaging_history_context/,
    );
    assert.match(
      meta,
      /platform_server_messaging_history_ingest/,
    );
    assert.match(
      meta,
      /platform_server_messaging_history_complete/,
    );
  },
);

test(
  'history reader never sends an Instagram message',
  () => {
    const start = meta.indexOf(
      'async function bootstrapInstagramThreadHistory',
    );
    const end = meta.indexOf(
      'Deno.serve(async (req)',
      start,
    );
    const block = meta.slice(start, end);

    assert.ok(start >= 0);
    assert.ok(end > start);
    assert.doesNotMatch(
      block,
      /method:\s*"POST"/,
    );
    assert.doesNotMatch(
      block,
      /recipient|message_id.*recipient/i,
    );
  },
);

test(
  'shared browser helper only invokes the bounded history action',
  () => {
    assert.match(
      helper,
      /action: 'instagram_thread_history'/,
    );
    assert.match(
      helper,
      /external_thread_id: externalThreadId/,
    );
    assert.doesNotMatch(
      helper,
      /send|post message/i,
    );
  },
);

test(
  'identity resolver bootstraps only after successful explicit identity binding',
  () => {
    assert.match(
      resolver,
      /const bootstrapHistory = async/,
    );
    assert.match(
      resolver,
      /thread\.provider !== 'instagram'/,
    );
    assert.match(
      resolver,
      /const history = await bootstrapHistory\(linkedThread\)/,
    );
    assert.match(
      resolver,
      /added to Agency Memory/,
    );
    assert.match(
      resolver,
      /Identity saved\. Recent Instagram history could not be imported yet/,
    );
  },
);

test(
  'Connections picker imports history only for a selected bound Instagram chat',
  () => {
    assert.match(
      connections,
      /result\?\.bound &&[\s\S]*provider === 'instagram' &&[\s\S]*thread\.is_selected/,
    );
    assert.match(
      connections,
      /bootstrapSelectedInstagramHistory/,
    );
  },
);

test(
  'turning a chat on does not import history before identity is resolved',
  () => {
    const start = connections.indexOf(
      'const setSelected =',
    );
    const end = connections.indexOf(
      'return (',
      start,
    );
    const block = connections.slice(start, end);

    assert.ok(start >= 0);
    assert.ok(end > start);
    assert.doesNotMatch(
      block,
      /bootstrapSelectedInstagramHistory/,
    );
  },
);

test(
  'history completion records one aggregate provenance event',
  () => {
    assert.match(
      migration,
      /MESSAGING_HISTORY_BOOTSTRAPPED/,
    );
    assert.match(
      migration,
      /'messages_imported'/,
    );
    assert.match(
      migration,
      /'external_action',false/,
    );
  },
);
