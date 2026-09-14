import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("player invitation preflight uses the service-only public Edge route", () => {
  const join = read("app/join/[token]/page.tsx");

  assert.match(join, /player-invite-public/);

  assert.doesNotMatch(join, /validate_player_invite_v2/);

  assert.match(join, /invite\?\.agency/);
});

test("player invitation surfaces tenant agency identity instead of DJM copy", () => {
  const join = read("app/join/[token]/page.tsx");

  assert.match(join, /agencyName/);

  assert.match(join, /portalName/);

  assert.doesNotMatch(join, /Ask DJM/);

  assert.doesNotMatch(join, /DJM has already started/);

  assert.doesNotMatch(join, /DJM PLAYER/);

  assert.doesNotMatch(join, /Open my DJM Player/);

  assert.doesNotMatch(join, /activate your DJM Player account/);
});

test("invite acceptance keeps privacy enforcement but uses tenant-neutral errors", () => {
  const accept = read("supabase/functions/accept-player-invite/index.ts");

  assert.match(accept, /privacy_acknowledged !== true/);

  assert.match(accept, /PRIVACY_NOTICE_VERSION/);

  assert.doesNotMatch(accept, /current DJM Player Privacy Notice/);
});
