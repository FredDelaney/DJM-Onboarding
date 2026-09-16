import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  applyConfirmedEntityResolutions,
  canonicalClaimKey,
} from "../supabase/functions/_shared/ai-safety.ts";

const eliasResolution = {
  context_json: {
    resolutions: [
      {
        field_key: "entity:contact:elias-novak",
        value: {
          entity_id: "f343ce03-789c-4897-91db-0fc51fd052b1",
          entity_type: "player",
          canonical_label: "Elias Novak",
          label: "Elias Novak · Player · Adriatic 1919",
        },
      },
    ],
  },
};

test("one confirmed player identity propagates across later actions", () => {
  for (const type of ["log_interaction", "add_claim"]) {
    const resolved = applyConfirmedEntityResolutions(eliasResolution, {
      type,
      contact_name: "Elias Novak",
      player_name: null,
    });

    assert.equal(resolved.contact_name, null);
    assert.equal(resolved.player_name, "Elias Novak");
  }
});

test("confirmed identity never propagates to a different person", () => {
  const resolved = applyConfirmedEntityResolutions(eliasResolution, {
    type: "add_claim",
    contact_name: "Another Person",
    player_name: null,
  });

  assert.equal(resolved.contact_name, "Another Person");
  assert.equal(resolved.player_name, null);
});

test("claim keys are deterministic ASCII snake_case", () => {
  assert.equal(
    canonicalClaimKey("preferred_side", "player_preference"),
    "preferred_side",
  );
  assert.equal(
    canonicalClaimKey(" Preferred Side ", "player_preference"),
    "preferred_side",
  );
  assert.equal(
    canonicalClaimKey(" 조건", "transfer_preference"),
    "transfer_preference",
  );
  assert.equal(canonicalClaimKey("", ""), "note");
});

test("tenant runtime never serves stale tenant mappings", () => {
  const source = readFileSync(
    "supabase/functions/platform-tenant-runtime/index.ts",
    "utf8",
  );

  assert.match(source, /"Cache-Control": "private, no-store"/);
  assert.doesNotMatch(source, /stale-while-revalidate/);
});

test("AI worker applies go-live safety before database writes", () => {
  const source = readFileSync(
    "supabase/functions/_shared/ai-process.ts",
    "utf8",
  );

  assert.match(source, /applyConfirmedEntityResolutions/);
  assert.match(
    source,
    /canonicalClaimKey\(action\.claim_key, action\.claim_type\)/,
  );
});
