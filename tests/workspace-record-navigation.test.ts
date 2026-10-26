import assert from "node:assert/strict";
import test from "node:test";
import {
  workspaceIntelligenceHref,
  workspaceIntelligenceListHref,
  workspaceIntelligenceRequestFromQuery,
  workspaceProfileFromDealHref,
  profileDealContextFromWarRoom,
} from "../lib/workspace-record-navigation.ts";
const a = "00000000-0000-4000-8000-000000000091",
  b = "00000000-0000-4000-8000-000000000092";
const club="00000000-0000-4000-8000-000000000093";
const exactDeal=()=>({deal_room_id:a,player:{player_id:b},club:{organisation_id:club,name:'Example FC'},deal:{title:'Example transfer',status:'active',private_notes:'Internal-only sentinel',owner_user_id:null}});
test('deal-to-profile navigation preserves the tenant and source identity without stale record selections',()=>{
 const href=workspaceProfileFromDealHref('/workspace/agency-two','view=opportunities&tab=deals&record='+a+'&person='+club,b,a);
 const url=new URL(href!,'https://example.test');
 assert.equal(url.pathname,'/workspace/agency-two');
 assert.equal(url.searchParams.get('player'),b);assert.equal(url.searchParams.get('source_deal'),a);assert.equal(url.searchParams.get('profile'),'1');
 for(const key of ['record','tab','person'])assert.equal(url.searchParams.has(key),false);
 for(const [player,deal] of [[b,'invalid'],['invalid',a]])assert.equal(workspaceProfileFromDealHref('/workspace/agency-two','',player,deal),null);
});
test('exact source context establishes player/deal/club identity and returns no internal deal data',()=>{
 assert.deepEqual(profileDealContextFromWarRoom(exactDeal(),a,b),{id:a,title:'Example transfer',organisation_id:club,club_name:'Example FC',status:'active'});
 assert.deepEqual(profileDealContextFromWarRoom(exactDeal(),a.toUpperCase(),b.toUpperCase()),profileDealContextFromWarRoom(exactDeal(),a,b));
});
test('mismatched, closed, unavailable and malformed exact records cannot select a sharing target',()=>{
 for(const value of [null,{},[],{...exactDeal(),available:false},{...exactDeal(),deal_room_id:club},{...exactDeal(),player:{player_id:club}},
  {...exactDeal(),club:{organisation_id:{toString:club},name:'Private club'}},{...exactDeal(),club:{organisation_id:club,name:''}},
  {...exactDeal(),deal:{title:'Closed deal',status:'closed'}}])assert.equal(profileDealContextFromWarRoom(value,a,b),null);
});
test('other record navigation and profile closing discard the previous source deal',()=>{
 const href=workspaceIntelligenceHref('/workspace/two','source_deal='+a,{kind:'player',entityId:b})!;
 assert.equal(new URL(href,'https://example.test').searchParams.has('source_deal'),false);
 assert.equal(workspaceIntelligenceListHref('/workspace/two','view=players&player='+b+'&profile=1&source_deal='+a,{kind:'player',entityId:b}),'/workspace/two?view=players');
});
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
