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
          '_redream_instagram_thread_catalog_v1.sql',
        ),
    )
    .sort()
    .at(-1);

assert.ok(
  migrationName,
  'Instagram thread catalogue migration is missing',
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

const ui =
  readFileSync(
    'components/AgencyMessagingConnections.tsx',
    'utf8',
  );

test(
  'Instagram catalogue reads thread metadata without message history',
  () => {
    const syncFunction =
      connect.match(
        /async function syncInstagramThreadCatalog[\s\S]*?\n}\n\nasync function bootstrapInstagramThreadHistory/,
      )?.[0] || '';

    assert.match(
      syncFunction,
      /\/conversations/,
    );
    assert.match(
      syncFunction,
      /id,updated_time,participants/,
    );
    assert.doesNotMatch(
      syncFunction,
      /messages\{/,
    );
    assert.doesNotMatch(
      syncFunction,
      /fields[\s\S]{0,160}message/,
    );
    assert.match(
      syncFunction,
      /page < 4/,
    );
    assert.match(
      syncFunction,
      /"25"/,
    );
  },
);

test(
  'catalogue token access and writes remain service-only',
  () => {
    assert.match(
      migration,
      /platform_server_messaging_secret/,
    );
    assert.match(
      migration,
      /vault\.decrypted_secrets/,
    );
    assert.match(
      migration,
      /revoke all on function public\.platform_server_messaging_secret[\s\S]*from public,anon,authenticated/,
    );
    assert.match(
      migration,
      /grant execute on function public\.platform_server_messaging_secret[\s\S]*to service_role/,
    );
    assert.match(
      migration,
      /grant execute on function public\.platform_server_messaging_thread_catalog_upsert[\s\S]*to service_role/,
    );

    const catalogSignature =
      migration.match(
        /create or replace function public\.platform_server_messaging_thread_catalog_upsert\(([\s\S]*?)\n\)/,
      )?.[1] || '';

    assert.doesNotMatch(
      catalogSignature,
      /message|body|raw_text/i,
    );
  },
);

test(
  'Instagram Login stores the professional account id for conversations and webhooks',
  () => {
    assert.match(
      connect,
      /id,user_id,username,name,account_type/,
    );
    assert.match(
      connect,
      /professionalUserId/,
    );
    assert.match(
      connect,
      /professional_user_id/,
    );
    assert.match(
      connect,
      /p_external_account_id: professionalUserId/,
    );
  },
);

test(
  'catalogue reuses an existing participant thread instead of creating duplicates',
  () => {
    const catalog =
      migration.match(
        /create or replace function public\.platform_server_messaging_thread_catalog_upsert[\s\S]*?\n\$function\$;/,
      )?.[0] || '';

    assert.match(
      catalog,
      /participant_external_id=trim\(p_participant_external_id\)/,
    );
    assert.match(
      catalog,
      /order by t\.is_selected desc,t\.updated_at desc/,
    );
    assert.match(
      catalog,
      /'catalog_conversation_id'/,
    );
    assert.match(
      catalog,
      /'matched_by','participant'/,
    );
  },
);

test(
  'live Instagram webhooks resolve to the catalogued participant before the capture gate',
  () => {
    const receive =
      migration.match(
        /create or replace function public\.redream_messaging_receive[\s\S]*?\n\$function\$;/,
      )?.[0] || '';

    const participantLookup =
      receive.indexOf(
        "t.participant_external_id=trim(p_participant_external_id)",
      );
    const threadInsert =
      receive.indexOf(
        'insert into djm_os.messaging_threads',
      );
    const selectedGate =
      receive.indexOf(
        'if not v_thread.is_selected then',
      );
    const captureInsert =
      receive.indexOf(
        'insert into djm_os.captures',
      );

    assert.ok(
      participantLookup >= 0,
      'participant lookup is missing',
    );
    assert.ok(
      threadInsert > participantLookup,
      'participant lookup must happen before fallback thread creation',
    );
    assert.ok(
      selectedGate > threadInsert,
      'selected-chat gate must happen after canonical thread resolution',
    );
    assert.ok(
      captureInsert > selectedGate,
      'message capture must happen only after the selected-chat gate',
    );
    assert.match(
      receive,
      /webhook_participant_match/,
    );
  },
);

test(
  'Connections lets agents refresh Instagram chats and still choose each chat explicitly',
  () => {
    assert.match(
      ui,
      /instagram_threads/,
    );
    assert.match(
      ui,
      /Refresh chats/,
    );
    assert.match(
      ui,
      /redream_messaging_thread_set_selected/,
    );
    assert.match(
      ui,
      /Private until you switch it on/,
    );
    assert.match(
      ui,
      /Nothing[\s\S]*is saved to[\s\S]*Agency Memory[\s\S]*until you[\s\S]*switch a chat[\s\S]*on/,
    );
  },
);
