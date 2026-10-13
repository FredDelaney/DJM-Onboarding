import assert from "node:assert/strict";
import test from "node:test";
import {
  workspaceIntelligenceHref,
  workspaceIntelligenceListHref,
} from "../lib/workspace-record-navigation.ts";
const a = "00000000-0000-4000-8000-000000000091",
  b = "00000000-0000-4000-8000-000000000092";
test("opening a deal from its list records the selected identity and preserves filters", () => {
  const href = workspaceIntelligenceHref(
    "/workspace/djm",
    "view=opportunities&tab=deals&filter=open",
    { kind: "deal", entityId: b },
  );
  const query = new URL(href!, "https://example.test").searchParams;
  assert.equal(query.get("record"), b);
  assert.equal(query.get("filter"), "open");
  assert.equal(query.get("tab"), "deals");
});
test("opening deal B replaces search-selected A and clears unrelated record context", () => {
  const href = workspaceIntelligenceHref(
    "/workspace/djm",
    `view=opportunities&record=${a}&player=${a}&person=${a}&club=${a}`,
    { kind: "deal", entityId: b },
  );
  const query = new URL(href!, "https://example.test").searchParams;
  assert.equal(query.get("record"), b);
  for (const key of ["player", "person", "club"])
    assert.equal(query.has(key), false);
});
test("closing the selected deal returns to its list without stale record identity", () => {
  assert.equal(
    workspaceIntelligenceListHref(
      "/workspace/djm",
      `view=opportunities&tab=deals&record=${b}`,
      { kind: "deal", entityId: b },
    ),
    "/workspace/djm?view=opportunities&tab=deals",
  );
  assert.equal(
    workspaceIntelligenceListHref(
      "/workspace/djm",
      `view=opportunities&record=${a}`,
      { kind: "deal", entityId: b },
    ),
    null,
  );
});
test("player intelligence opens its canonical player record and invalid identities are ignored", () => {
  const query = new URL(
    workspaceIntelligenceHref(
      "/agency",
      "view=network&network=clubs&club=" + a,
      { kind: "player", entityId: b },
    )!,
    "https://example.test",
  ).searchParams;
  assert.equal(query.get("view"), "players");
  assert.equal(query.get("player"), b);
  assert.equal(query.has("club"), false);
  assert.equal(
    workspaceIntelligenceHref("/agency", "", {
      kind: "deal",
      entityId: "unconfirmed",
    }),
    null,
  );
});
