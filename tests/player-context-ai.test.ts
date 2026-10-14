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
