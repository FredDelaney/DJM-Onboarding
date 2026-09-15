import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('agency owner activation is white-label and supports new and existing accounts', () => {
  const join = read('app/platform/join/[token]/page.tsx');
  const layout = read('app/platform/join/layout.tsx');

  assert.match(join, /agency-owner-invite-public/);
  assert.match(join, /agency-owner-invite/);
  assert.match(join, /signInWithPassword/);
  assert.match(join, /PRIVATE AGENCY WORKSPACE/);
  assert.match(join, /--agency-primary/);
  assert.doesNotMatch(join, /DJM Player|DJM Sports|ReDream Systems/);
  assert.doesNotMatch(layout, /DJM Player|DJM Sports|ReDream Systems/);
});

test('owner activation never persists the readable invite token in browser storage', () => {
  const join = read('app/platform/join/[token]/page.tsx');

  assert.doesNotMatch(join, /localStorage/);
  assert.doesNotMatch(join, /sessionStorage/);
  assert.doesNotMatch(join, /document\.cookie/);
});

test('operator cockpit exposes activation milestones and secure invite handling', () => {
  const platform = read('app/platform/page.tsx');
  const activation = read('app/platform/AgencyActivationCard.tsx');

  assert.match(platform, /AgencyActivationCard/);
  assert.match(platform, /First value reached/);
  assert.match(activation, /create_owner_invite/);
  assert.match(activation, /mark_owner_invite_sent/);
  assert.match(activation, /revoke_owner_invite/);
});
