import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("external player activation fails closed until tenant privacy is ready", () => {
  const migration = read(
    "supabase/migrations/20260915102724_tenant_aware_player_privacy_acceptance_v1.sql",
  );

  assert.match(migration, /'can_activate'/);
  assert.match(migration, /'agency_privacy_not_configured'/);
  assert.match(migration, /raise exception 'tenant_privacy_not_ready'/);
  assert.match(migration, /privacy_notice_version_mismatch/);
});

test("legacy internal privacy compatibility is retired by tenant parity", () => {
  const legacy = read(
    "supabase/migrations/20260915102724_tenant_aware_player_privacy_acceptance_v1.sql",
  );
  const parity = read(
    "supabase/migrations/20260924213000_tenant_parity_privacy_and_invites_v1.sql",
  );

  assert.match(legacy, /'mode','legacy_internal'/);
  assert.doesNotMatch(parity, /legacy_internal/);
  assert.doesNotMatch(parity, /internal_tenant/);
  assert.match(parity, /'privacy_notice_mode','tenant'/);
});

test("privacy notice versions are immutable evidence rather than a mutable label", () => {
  const migration = read(
    "supabase/migrations/20260915102724_tenant_aware_player_privacy_acceptance_v1.sql",
  );

  assert.match(migration, /tenant_privacy_notice_versions/);
  assert.match(migration, /unique \(tenant_id, notice_version\)/);
  assert.match(migration, /privacy_notice_version_conflict/);
  assert.match(migration, /notice_controller_name/);
  assert.match(migration, /notice_effective_at/);
  assert.match(migration, /notice_mode/);
});

test("player activation uses the server-selected tenant notice version", () => {
  const accept = read("supabase/functions/accept-player-invite/index.ts");
  const join = read("app/join/[token]/page.tsx");

  assert.match(accept, /platform_server_public_invite_preflight/);
  assert.match(accept, /expectedNoticeVersion/);
  assert.match(accept, /privacy_notice_changed/);
  assert.doesNotMatch(accept, /const PRIVACY_NOTICE_VERSION/);

  assert.match(join, /privacyNoticeVersion/);
  assert.match(join, /privacyNoticeUrl/);
  assert.match(join, /invite\?\.can_activate/);
  assert.doesNotMatch(join, /const PRIVACY_NOTICE_VERSION/);
});
