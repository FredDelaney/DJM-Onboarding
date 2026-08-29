import assert from "node:assert/strict";
import test from "node:test";

import {
  evidenceDateWithinMonths,
  inferSeasonEvidenceDate,
  normaliseBenchmarkRecord,
  parseBenchmarkCsv,
  parseBenchmarkJson,
} from "../lib/benchmark-data.ts";

test("benchmark CSV preserves raw decimals and rounds only the effective score", () => {
  const rows = parseBenchmarkCsv(
    "Competition,Country,Strength,Aliases,Tier,Note\nExample League,Example,78.8,Example L;EL,1,Reviewed league average",
  );
  assert.equal(rows[0].raw_strength_value, 78.8);
  assert.equal(rows[0].strength_score, 79);
  assert.deepEqual(rows[0].aliases, ["Example L", "EL"]);
});

test("blank optional benchmark fields stay null rather than becoming zero", () => {
  const rows = parseBenchmarkCsv(
    "Competition,Country,Strength,Tier,Note\nExample League,,0,,",
  );
  assert.equal(rows[0].country, null);
  assert.equal(rows[0].level_tier, null);
  assert.equal(rows[0].note, null);
  assert.equal(rows[0].raw_strength_value, 0);
  assert.equal(rows[0].strength_score, 0);
});

test("benchmark parser rejects missing and out-of-range strength", () => {
  assert.throws(
    () => normaliseBenchmarkRecord({ competition: "Example League", strength: "" }),
    /Strength is required/,
  );
  assert.throws(
    () => normaliseBenchmarkRecord({ competition: "Example League", strength: 101 }),
    /between 0 and 100/,
  );
});

test("benchmark JSON supports a benchmarks wrapper", () => {
  const rows = parseBenchmarkJson(
    JSON.stringify({
      benchmarks: [
        { competition: "Example League", country: "Example", raw_strength_value: 64.2 },
      ],
    }),
  );
  assert.equal(rows[0].raw_strength_value, 64.2);
  assert.equal(rows[0].strength_score, 64);
});

test("season evidence dates are inferred from football season labels", () => {
  assert.equal(inferSeasonEvidenceDate("2025/26"), "2026-06-30");
  assert.equal(inferSeasonEvidenceDate("25/26"), "2026-06-30");
  assert.equal(inferSeasonEvidenceDate("2026"), "2026-12-31");
  assert.equal(inferSeasonEvidenceDate("unknown"), null);
});

test("old undated seasons do not become recent merely because they were reviewed today", () => {
  assert.equal(evidenceDateWithinMonths("21/22", "2026-08-29", 24), false);
  assert.equal(evidenceDateWithinMonths("2025/26", "2026-08-29", 24), true);
});
