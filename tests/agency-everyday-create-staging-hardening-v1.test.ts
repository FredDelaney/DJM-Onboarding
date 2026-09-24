import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hardening = readFileSync(
  'supabase/migrations/20260924200918_harden_agency_everyday_create_team_member_guard_v1.sql',
  'utf8',
);

test('everyday create uses the existing active agency team member without mutating legacy permission sync', () => {
  assert.match(
    hardening,
    /private\.platform_server_ensure_team_member/,
  );

  assert.match(
    hardening,
    /tm\.user_id = p_user_id/,
  );

  assert.match(
    hardening,
    /tm\.is_active = true/,
  );

  assert.match(
    hardening,
    /agency_team_member_not_initialized/,
  );

  assert.doesNotMatch(
    hardening,
    /insert into djm_os\.team_members/,
  );

  assert.doesNotMatch(
    hardening,
    /update djm_os\.team_members/,
  );

  assert.doesNotMatch(
    hardening,
    /tell_djm_permissions/,
  );
});
