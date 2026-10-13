import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260929000500_redream_player_connected_activity_v1.sql',
  'utf8',
);

const agencyOs = readFileSync(
  'supabase/functions/agency-os/index.ts',
  'utf8',
);

const profile = readFileSync(
  'components/AgencyPlayerProfile.tsx',
  'utf8',
);

const styles = readFileSync(
  'components/AgencyPlayerProfile.module.css',
  'utf8',
);

test(
  'player communication uses explicit player-linked connected evidence only',
  () => {
    assert.match(
      migration,
      /c\.player_id=p_player_id/,
    );
    assert.match(
      migration,
      /c\.context_json->>'capture_origin'='email'/,
    );
    assert.match(
      migration,
      /'instagram_selected_chat'/,
    );
    assert.match(
      migration,
      /'whatsapp_selected_chat'/,
    );
  },
);

test(
  'player communication returns summaries and metadata rather than message bodies',
  () => {
    assert.match(
      migration,
      /'summary',coalesce/,
    );
    assert.doesNotMatch(
      migration,
      /'raw_text'/,
    );
    assert.doesNotMatch(
      migration,
      /'transcript_text'/,
    );
  },
);

test(
  'player communication keeps accountable ownership on activity and follow-ups',
  () => {
    assert.match(
      migration,
      /'owner_user_id',c\.submitted_by/,
    );
    assert.match(
      migration,
      /'owner_user_id',t\.owner_user_id/,
    );
    assert.match(
      profile,
      /AgencyOwnershipChip/,
    );
    assert.match(
      profile,
      /label="Owner"/,
    );
  },
);

test(
  'player profile reuses its existing server bundle instead of another browser request',
  () => {
    assert.match(
      agencyOs,
      /platform_server_player_connected_activity/,
    );
    assert.match(
      agencyOs,
      /return\{player,[\s\S]*communication/,
    );
    assert.doesNotMatch(
      profile,
      /platform_server_player_connected_activity/,
    );
  },
);

test(
  'connected player follow-ups are only those originating from player-linked connected captures',
  () => {
    assert.match(
      migration,
      /t\.player_id=p_player_id/,
    );
    assert.match(
      migration,
      /t\.source like[\s\S]*'tell_djm:'\|\|c\.id::text\|\|':%'/,
    );
  },
);

test(
  'Player Profile has a truthful Recent Communication empty state',
  () => {
    assert.match(
      profile,
      /RECENT COMMUNICATION/,
    );
    assert.match(
      profile,
      /No conversations linked to this player yet/,
    );
    assert.match(
      profile,
      /Emails and chats linked to this player will appear here/,
    );
  },
);

test(
  'player connected activity is service-only and does not send externally',
  () => {
    assert.match(
      migration,
      /revoke all on function[\s\S]*platform_server_player_connected_activity[\s\S]*authenticated/,
    );
    assert.match(
      migration,
      /Displaying connected activity never sends an external message/,
    );
  },
);

test(
  'player communication stays compact on mobile',
  () => {
    assert.match(
      styles,
      /\.communicationRow/,
    );
    assert.match(
      styles,
      /@media\(max-width:720px\)[\s\S]*\.communicationFollowupRow/,
    );
  },
);
