import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('sign-in routes from tenant membership instead of profile role', () => {
  const page = read('app/sign-in/page.tsx');
  const routing = read('lib/auth-routing.ts');

  assert.match(page, /resolveSignedInDestination/);
  assert.match(routing, /platformInvoke<\{ tenants\?: AgencyWorkspace\[\] \}>/);
  assert.match(routing, /'agency-os'/);
  assert.match(routing, /action: 'tenants'/);
  assert.match(routing, /workspace\.tenant_id === options\.runtimeTenantId/);
  assert.match(routing, /\/workspace\/\$\{encodeURIComponent\(workspace\.slug\)\}/);

  assert.doesNotMatch(page, /profiles[\s\S]*select\(['"]role/);
  assert.doesNotMatch(page, /profile\?\.role/);
  assert.doesNotMatch(page, /signUp\(/);
});

test('staff self-registration is removed in favour of tenant invitations', () => {
  const page = read('app/sign-in/page.tsx');

  assert.match(page, /secure invitation from their agency/i);
  assert.doesNotMatch(page, /Create staff access/);
  assert.doesNotMatch(page, /Agency staff: create authorised account/);
});

test('legacy admin list cannot execute retired DJM runtime APIs', () => {
  const page = read('app/admin/page.tsx');

  assert.match(page, /redirect\('\/agency\?view=players'\)/);
  assert.doesNotMatch(
    page,
    /djm_recruitment_targets|djm_active_team_members|djm_home_item_controls|djm_network_organisations/,
  );
});

test('tenant landing presents one role-aware entry point', () => {
  const landing = read('components/TenantPlayerLanding.tsx');

  assert.match(landing, /Agency staff/);
  assert.match(landing, /Represented players/);
  assert.match(landing, /Sign in/);
  assert.match(landing, /membership/i);
  assert.doesNotMatch(landing, /\bReDream\b/);
});

test('auth routing falls back to the player workspace only for linked players', () => {
  const routing = read('lib/auth-routing.ts');

  assert.match(routing, /\.from\('players'\)/);
  assert.match(routing, /\.eq\('user_id', userId\)/);
  assert.match(routing, /kind: 'player'/);
  assert.match(routing, /href: '\/home'/);
  assert.doesNotMatch(routing, /profiles/);
});

test('player shell redirects staff through tenant membership instead of profile role', () => {
  const shell = read('components/PlayerShell.tsx');

  assert.match(shell, /resolveAgencyWorkspaceEntry/);
  assert.match(shell, /runtime\.tenant_id/);
  assert.doesNotMatch(shell, /profile\?\.role === 'admin'/);
  assert.doesNotMatch(shell, /profile\?\.role === 'scout'/);
  assert.doesNotMatch(shell, /redirect: '\/admin'/);
});
