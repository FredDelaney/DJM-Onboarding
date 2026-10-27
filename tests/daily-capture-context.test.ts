import assert from "node:assert/strict";
import test from "node:test";
import * as context from "../lib/entity-context.ts";
import * as returns from "../lib/capture-return-path.ts";
const player = "11111111-1111-4111-8111-111111111111",
  club = "22222222-2222-4222-8222-222222222222",
  contact = "33333333-3333-4333-8333-333333333333";
test("workspace capture keeps the player and complete source query", () => {
  const value = context.contextFromWorkspaceRoute(
    "/workspace/djm",
    new URLSearchParams({ view: "players", player, profile: "1" }),
  );
  assert.equal(value.player_id, player);
  assert.equal(value.context_type, "player");
  assert.equal(
    value.route,
    "/workspace/djm?view=players&player=" + player + "&profile=1",
  );
  const params = new URL(
    context.aiCaptureHref(value.route!, value, "djm"),
    "https://example.test",
  ).searchParams;
  assert.equal(params.get("from"), value.route);
  assert.equal(params.get("player_id"), player);
});
test("workspace capture selects the matching club, contact and recruitment record", () => {
  assert.equal(
    context.contextFromWorkspaceRoute(
      "/agency",
      new URLSearchParams({ view: "network", club }),
    ).organisation_id,
    club,
  );
  assert.equal(
    context.contextFromWorkspaceRoute(
      "/agency",
      new URLSearchParams({ view: "network", person: contact }),
    ).person_id,
    contact,
  );
  assert.equal(
    context.contextFromWorkspaceRoute(
      "/agency",
      new URLSearchParams({ view: "players", target: player }),
    ).prospect_id,
    player,
  );
});
test("invalid IDs and unrelated routes never create capture associations", () => {
  assert.equal(
    context.contextFromWorkspaceRoute(
      "/agency",
      new URLSearchParams({ view: "players", player: "not-an-id" }),
    ).player_id,
    undefined,
  );
  assert.equal(
    context.contextFromWorkspaceRoute(
      "/settings",
      new URLSearchParams({ view: "players", player }),
    ).player_id,
    undefined,
  );
});
test("capture keeps the exact deal or club need selected in Opportunities", () => {
  assert.equal(
    context.contextFromWorkspaceRoute(
      "/workspace/djm",
      new URLSearchParams({
        view: "opportunities",
        tab: "deals",
        record: player,
      }),
    ).opportunity_id,
    player,
  );
  assert.equal(
    context.contextFromWorkspaceRoute(
      "/workspace/djm",
      new URLSearchParams({
        view: "opportunities",
        tab: "needs",
        record: club,
      }),
    ).club_need_id,
    club,
  );
  assert.equal(
    context.contextFromWorkspaceRoute(
      "/workspace/djm",
      new URLSearchParams({
        view: "opportunities",
        tab: "routes",
        record: club,
      }),
    ).club_need_id,
    undefined,
  );
});
test("record context looks up names through the existing tenant-bound server routes", () => {
  assert.equal(
    context.entityContextLookupRoute(
      { player_id: player, context_type: "player" },
      "/workspace/djm?view=players",
    ),
    "/admin/players/" + player,
  );
  assert.equal(
    context.entityContextLookupRoute(
      { opportunity_id: player, context_type: "opportunity" },
      "/workspace/djm?view=opportunities",
    ),
    "/opportunities/" + player,
  );
  assert.equal(
    context.entityContextLookupRoute(
      { organisation_id: "invalid", context_type: "club" },
      "/agency",
    ),
    "/agency",
  );
});
test("capture returns to the exact record and selected view within the same agency", () => {
  for (const from of [
    "/workspace/djm?view=players&player=" + player + "&profile=1",
    "/workspace/djm?view=network&network=people",
    "/workspace/djm?view=calendar&date=2026-10-12",
    "/agency?view=players",
  ])
    assert.equal(returns.captureWorkspaceReturnPath(from, "djm"), from);
});
test("capture rejects external, cross-tenant and malformed return destinations", () => {
  for (const from of [
    "https://evil.test",
    "//evil.test",
    "/workspace/other?view=players",
    "/workspace/djm/capture",
    "/workspace/djm-extra",
    "/workspace/djm\\escape",
    "/workspace/djm\n",
    "/settings",
    "/agency?workspace=other",
  ])
    assert.equal(
      returns.captureWorkspaceReturnPath(from, "djm"),
      "/workspace/djm",
      from,
    );
});
