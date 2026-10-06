import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profile = readFileSync(
  'components/AgencyPlayerProfile.tsx',
  'utf8',
);
const css = readFileSync(
  'components/AgencyPlayerProfile.module.css',
  'utf8',
);
const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

test('Player Profile share creates a club-ready message around the tracked private link', () => {
  assert.match(profile, /const buildShareMessage =/);
  assert.match(profile, /Hi, sharing \$\{name\}'s Player Profile for your review\./);
  assert.match(profile, /clubNote \|\| null/);
  assert.match(profile, /draftProfile\.primary_position/);
  assert.match(profile, /draftProfile\.current_club/);
  assert.match(profile, /\.join\('\\n\\n'\)/);
  assert.match(profile, /player_profile_share_create/);
  assert.match(profile, /setShareResultMessage\(readyMessage\)/);
});

test('successful share handoff supports native mobile sharing without claiming the message was sent', () => {
  assert.match(profile, /typeof navigator\.share === 'function'/);
  assert.match(profile, /title: `\$\{name\} Player Profile`/);
  assert.match(profile, /url: shareResultUrl \|\| undefined/);
  assert.match(profile, />\s*Share now\s*</);
  assert.match(profile, />\s*Copy message\s*</);
  assert.match(profile, />\s*Copy link\s*</);
  assert.match(profile, /Club share ready\./);
  assert.doesNotMatch(profile, /Profile sent to/);
});

test('club-specific context remains optional and is reused in the profile and prepared message', () => {
  assert.match(profile, />Club-specific note</);
  assert.match(
    profile,
    /This appears in the private profile and the prepared message\./,
  );
  assert.match(profile, /pitch_message: shareMessage \|\| null/);
});

test('mobile share handoff has one dominant action and touch-safe copy fallbacks', () => {
  assert.match(css, /Club-ready share handoff v1/);
  assert.match(css, /\.sharePreparedMessage/);
  assert.match(css, /\.shareSuccess \.shareUtilityButton/);
  assert.match(
    css,
    /\.shareSuccessActions button:first-child[\s\S]*grid-column: 1 \/ -1/,
  );
  assert.match(
    css,
    /\.shareSuccessActions button[\s\S]*min-height: 44px/,
  );
});


test('linked Player Profile shares hand into the existing owned deal follow-up flow', () => {
  assert.match(profile, /const openShareFollowUp =/);
  assert.match(profile, /action: 'deal_step_prepare'/);
  assert.match(profile, /step_type: 'set_next_action'/);
  assert.match(
    profile,
    /If you sent this Player Profile, choose the next concrete follow-up and when you will do it\./,
  );
  assert.match(profile, /External send/);
  assert.match(profile, /value: 'Not assumed'/);
  assert.match(profile, />\s*Set follow-up\s*</);
  assert.match(workspace, /onOpenAction=\{\(request\) => setActionRequest\(request\)\}/);
  assert.match(css, /Player Profile follow-up handoff v1/);
  assert.match(css, /\.shareSuccess \.shareFollowUpButton/);
});


test('Player Profile sharing can target any existing club in the tenant network', () => {
  assert.match(profile, /const \[shareNetworkClubs, setShareNetworkClubs\]/);
  assert.match(profile, /const shareClubOptions = useMemo/);
  assert.match(profile, /\.\.\.clubs, \.\.\.shareNetworkClubs/);
  assert.match(profile, /invoke<any>\('create_options'\)/);
  assert.match(profile, /response\?\.options\?\.clubs/);
  assert.match(profile, /shareClubOptions\.map/);
  assert.match(
    profile,
    /Choose a club from your agency network\./,
  );
});
