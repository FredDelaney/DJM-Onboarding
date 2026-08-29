import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvidencePreview,
  evidenceFreshness,
  FOOTBALL_PROVIDER_POLICY,
  normaliseSeasonRecord,
  parseManualSeasonCsv,
  parseManualSeasonJson,
  playerScoreState,
} from "../lib/football-data.ts";

test("provider policy keeps unlicensed sources unavailable", () => {
  assert.equal(
    FOOTBALL_PROVIDER_POLICY.transfermarkt.capability,
    "reference_only",
  );
  assert.equal(FOOTBALL_PROVIDER_POLICY.sofascore.capability, "disabled");
  assert.equal(FOOTBALL_PROVIDER_POLICY.wyscout.capability, "disabled");
  assert.equal(FOOTBALL_PROVIDER_POLICY.manual.capability, "manual_import");
});

test("normalisation keeps blank values null and explicit zero as zero", () => {
  const record = normaliseSeasonRecord({
    season_label: "2025/26",
    club_name: "DJM FC",
    appearances: "0",
    starts: "",
    minutes: "1,240",
    goals: " ",
  });
  assert.equal(record.appearances, 0);
  assert.equal(record.starts, null);
  assert.equal(record.minutes, 1240);
  assert.equal(record.goals, null);
});

test("manual CSV parses quoted fields and maps common headers", () => {
  const result = parseManualSeasonCsv(
    "Season,Club,Competition,Country,Apps,Starts,Minutes,Goals,Assists,Source,URL\n" +
      '2025/26,"Club, United",A-League,Australia,21,18,1640,,4,Wyscout,https://example.com/source',
  );
  assert.equal(result.records[0].club_name, "Club, United");
  assert.equal(result.records[0].appearances, 21);
  assert.equal(result.records[0].goals, null);
  assert.equal(result.records[0].assists, 4);
});

test("manual JSON supports seasons wrapper without inventing values", () => {
  const records = parseManualSeasonJson(
    JSON.stringify({
      seasons: [
        { season_label: "2024", club_name: "North", goals: 0, assists: null },
      ],
    }),
  );
  assert.equal(records[0].goals, 0);
  assert.equal(records[0].assists, null);
});

test("evidence preview exposes conflicts and unchanged facts", () => {
  const incoming = normaliseSeasonRecord({
    season_label: "2025",
    club_name: "Club B",
    minutes: 500,
  });
  const preview = buildEvidencePreview(
    normaliseSeasonRecord({
      season_label: "2025",
      club_name: "Club A",
      minutes: 500,
    }),
    incoming,
  );
  assert.equal(
    preview.find((item) => item.field === "club_name")?.conflict,
    true,
  );
  assert.equal(
    preview.find((item) => item.field === "minutes")?.reviewState,
    "unchanged",
  );
});

test("freshness uses category-specific deterministic windows", () => {
  const now = new Date("2026-08-28T00:00:00Z").getTime();
  assert.equal(
    evidenceFreshness("recent_match", "2026-08-25T00:00:00Z", now).state,
    "Fresh",
  );
  assert.equal(
    evidenceFreshness("recent_match", "2026-08-01T00:00:00Z", now).state,
    "Stale",
  );
  assert.equal(
    evidenceFreshness("historical_career", "2018-01-01T00:00:00Z", now).state,
    "Fresh",
  );
  assert.equal(evidenceFreshness("contract", null, now).state, "Unknown");
});

test("Player Score eligibility remains conservative", () => {
  assert.equal(
    playerScoreState({ recentSeniorMinutes: 499, benchmarkScore: 80 }).status,
    "insufficient_minutes",
  );
  assert.equal(
    playerScoreState({ recentSeniorMinutes: 900, benchmarkScore: null }).status,
    "missing_benchmark",
  );
  assert.equal(
    playerScoreState({
      recentSeniorMinutes: 900,
      benchmarkScore: 80,
      benchmarkVerifiedAt: "2026-01-01",
      scoreStale: true,
    }).status,
    "stale",
  );
  assert.equal(
    playerScoreState({
      recentSeniorMinutes: 900,
      benchmarkScore: 80,
      benchmarkVerifiedAt: "2026-01-01",
      manualScore: 82,
    }).status,
    "manual_override",
  );
});
