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
          '_redream_messaging_reliability_v1.sql',
        ),
    )
    .sort()
    .at(-1);

assert.ok(
  migrationName,
  'messaging reliability migration is missing',
);

const migration =
  readFileSync(
    'supabase/migrations/' +
      migrationName,
    'utf8',
  );

const maintenance =
  readFileSync(
    'supabase/functions/redream-messaging-maintenance/index.ts',
    'utf8',
  );

const messagingUi =
  readFileSync(
    'components/AgencyMessagingConnections.tsx',
    'utf8',
  );

const config =
  readFileSync(
    'supabase/config.toml',
    'utf8',
  );

test(
  'Instagram refresh targets stay service-only and refresh before expiry',
  () => {
    assert.match(
      migration,
      /platform_server_messaging_maintenance_targets/,
    );
    assert.match(
      migration,
      /c\.provider='instagram'/,
    );
    assert.match(
      migration,
      /token_expires_at <= now\(\)\+interval '30 days'/,
    );
    assert.match(
      migration,
      /last_token_refreshed_at,c\.created_at\)[\s\S]*24 hours/,
    );
    assert.match(
      migration,
      /platform_server_messaging_maintenance_targets\(integer\)[\s\S]*to service_role/,
    );
    assert.doesNotMatch(
      migration,
      /platform_server_messaging_maintenance_targets\(integer\)[\s\S]*to authenticated/,
    );
  },
);

test(
  'maintenance decrypts tokens only through a service-only RPC',
  () => {
    assert.match(
      migration,
      /vault\.decrypted_secrets/,
    );
    assert.match(
      migration,
      /platform_server_messaging_secret/,
    );
    assert.match(
      migration,
      /platform_server_messaging_secret\(uuid,uuid,text\)[\s\S]*to service_role/,
    );
    assert.doesNotMatch(
      messagingUi,
      /access_token|decrypted_secret/,
    );
  },
);

test(
  'Instagram long-lived tokens refresh through the provider endpoint',
  () => {
    assert.match(
      maintenance,
      /https:\/\/graph\.instagram\.com\/refresh_access_token/,
    );
    assert.match(
      maintenance,
      /ig_refresh_token/,
    );
    assert.match(
      maintenance,
      /platform_server_messaging_refresh_store/,
    );
    assert.match(
      migration,
      /vault\.update_secret/,
    );
    assert.match(
      migration,
      /last_token_refreshed_at=now\(\)/,
    );
  },
);

test(
  'expired or invalid provider tokens become a reconnect state',
  () => {
    assert.match(
      maintenance,
      /code === 190/,
    );
    assert.match(
      maintenance,
      /oauthexception/,
    );
    assert.match(
      maintenance,
      /Instagram access has expired\. Reconnect Instagram\./,
    );
    assert.match(
      migration,
      /p_reconnect_required boolean/,
    );
    assert.match(
      migration,
      /then 'error'/,
    );
  },
);

test(
  'messaging health is derived from persisted expiry without exposing the token',
  () => {
    assert.match(
      migration,
      /'health'/,
    );
    assert.match(
      migration,
      /'reconnect_required'/,
    );
    assert.match(
      migration,
      /'attention'/,
    );
    assert.match(
      migration,
      /'token_expires_at'/,
    );
    assert.doesNotMatch(
      migration.match(
        /create or replace function public\.redream_messaging_connections\(\)([\s\S]*?)\$function\$;/,
      )?.[1] || '',
      /access_secret_id|decrypted_secret|access_token/,
    );
  },
);

test(
  'maintenance scheduling is environment-specific and keeps the cron secret out of source',
  () => {
    assert.match(
      migration,
      /platform_server_schedule_messaging_maintenance/,
    );
    assert.match(
      migration,
      /p_supabase_url text/,
    );
    assert.match(
      migration,
      /17 4 \* \* \*/,
    );
    assert.match(
      migration,
      /djm_push_cron_secret/,
    );
    assert.doesNotMatch(
      migration,
      /xogoigaaskmuspiehkba|ltvmopvarlnidiozvpow/,
    );
  },
);

test(
  'maintenance endpoint requires the existing protected scheduler secret',
  () => {
    assert.match(
      maintenance,
      /get_push_scheduler_secret/,
    );
    assert.match(
      maintenance,
      /x-djm-cron/,
    );
    assert.match(
      maintenance,
      /return json\(\{ error: "Unauthorized" \}, 401\)/,
    );
    assert.match(
      config,
      /\[functions\.redream-messaging-maintenance\][\s\S]*verify_jwt = false/,
    );
  },
);

test(
  'messaging UI makes expiring and dead connections actionable',
  () => {
    assert.match(
      messagingUi,
      /Needs attention/,
    );
    assert.match(
      messagingUi,
      /Reconnect/,
    );
    assert.match(
      messagingUi,
      /try to refresh it automatically/,
    );
    assert.match(
      messagingUi,
      /needs to be reconnected before new messages can reach ReDream/,
    );
  },
);
