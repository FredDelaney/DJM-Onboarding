import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('password recovery and passkey sign-in are wired into authentication', () => {
  const signIn = read('app/sign-in/page.tsx');
  const forgot = read('app/forgot-password/page.tsx');
  const reset = read('app/reset-password/page.tsx');
  const client = read('lib/supabase.ts');

  assert.match(signIn, /\/forgot-password/);
  assert.match(signIn, /signInWithPasskey/);
  assert.match(signIn, /Use Face ID or passkey/);
  assert.match(forgot, /resetPasswordForEmail/);
  assert.match(forgot, /\/reset-password/);
  assert.match(reset, /PASSWORD_RECOVERY/);
  assert.match(reset, /updateUser\(\{ password \}\)/);
  assert.match(reset, /isStrongPassword/);
  assert.match(client, /experimental:\s*\{\s*passkey:\s*true/);
});

test('connections UI exposes calendar, push, reminder and email controls', () => {
  const panel = read('components/ConnectionsPanel.tsx');
  const player = read('app/connections/page.tsx');
  const staff = read('app/(djm-os)/settings/connections/page.tsx');
  const settings = read('app/(djm-os)/settings/page.tsx');
  const shell = read('components/PlayerShell.tsx');

  assert.match(panel, /djm_get_calendar_subscription/);
  assert.match(panel, /djm_rotate_calendar_subscription/);
  assert.match(panel, /djm_email_delivery_status/);
  assert.match(panel, /notification_preferences/);
  assert.match(panel, /reminder_intensity/);
  assert.match(panel, /enableWebPush/);
  assert.match(panel, /Apple Calendar/);
  assert.match(panel, /Google Calendar/);
  assert.match(panel, /registerPasskey/);
  assert.match(player, /ConnectionsPanel/);
  assert.match(staff, /ConnectionsPanel/);
  assert.match(settings, /\/settings\/connections/);
  assert.match(shell, /\/connections/);
});

test('push configuration is loaded centrally rather than embedded in browser source', () => {
  const appExperience = read('components/AppExperience.tsx');
  const push = read('lib/push.ts');

  assert.doesNotMatch(appExperience, /BOWVR8ZWS/);
  assert.match(push, /djm_web_push_public_key/);
  assert.match(push, /push_subscriptions/);
  assert.doesNotMatch(push, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('connectivity and recruitment security changes are represented in source control', () => {
  const connectivity = read('supabase/migrations/20260902090000_djm_connectivity_source_alignment_v1.sql');
  const recruitment = read('supabase/migrations/20260901210811_fix_recruitment_promotion_security_boundary_v1.sql');

  assert.match(connectivity, /calendar_subscriptions/);
  assert.match(connectivity, /djm_calendar_feed_items/);
  assert.match(connectivity, /djm_web_push_public_key/);
  assert.match(connectivity, /email_outbox/);
  assert.match(connectivity, /reminder_intensity/);
  assert.match(recruitment, /security definer/i);
  assert.match(recruitment, /djm_os\.team_members/);
  assert.match(recruitment, /football_intelligence_subjects/);
});
