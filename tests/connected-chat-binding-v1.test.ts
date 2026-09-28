import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260928130000_redream_messaging_thread_binding_v1.sql',
  'utf8',
);

const messagingUi = readFileSync(
  'components/AgencyMessagingConnections.tsx',
  'utf8',
);

const aiProcess = readFileSync(
  'supabase/functions/_shared/ai-process.ts',
  'utf8',
);

test(
  'messaging threads can be explicitly linked to tenant Network contacts',
  () => {
    assert.match(
      migration,
      /bound_person_id uuid/,
    );

    assert.match(
      migration,
      /redream_messaging_thread_bind_contact/,
    );

    assert.match(
      migration,
      /p\.tenant_id = v_tenant/,
    );

    assert.match(
      migration,
      /bound_organisation_id/,
    );
  },
);

test(
  'linked messaging identities enrich future AI capture context',
  () => {
    assert.match(
      migration,
      /redream_enrich_messaging_capture_context/,
    );

    assert.match(
      migration,
      /'person_id'/,
    );

    assert.match(
      migration,
      /'organisation_id'/,
    );

    assert.match(
      migration,
      /'messaging_identity_bound'/,
    );
  },
);

test(
  'messaging UI lets an enabled chat choose a Network contact',
  () => {
    assert.match(
      messagingUi,
      /redream_messaging_thread_bind_contact/,
    );

    assert.match(
      messagingUi,
      /Link to Network contact/,
    );

    assert.match(
      messagingUi,
      /bound_person_id/,
    );
  },
);

test(
  'AI prefers explicitly linked chat identity',
  () => {
    assert.match(
      aiProcess,
      /agency explicitly linked this chat to that Network contact/,
    );

    assert.match(
      aiProcess,
      /current_context\.organisation_id/,
    );
  },
);
