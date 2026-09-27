import assert from 'node:assert/strict';
import {
  readFileSync,
  readdirSync,
} from 'node:fs';
import {
  test,
} from 'node:test';

const migrationName =
  readdirSync(
    'supabase/migrations',
  )
    .filter(
      (name) =>
        name.endsWith(
          '_redream_messaging_connections_v1.sql',
        ),
    )
    .sort()
    .at(-1);

assert.ok(
  migrationName,
  'messaging connection migration is missing',
);

const migration =
  readFileSync(
    'supabase/migrations/' +
      migrationName,
    'utf8',
  );

const connect =
  readFileSync(
    'supabase/functions/redream-meta-connect/index.ts',
    'utf8',
  );

const webhook =
  readFileSync(
    'supabase/functions/redream-meta-webhook/index.ts',
    'utf8',
  );

const messagingUi =
  readFileSync(
    'components/AgencyMessagingConnections.tsx',
    'utf8',
  );

const drawer =
  readFileSync(
    'components/AgencyConnectionsDrawer.tsx',
    'utf8',
  );

const config =
  readFileSync(
    'supabase/config.toml',
    'utf8',
  );

test(
  'messaging accounts are tenant and user scoped with Vault token storage',
  () => {
    assert.match(
      migration,
      /create table if not exists djm_os\.messaging_connections/,
    );
    assert.match(
      migration,
      /tenant_id uuid not null/,
    );
    assert.match(
      migration,
      /user_id uuid not null/,
    );
    assert.match(
      migration,
      /access_secret_id uuid not null/,
    );
    assert.match(
      migration,
      /vault\.create_secret/,
    );
    assert.match(
      migration,
      /vault\.update_secret/,
    );

    const table =
      migration.match(
        /create table if not exists djm_os\.messaging_connections \(([\s\S]*?)\n\);/,
      )?.[1] || '';

    assert.doesNotMatch(
      table,
      /\baccess_token\b/,
    );
    assert.doesNotMatch(
      table,
      /\brefresh_token\b/,
    );
  },
);

test(
  'unselected thread storage contains no message body or preview',
  () => {
    const threads =
      migration.match(
        /create table if not exists djm_os\.messaging_threads \(([\s\S]*?)\n\);/,
      )?.[1] || '';

    const receipts =
      migration.match(
        /create table if not exists djm_os\.messaging_message_receipts \(([\s\S]*?)\n\);/,
      )?.[1] || '';

    assert.doesNotMatch(
      threads,
      /message_text|raw_text|body|preview/i,
    );
    assert.doesNotMatch(
      receipts,
      /message_text|raw_text|body|preview/i,
    );
  },
);

test(
  'message bodies enter ReDream only after explicit thread selection',
  () => {
    const gate =
      migration.indexOf(
        'if not v_thread.is_selected then',
      );
    const captureInsert =
      migration.indexOf(
        'insert into djm_os.captures(',
      );

    assert.ok(
      gate >= 0,
      'selected-thread gate is missing',
    );
    assert.ok(
      captureInsert > gate,
      'capture insert must happen after the selected-thread gate',
    );
    assert.match(
      migration,
      /p_message_text text/,
    );
    assert.match(
      migration,
      /'capture_origin',v_provider/,
    );
    assert.match(
      migration,
      /whatsapp_selected_chat/,
    );
    assert.match(
      migration,
      /instagram_selected_chat/,
    );
  },
);

test(
  'browser access is RPC-only and webhook ingestion is service-only',
  () => {
    assert.match(
      migration,
      /revoke all on djm_os\.messaging_connections from public,anon,authenticated/,
    );
    assert.match(
      migration,
      /revoke all on djm_os\.messaging_threads from public,anon,authenticated/,
    );
    assert.match(
      migration,
      /redream_messaging_thread_set_selected/,
    );
    assert.match(
      migration,
      /grant execute on function public\.redream_messaging_receive[\s\S]*to service_role/,
    );
    assert.doesNotMatch(
      migration,
      /grant execute on function public\.redream_messaging_receive[\s\S]*to authenticated/,
    );
  },
);

test(
  'WhatsApp uses Embedded Signup and keeps Meta secrets server-side',
  () => {
    assert.match(
      messagingUi,
      /config_id/,
    );
    assert.match(
      messagingUi,
      /response_type:[\s\S]*'code'/,
    );
    assert.match(
      messagingUi,
      /override_default_response_type/,
    );
    assert.match(
      messagingUi,
      /event\.origin !==[\s\S]*'https:\/\/www\.facebook\.com'/,
    );
    assert.match(
      connect,
      /META_APP_SECRET/,
    );
    assert.match(
      connect,
      /META_WHATSAPP_CONFIG_ID/,
    );
    assert.doesNotMatch(
      messagingUi,
      /META_APP_SECRET/,
    );
  },
);

test(
  'Instagram uses current professional messaging scopes and server token exchange',
  () => {
    assert.match(
      connect,
      /instagram_business_basic/,
    );
    assert.match(
      connect,
      /instagram_business_manage_messages/,
    );
    assert.match(
      connect,
      /https:\/\/www\.instagram\.com\/oauth\/authorize/,
    );
    assert.match(
      connect,
      /https:\/\/api\.instagram\.com\/oauth\/access_token/,
    );
    assert.match(
      connect,
      /ig_exchange_token/,
    );
    assert.match(
      connect,
      /subscribed_apps/,
    );
    assert.doesNotMatch(
      connect,
      /scope[^\n]*business_manage_messages(?!.*instagram_business_manage_messages)/,
    );
  },
);

test(
  'Meta webhook verifies challenge and HMAC signature before processing',
  () => {
    assert.match(
      webhook,
      /META_WEBHOOK_VERIFY_TOKEN/,
    );
    assert.match(
      webhook,
      /x-hub-signature-256/,
    );
    assert.match(
      webhook,
      /HMAC/,
    );
    assert.match(
      webhook,
      /SHA-256/,
    );
    assert.match(
      webhook,
      /timingSafeEqual/,
    );
    assert.match(
      webhook,
      /message\?\.is_echo/,
    );
    assert.match(
      webhook,
      /redream_messaging_receive/,
    );
    assert.match(
      webhook,
      /redream-ai-process/,
    );
  },
);

test(
  'Connections drawer explains explicit chat opt-in in simple language',
  () => {
    assert.match(
      drawer,
      /AgencyMessagingConnections/,
    );
    assert.match(
      messagingUi,
      /Choose the chats[\s\S]*ReDream can learn[\s\S]*from/,
    );
    assert.match(
      messagingUi,
      /does not give ReDream[\s\S]*every conversation/,
    );
    assert.match(
      messagingUi,
      /Private until you switch it on/,
    );
    assert.match(
      messagingUi,
      /Agency[\s\S]*Memory/,
    );
  },
);

test(
  'Meta callback and webhook functions accept provider callbacks without Supabase JWT verification',
  () => {
    assert.match(
      config,
      /\[functions\.redream-meta-connect\][\s\S]*verify_jwt = false/,
    );
    assert.match(
      config,
      /\[functions\.redream-meta-webhook\][\s\S]*verify_jwt = false/,
    );
  },
);
