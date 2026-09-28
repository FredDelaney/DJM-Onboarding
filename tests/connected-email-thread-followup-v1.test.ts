import assert from 'node:assert/strict';
import {
  readFileSync,
} from 'node:fs';
import {
  test,
} from 'node:test';

const sync =
  readFileSync(
    'supabase/functions/redream-provider-sync/index.ts',
    'utf8',
  );

const migration =
  readFileSync(
    'supabase/migrations/20260928190000_redream_connected_email_thread_followup_v1.sql',
    'utf8',
  );

test(
  'provider email sync preserves provider conversation identity',
  () => {
    assert.match(
      sync,
      /message\?\.threadId/,
    );

    assert.match(
      sync,
      /conversationId/,
    );

    assert.match(
      sync,
      /external_thread_id/,
    );
  },
);

test(
  'email receipts and capture context persist thread identity',
  () => {
    assert.match(
      migration,
      /add column if not exists[\s\S]*external_thread_id text/,
    );

    assert.match(
      migration,
      /provider_email_receipts_thread_idx/,
    );

    assert.match(
      migration,
      /'external_thread_id',[\s\S]*v_external_thread_id/,
    );
  },
);

test(
  'duplicate email sync backfills thread identity without recapture',
  () => {
    assert.match(
      migration,
      /if v_receipt_id is null then[\s\S]*external_thread_id[\s\S]*context_json/,
    );

    assert.match(
      migration,
      /v_duplicates :=[\s\S]*v_duplicates \+ 1/,
    );
  },
);

test(
  'outbound reply completes only one task from an earlier email in the same thread',
  () => {
    assert.match(
      migration,
      /redream_complete_email_thread_followup/,
    );

    assert.match(
      migration,
      /r\.external_thread_id =[\s\S]*v_thread_id/,
    );

    assert.match(
      migration,
      /r\.capture_id <>[\s\S]*v_capture_id/,
    );

    assert.match(
      migration,
      /t\.source like[\s\S]*r\.capture_id::text/,
    );

    assert.match(
      migration,
      /if v_candidate_count <> 1/,
    );

    assert.match(
      migration,
      /status =[\s\S]*'completed'/,
    );
  },
);

test(
  'thread follow-up completion remains private and auditable',
  () => {
    assert.match(
      migration,
      /CONNECTED_EMAIL_FOLLOWUP_AUTO_COMPLETED/,
    );

    assert.match(
      migration,
      /revoke all on function[\s\S]*private\.redream_complete_email_thread_followup/,
    );
  },
);
