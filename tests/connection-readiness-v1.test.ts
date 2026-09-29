import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const connections = readFileSync(
  'components/AgencyConnectionsDrawer.tsx',
  'utf8',
);
const messaging = readFileSync(
  'components/AgencyMessagingConnections.tsx',
  'utf8',
);
const styles = readFileSync(
  'components/AgencyConnectionsDrawer.module.css',
  'utf8',
);

test('connected provider state does not hide whether agency email is actually enabled', () => {
  assert.match(connections, /persistedEmailAccess/);
  assert.match(connections, /emailAccessChanged/);
  assert.match(connections, /styles\.emailOn/);
  assert.match(connections, /styles\.emailOff/);
  assert.match(connections, /\? 'On' : 'Off'/);
  assert.match(connections, /Update access/);
  assert.match(connections, /Choose Update access to apply this change\./);
});

test('email capability changes require explicit OAuth update before sync resumes', () => {
  assert.match(
    connections,
    /emailAccessChanged[\s\S]*void connect\(provider\.key\)[\s\S]*void syncProvider\(provider\.key\)/,
  );
  assert.match(
    connections,
    /emailAccessChanged \? 'Update access' : 'Sync now'/,
  );
  assert.match(connections, /!emailAccessChanged \? \(/);
});

test('messaging reports selected and unresolved identity counts to Connections', () => {
  assert.match(messaging, /onIdentityState\?: \(state:/);
  assert.match(messaging, /selected: selected\.length/);
  assert.match(messaging, /unresolved: unresolved\.length/);
  assert.match(connections, /onIdentityState=\{setMessagingIdentity\}/);
  assert.match(connections, /messagingIdentity\.unresolved/);
  assert.match(connections, /selected .*chat needs.* identity/);
});

test('identity review is the required next step before selected chat context is used', () => {
  assert.match(connections, /before ReDream uses that conversation context/);
  assert.match(connections, /Review identities/);
  assert.match(connections, /identityReady/);
  assert.match(messaging, /under Review identities/);
  assert.doesNotMatch(messaging, /identity from Home/);
});

test('readiness styling stays quiet rather than becoming another warning dashboard', () => {
  assert.match(styles, /\.emailOn/);
  assert.match(styles, /\.emailOff/);
  assert.match(styles, /\.identityAttention/);
  assert.match(styles, /\.identityReady/);
  assert.match(styles, /\.identityAttention[\s\S]*background: #f7fafb/);
  assert.match(styles, /\.identityReady[\s\S]*font-weight: 800/);
});
