import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const messaging = readFileSync(
  'components/AgencyMessagingConnections.tsx',
  'utf8',
);
const resolver = readFileSync(
  'components/AgencyConnectedIdentityResolverDrawer.tsx',
  'utf8',
);
const connections = readFileSync(
  'components/AgencyConnectionsDrawer.tsx',
  'utf8',
);
const home = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const adminPlayer = readFileSync(
  'app/admin/players/[id]/page.tsx',
  'utf8',
);

test('Instagram is presented player-first without becoming player-only', () => {
  assert.match(messaging, /Best for player conversations/);
  assert.match(resolver, /Instagram is normally player communication/);
  assert.match(resolver, /use Network when this DM is actually a club or football contact/);
  assert.match(resolver, /START HERE · OUR PLAYERS/);
  assert.match(resolver, /Exact Instagram handle/);
});

test('WhatsApp is presented Network-first while still allowing player exceptions', () => {
  assert.match(messaging, /Best for club and football contacts/);
  assert.match(resolver, /WhatsApp is normally club and football contact communication/);
  assert.match(resolver, /use a signed player when the chat is actually with the player/);
  assert.match(resolver, /START HERE · NETWORK/);
});

test('connection surface no longer forces selected chats into Network-only identity', () => {
  assert.doesNotMatch(messaging, /Link to Network contact/);
  assert.doesNotMatch(messaging, /threadContactSelect/);
  assert.match(messaging, /bound_player_name/);
  assert.match(messaging, /Identity needed\. Usually link this Instagram DM to a signed player/);
  assert.match(messaging, /Identity needed\. Usually link this WhatsApp chat to a Network contact/);
});

test('email is an explicit agency-mailbox capability for club and Network work', () => {
  assert.match(connections, /Agency email/);
  assert.match(connections, /mailbox you use/);
  assert.match(connections, /clubs and football contacts/);
  assert.match(connections, /Calendar and contacts/);
  assert.match(connections, /club email can come from another/);
});

test('Home explains channel expectations instead of treating all identities the same', () => {
  assert.match(home, /Instagram usually belongs to a signed player/);
  assert.match(home, /WhatsApp and connected email usually belong to a Network person/);
  assert.match(home, /Confirm the exceptions explicitly/);
});

test('tenant-specific mailbox addresses are not hard-coded into shared product code', () => {
  const shared = [messaging, resolver, connections, home].join('\n');
  assert.doesNotMatch(shared, /jesse\.edge@djmsports\.com/i);
  assert.doesNotMatch(shared, /jesseedge10@gmail\.com/i);
});


test('player profile publishing uses tenant branding rather than a DJM email fallback', () => {
  assert.match(adminPlayer, /runtime\.branding\.support_email/);
  assert.doesNotMatch(adminPlayer, /jesse\.edge@djmsports\.com/i);
});
