import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(path, 'utf8');

const readiness = read(
  'supabase/migrations/20260917111327_require_complete_branding_for_go_live_v1.sql',
);

const repair = read(
  'supabase/migrations/20260917111513_complete_branding_operator_repair_path_v1.sql',
);

const actionSurface = read(
  'supabase/migrations/20260915124245_add_operator_action_surface_v1.sql',
);

test('agency go-live requires complete white-label branding evidence', () => {
  assert.match(
    readiness,
    /platform_server_customer_go_live_readiness/,
  );

  for (const field of [
    'display_name',
    'short_name',
    'portal_name',
    'logo_asset',
    'compact_logo_asset',
    'light_logo_asset',
    'favicon_asset',
    'primary_color',
    'secondary_color',
    'accent_color',
    'support_email',
  ]) {
    assert.match(
      readiness,
      new RegExp(`b\\.${field}`),
    );
  }

  assert.match(
    readiness,
    /The customer-facing logo or PWA assets are incomplete\./,
  );
  assert.match(
    readiness,
    /Use a local workspace asset path or HTTPS URL for every brand asset\./,
  );
  assert.match(
    readiness,
    /configured for launch/,
  );
});

test('branding repair path can set every asset required by go-live', () => {
  assert.match(
    repair,
    /platform_server_operator_update_branding/,
  );
  assert.match(
    repair,
    /light_logo_asset=\s*case/,
  );
  assert.match(
    repair,
    /invalid_light_logo_asset/,
  );
  assert.match(
    repair,
    /'light_logo_asset',light_logo_asset/,
  );
  assert.match(
    repair,
    /platform\.branding\.updated/,
  );
  assert.match(
    repair,
    /set search_path to ''/,
  );
});

test('unsafe brand assets and malformed colours are rejected at the repair boundary', () => {
  assert.match(
    repair,
    /invalid_logo_asset/,
  );
  assert.match(
    repair,
    /invalid_compact_logo_asset/,
  );
  assert.match(
    repair,
    /invalid_light_logo_asset/,
  );
  assert.match(
    repair,
    /invalid_favicon_asset/,
  );
  assert.match(
    repair,
    /invalid_primary_color/,
  );
  assert.match(
    repair,
    /invalid_secondary_color/,
  );
  assert.match(
    repair,
    /invalid_accent_color/,
  );
  assert.match(
    repair,
    /https:\/\//,
  );
});

test('the real operator go-live guard remains downstream of launch readiness', () => {
  assert.match(
    actionSurface,
    /platform_server_customer_go_live_readiness/,
  );
  assert.match(
    actionSurface,
    /launch_readiness_incomplete/,
  );
  assert.match(
    actionSurface,
    /'go_live_guard'/,
  );
});
