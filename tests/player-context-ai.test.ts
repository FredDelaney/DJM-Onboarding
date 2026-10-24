import assert from "node:assert/strict";
import test from "node:test";
import { researchPlayerContext } from "../supabase/functions/_shared/player-context-ai.ts";

test("player context research returns only source-grounded current facts", async () => {
  const source = "https://www.transfermarkt.com/example/profil/spieler/123";
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    output: [
      { type: "web_search_call", action: { sources: [
        { title: "Transfermarkt", url: source },
        { title: "League profile", url: "https://league.example/player/123" },
      ] } },
      { type: "message", content: [{ type: "output_text", text: JSON.stringify({
        identity_match: true,
        field_sources:Object.fromEntries(["current_club","current_league","current_country","current_season_label","primary_position","transfermarkt_url","stats_url"].map(key=>[key,[key==="transfermarkt_url"?source:"https://league.example/player/123"]])),
        confidence: 0.94,
        reason: "Name and date of birth match the current squad.",
        current_club: "Example FC Reserves",
        current_league: "Central League",
        current_country: "New Zealand",
        current_season_label: "2026",
        primary_position: "Central Midfielder",
        transfermarkt_url: source,
        stats_url: "https://league.example/player/123",
      }) }] },
    ],
  }), { status: 200, headers: { "content-type": "application/json" } });

  const result = await researchPlayerContext({
    player: { first_name: "Alex", last_name: "Example", date_of_birth: "2003-01-01" },
  }, { apiKey: "test", fetchImpl: fakeFetch });

  assert.equal(result.ok, true);
  assert.equal(result.fields.current_club, "Example FC Reserves");
  assert.equal(result.fields.current_league, "Central League");
  assert.equal(result.fields.current_season_label, "2026");
  assert.equal(result.fields.transfermarkt_url, source);
  assert.equal(result.sources.length, 2);
});

test("player context research refuses low-confidence identity matches", async () => {
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    output: [
      { type: "web_search_call", action: { sources: [{ title: "Source", url: "https://example.com/player" }] } },
      { type: "message", content: [{ type: "output_text", text: JSON.stringify({
        identity_match: true,
        confidence: 0.6,
        reason: "Name matches but identity is uncertain.",
        current_club: "Wrong FC",
        current_league: "League",
        current_country: "Country",
        current_season_label: "2026",
        primary_position: "CM",
        transfermarkt_url: null,
        stats_url: null,
      }) }] },
    ],
  }), { status: 200, headers: { "content-type": "application/json" } });
  const result = await researchPlayerContext({ player: { first_name: "Alex", last_name: "Example" } }, { apiKey: "test", fetchImpl: fakeFetch });
  assert.equal(result.ok, false);
  assert.deepEqual(result.fields, {});
});


const responseFor=(fields:any,fieldSources:any)=>new Response(JSON.stringify({output:[
 {type:'web_search_call',action:{sources:[{title:'Federation',url:'https://federation.example/player'},{title:'Club',url:'https://club.example/player'}]}},
 {type:'message',content:[{type:'output_text',text:JSON.stringify({identity_match:true,confidence:0.95,...fields,field_sources:fieldSources})}]}
]}));
test('identity and contract facts require their own surfaced evidence and complete dates',async()=>{
 const result=await researchPlayerContext({player:{first_name:'Alex'}},{apiKey:'test',fetchImpl:async()=>responseFor({date_of_birth:'2001-02-03',contract_expiry:'2028',contract_status:'Under contract',nationalities:['New Zealand'],height_cm:184,preferred_foot:'Right'},Object.fromEntries(['date_of_birth','contract_expiry','nationalities','height_cm','preferred_foot'].map(key=>[key,['https://federation.example/player']])))});
 assert.equal(result.fields.date_of_birth,'2001-02-03');assert.equal(result.fields.contract_expiry,undefined);assert.equal(result.fields.contract_status,undefined);assert.deepEqual(result.fields.nationalities,['New Zealand']);assert.equal(result.fields.height_cm,184);assert.equal(result.field_sources.date_of_birth?.[0].url,'https://federation.example/player');
});
test('a model citation outside the surfaced search results is not treated as evidence',async()=>{
 const result=await researchPlayerContext({player:{}},{apiKey:'test',fetchImpl:async()=>responseFor({current_club:'Invented FC',date_of_birth:'2001-02-30'},{current_club:['https://invented.example/player'],date_of_birth:['https://federation.example/player']})});assert.equal(result.ok,false);assert.deepEqual(result.fields,{});
});
test('the research deadline covers a stalled response body as well as fetch',async()=>{
 const result=await researchPlayerContext({player:{}},{apiKey:'test',timeoutMs:5,fetchImpl:async()=>({ok:true,json:()=>new Promise(()=>{})}) as Response});assert.equal(result.ok,false);assert.equal(result.reason,'timeout');
});
