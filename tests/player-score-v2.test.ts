import assert from "node:assert/strict";
import test from "node:test";

import {
  agePerformanceAdjustment,
  calculatePlayerScoreV2,
  calculatePotentialV2,
  currentEvidenceWeight,
  experienceEvidenceWeight,
  normalisePositionGroup,
  scorePositionPerformance,
} from "../lib/player-score-v2.ts";

test("current evidence decays and drops out after 24 months", () => {
  assert.equal(currentEvidenceWeight(90), 1);
  assert.equal(currentEvidenceWeight(300), 0.85);
  assert.equal(currentEvidenceWeight(500), 0.65);
  assert.equal(currentEvidenceWeight(700), 0.45);
  assert.equal(currentEvidenceWeight(731), 0);
});

test("experience remains useful but old seasons lose most of their weight", () => {
  assert.equal(experienceEvidenceWeight(500), 1);
  assert.equal(experienceEvidenceWeight(1000), 0.65);
  assert.equal(experienceEvidenceWeight(1800), 0.35);
  assert.equal(experienceEvidenceWeight(2600), 0.15);
});

test("position groups are explicit", () => {
  assert.equal(normalisePositionGroup("RW"), "W");
  assert.equal(normalisePositionGroup("CDM"), "DM");
  assert.equal(normalisePositionGroup("RCB"), "CB");
  assert.equal(normalisePositionGroup("Goalkeeper"), "GK");
});

test("position performance uses different evidence baskets", () => {
  const winger = scorePositionPerformance({
    positionGroup: "W",
    categories: { attacking: 90, creativity: 80, progression: 85, defending: 20, physical: 70, possession: 65 },
  });
  const centreBack = scorePositionPerformance({
    positionGroup: "CB",
    categories: { attacking: 90, creativity: 80, progression: 85, defending: 20, physical: 70, possession: 65, aerial: 25 },
  });
  assert.ok(winger != null && centreBack != null);
  assert.ok(winger > centreBack);
});

test("a full Player Score requires real performance evidence", () => {
  const result = calculatePlayerScoreV2({
    level: 74,
    performance: null,
    role: 88,
    experience: 70,
    trend: null,
    availability: null,
    age: 24,
    positionGroup: "W",
  });
  assert.equal(result.status, "performance_data_required");
  assert.equal(result.score, null);
});

test("older players are not blindly punished when recent performance remains elite", () => {
  const strong = agePerformanceAdjustment({ age: 34, positionGroup: "CB", performanceScore: 82 });
  const weak = agePerformanceAdjustment({ age: 34, positionGroup: "CB", performanceScore: 42 });
  assert.ok(strong < 0);
  assert.ok(weak < strong);
});

test("old pedigree cannot dominate the current score", () => {
  const result = calculatePlayerScoreV2({
    level: 76,
    performance: 68,
    role: 72,
    experience: 98,
    trend: 55,
    availability: 80,
    age: 34,
    positionGroup: "W",
  });
  assert.equal(result.status, "calculated");
  assert.ok((result.score || 0) < 80);
});

test("potential rises for young players and falls beyond the positional peak", () => {
  const young = calculatePotentialV2({ currentScore: 72, age: 21, positionGroup: "W", trendScore: 65 });
  const older = calculatePotentialV2({ currentScore: 72, age: 33, positionGroup: "W", trendScore: 65 });
  assert.ok(young != null && older != null);
  assert.ok(young > 72);
  assert.ok(older < 72);
});
