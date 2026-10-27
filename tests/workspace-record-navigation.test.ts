import assert from "node:assert/strict";
import test from "node:test";
import {
  workspaceIntelligenceHref,
  workspaceIntelligenceListHref,
  workspaceIntelligenceRequestFromQuery,
} from "../lib/workspace-record-navigation.ts";
const a = "00000000-0000-4000-8000-000000000091",
  b = "00000000-0000-4000-8000-000000000092";
test('a cross-section deal request survives its matching destination route', () => {
  const request = {kind:'deal' as const,entityId:b,key:'deal:'+b,title:'Selected deal',context:'Example FC'};
  assert.equal(workspaceIntelligenceRequestFromQuery('view=opportunities&tab=deals&record='+b,request,true),request);
});
test('history selection clears stale deals and restores the requested deal', () => {
  const request = {kind:'deal' as const,entityId:b,key:'deal:'+b,title:'Selected deal'};
  assert.equal(workspaceIntelligenceRequestFromQuery('view=opportunities&tab=deals',request,true),null);
  const restored = workspaceIntelligenceRequestFromQuery('view=opportunities&tab=deals&record='+a,request,true);
  assert.equal(restored?.entityId,a);
  assert.equal(restored?.kind,'deal');
  assert.equal(workspaceIntelligenceRequestFromQuery('view=opportunities&tab=deals&record='+b,null,true)?.entityId,b);
});
test('route selection never opens commercial records without the workspace role', () => {
  assert.equal(workspaceIntelligenceRequestFromQuery('view=opportunities&tab=deals&record='+b,null,false),null);
  assert.equal(workspaceIntelligenceRequestFromQuery('view=opportunities&tab=deals&record=invalid',null,true),null);
});
test('player intelligence remains only on its own selected record', () => {
  const request = {kind:'player' as const,entityId:a,key:'player:'+a,title:'Selected player'};
  assert.equal(workspaceIntelligenceRequestFromQuery('view=players&player='+a,request,false),request);
  assert.equal(workspaceIntelligenceRequestFromQuery('view=players&player='+b,request,false),null);
});
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
