import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const aiProcess = readFileSync(
  'supabase/functions/_shared/ai-process.ts',
  'utf8',
);

test(
  'connected messages are interpreted as inbound external messages',
  () => {
    assert.match(
      aiProcess,
      /capture_origin is instagram or whatsapp[\s\S]*inbound message from the explicitly resolved connected identity/,
    );
    assert.match(
      aiProcess,
      /Only when neither verified identity exists may participant_label be copied exactly into contact_name/,
    );
    assert.match(
      aiProcess,
      /Never treat an external sender statement as an agency commitment/,
    );
  },
);

test(
  'explicit connected requests can become personal next actions without reply spam',
  () => {
    assert.match(
      aiProcess,
      /inbound connected message contains an explicit request or question that clearly requires agency action or a reply/,
    );
    assert.match(
      aiProcess,
      /Do not create a generic reply task for greetings, thanks, reactions, acknowledgements, vague interest/,
    );
    assert.match(
      aiProcess,
      /connected-message tasks[\s\S]*one short concrete next action/,
    );
  },
);

test(
  'connected football intelligence reuses the existing interaction and club need actions',
  () => {
    assert.match(
      aiProcess,
      /For inbound connected messages, use log_interaction for substantive football, player, club, deal, relationship or commercial content/,
    );
    assert.match(
      aiProcess,
      /inbound connected message explicitly states a club recruitment requirement[\s\S]*use upsert_club_need only when the club and position can be resolved/,
    );
  },
);

test(
  'context can resolve entities but cannot become evidence',
  () => {
    assert.match(
      aiProcess,
      /Current context may help resolve entities but must never be used as action evidence/,
    );
    assert.match(
      aiProcess,
      /Evidence must be a short verbatim excerpt copied from the transcript/,
    );
  },
);
