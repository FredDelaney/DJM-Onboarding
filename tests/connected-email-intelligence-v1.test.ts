import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260928140000_redream_provider_email_intelligence_v1.sql',
  'utf8',
);

const syncWorker = readFileSync(
  'supabase/functions/redream-provider-sync/index.ts',
  'utf8',
);

const aiProcess = readFileSync(
  'supabase/functions/_shared/ai-process.ts',
  'utf8',
);

const connections = readFileSync(
  'components/AgencyConnectionsDrawer.tsx',
  'utf8',
);

test(
  'email intelligence only accepts existing Network contact email matches',
  () => {
    assert.match(
      migration,
      /provider_email_receipts/,
    );

    assert.match(
      migration,
      /cm\.channel =\s*'email'/,
    );

    assert.match(
      migration,
      /v_match_count <> 1/,
    );

    assert.match(
      migration,
      /provider_email_not_enabled/,
    );
  },
);

test(
  'provider sync fetches recent Gmail and Microsoft email',
  () => {
    assert.match(
      syncWorker,
      /fetchGoogleEmails/,
    );

    assert.match(
      syncWorker,
      /newer_than:7d/,
    );

    assert.match(
      syncWorker,
      /fetchMicrosoftEmails/,
    );

    assert.match(
      syncWorker,
      /outlook\.body-content-type="text"/,
    );
  },
);

test(
  'captured provider email is sent through the existing ReDream AI pipeline',
  () => {
    assert.match(
      migration,
      /REDREAM_AI_CAPTURE_QUEUED/,
    );

    assert.match(
      syncWorker,
      /redream-ai-process/,
    );

    assert.match(
      syncWorker,
      /capture_ids/,
    );
  },
);

test(
  'AI distinguishes inbound external email from outbound agency email',
  () => {
    assert.match(
      aiProcess,
      /email_direction/,
    );

    assert.match(
      aiProcess,
      /inbound means the external Network contact wrote the email/,
    );

    assert.match(
      aiProcess,
      /outbound means the agency user wrote it/,
    );
  },
);

test(
  'connections UI explains the email privacy boundary',
  () => {
    assert.match(
      connections,
      /only recent/,
    );

    assert.match(
      connections,
      /people already/,
    );

    assert.match(
      connections,
      /emails_captured/,
    );
  },
);
