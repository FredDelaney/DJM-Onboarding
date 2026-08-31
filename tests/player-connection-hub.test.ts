import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hub = readFileSync("components/PlayerConnectionHub.tsx", "utf8");
const playerPage = readFileSync("app/admin/players/[id]/page.tsx", "utf8");
const intelligence = readFileSync("components/PlayerIntelligencePanel.tsx", "utf8");
const providerContract = readFileSync(
  "supabase/migrations/20260830184500_djm_player_provider_snapshot_contract_v1.sql",
  "utf8",
);

test("the admin player record has one primary connected-player workflow", () => {
  assert.match(playerPage, /<PlayerConnectionHub/);
  assert.match(playerPage, /documentCount=\{docs\.length\}/);
  assert.match(playerPage, /onUploadDocument=\{uploadDocument\}/);
  assert.match(playerPage, /onPlayerChange=\{setP\}/);
  assert.match(playerPage, /getElementById\('connected-player'\)/);
  assert.match(playerPage, /platforms=\{\['whatsapp','email'\]\}/);
  assert.match(playerPage, /tab==='overview'&&\([\s\S]*<PlayerConnectionHub/);
  assert.doesNotMatch(playerPage, /admin-player-quick-actions/);
  assert.match(playerPage, /<details className="admin-card admin-player-disclosure">/);
});

test("connected sources persist on the canonical player record", () => {
  assert.match(hub, /\.from\("players"\)/);
  assert.match(hub, /transfermarkt_url/);
  assert.match(hub, /wyscout_url/);
  assert.match(hub, /stats_url/);
  assert.match(hub, /instagram_url/);
  assert.match(hub, /\.select\("\*"\)/);
  assert.match(hub, /onPlayerChange\(data as PlayerRecord\)/);
});

test("saving a football source starts the permitted provider ladder without scraping Transfermarkt", () => {
  assert.match(hub, /refresh-player-data-universal/);
  assert.match(hub, /lastSync > sevenDaysAgo/);
  assert.match(hub, /void refresh\("background"\)/);
  assert.match(hub, /\/profil\\\/spieler\\\/\\d\+/);
  assert.doesNotMatch(hub, /djm-transfermarkt-enrich/);
  assert.match(hub, /Transfermarkt is stored as a research reference/);
});

test("provider snapshot storage accepts every deployed refresh provider", () => {
  assert.match(providerContract, /'api_football'/);
  assert.match(providerContract, /'pitchapi'/);
  assert.match(providerContract, /'thesportsdb'/);
  assert.match(providerContract, /'wyscout'/);
  assert.match(providerContract, /'sportmonks'/);
  assert.match(providerContract, /'manual'/);
  assert.match(hub, /player_provider_stat_snapshots/);
});

test("global intelligence is concise while advanced evidence remains behind progressive disclosure", () => {
  assert.match(playerPage, /<PlayerIntelligencePanel[\s\S]*compact/);
  assert.match(intelligence, /GLOBAL PLAYER INTELLIGENCE/);
  assert.match(intelligence, /What is shaping the score/);
  assert.match(intelligence, /<details/);
  assert.match(intelligence, /Advanced evidence and exceptions/);
  assert.match(intelligence, /Missing data is never scored as zero/);
  assert.match(intelligence, /Official data refreshes weekly/);
});
