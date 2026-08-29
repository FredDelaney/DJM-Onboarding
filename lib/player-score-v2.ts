export type PositionGroup =
  | "GK"
  | "CB"
  | "FB_WB"
  | "DM"
  | "CM"
  | "AM"
  | "W"
  | "ST"
  | "UNKNOWN";

export const PLAYER_SCORE_V2_MODEL = "djm_player_score_v2";

export const CURRENT_SCORE_WEIGHTS = {
  level: 30,
  performance: 30,
  role: 15,
  experience: 10,
  trend: 10,
  availability: 5,
} as const;

export const POSITION_PERFORMANCE_WEIGHTS: Record<
  PositionGroup,
  Partial<Record<PerformanceCategory, number>>
> = {
  GK: { goalkeeping: 65, possession: 15, progression: 10, aerial: 10 },
  CB: { defending: 35, aerial: 20, progression: 20, possession: 15, physical: 10 },
  FB_WB: { defending: 25, progression: 20, creativity: 20, attacking: 10, possession: 10, physical: 15 },
  DM: { defending: 25, possession: 25, progression: 25, creativity: 10, physical: 10, aerial: 5 },
  CM: { possession: 25, progression: 25, creativity: 20, defending: 15, attacking: 5, physical: 10 },
  AM: { creativity: 30, attacking: 25, progression: 20, possession: 10, physical: 10, defending: 5 },
  W: { attacking: 30, creativity: 25, progression: 25, physical: 10, possession: 5, defending: 5 },
  ST: { attacking: 45, creativity: 15, aerial: 15, physical: 15, possession: 5, progression: 5 },
  UNKNOWN: {},
};

export type PerformanceCategory =
  | "attacking"
  | "creativity"
  | "progression"
  | "possession"
  | "defending"
  | "aerial"
  | "goalkeeping"
  | "physical"
  | "discipline";

export const normalisePositionGroup = (position?: string | null): PositionGroup => {
  const value = String(position || "").trim().toUpperCase().replace(/[.\s-]+/g, "_");
  if (/^(GK|GOALKEEPER)$/.test(value)) return "GK";
  if (/^(CB|LCB|RCB|CENTRE_BACK|CENTER_BACK)$/.test(value)) return "CB";
  if (/^(LB|RB|LWB|RWB|WB|FULL_BACK|FULLBACK|WING_BACK|WINGBACK)$/.test(value)) return "FB_WB";
  if (/^(DM|CDM|6|DEFENSIVE_MIDFIELDER)$/.test(value)) return "DM";
  if (/^(CM|8|CENTRAL_MIDFIELDER)$/.test(value)) return "CM";
  if (/^(AM|CAM|10|ATTACKING_MIDFIELDER)$/.test(value)) return "AM";
  if (/^(LW|RW|LM|RM|W|WINGER)$/.test(value)) return "W";
  if (/^(ST|CF|9|STRIKER|CENTRE_FORWARD|CENTER_FORWARD|FORWARD)$/.test(value)) return "ST";
  return "UNKNOWN";
};

export const currentEvidenceWeight = (ageDays: number) => {
  if (!Number.isFinite(ageDays) || ageDays < 0) return 0;
  if (ageDays <= 180) return 1;
  if (ageDays <= 365) return 0.85;
  if (ageDays <= 548) return 0.65;
  if (ageDays <= 730) return 0.45;
  return 0;
};

export const experienceEvidenceWeight = (ageDays: number) => {
  if (!Number.isFinite(ageDays) || ageDays < 0) return 0;
  if (ageDays <= 730) return 1;
  if (ageDays <= 1460) return 0.65;
  if (ageDays <= 2190) return 0.35;
  return 0.15;
};

export const scorePositionPerformance = ({
  positionGroup,
  overallPercentile,
  categories,
}: {
  positionGroup: PositionGroup;
  overallPercentile?: number | null;
  categories: Partial<Record<PerformanceCategory, number | null>>;
}) => {
  if (overallPercentile != null && Number.isFinite(overallPercentile)) {
    return clamp(overallPercentile);
  }
  const weights = POSITION_PERFORMANCE_WEIGHTS[positionGroup];
  let weighted = 0;
  let availableWeight = 0;
  for (const [key, weight] of Object.entries(weights) as Array<[PerformanceCategory, number]>) {
    const value = categories[key];
    if (value == null || !Number.isFinite(value)) continue;
    weighted += clamp(value) * weight;
    availableWeight += weight;
  }
  if (availableWeight < 50) return null;
  return weighted / availableWeight;
};

const AGE_PEAK_END: Record<PositionGroup, number> = {
  GK: 32,
  CB: 31,
  FB_WB: 29,
  DM: 30,
  CM: 30,
  AM: 29,
  W: 28,
  ST: 29,
  UNKNOWN: 29,
};

const AGE_DECLINE_STEP: Record<PositionGroup, number> = {
  GK: 0.9,
  CB: 1.1,
  FB_WB: 1.5,
  DM: 1.25,
  CM: 1.25,
  AM: 1.4,
  W: 1.6,
  ST: 1.45,
  UNKNOWN: 1.35,
};

export const agePerformanceAdjustment = ({
  age,
  positionGroup,
  performanceScore,
}: {
  age?: number | null;
  positionGroup: PositionGroup;
  performanceScore?: number | null;
}) => {
  if (age == null || !Number.isFinite(age)) return 0;
  const yearsPastPeak = Math.max(0, age - AGE_PEAK_END[positionGroup]);
  if (!yearsPastPeak) return 0;
  let factor = 1;
  if (performanceScore != null && performanceScore >= 75) factor = 0.35;
  else if (performanceScore != null && performanceScore >= 60) factor = 0.55;
  else if (performanceScore != null && performanceScore >= 45) factor = 0.75;
  return -Math.min(6, yearsPastPeak * AGE_DECLINE_STEP[positionGroup] * factor);
};

const POTENTIAL_PEAK_START: Record<PositionGroup, number> = {
  GK: 27,
  CB: 26,
  FB_WB: 24,
  DM: 25,
  CM: 25,
  AM: 24,
  W: 23,
  ST: 24,
  UNKNOWN: 24,
};

export const potentialAgeAdjustment = (age: number | null | undefined, positionGroup: PositionGroup) => {
  if (age == null || !Number.isFinite(age)) return null;
  const peakStart = POTENTIAL_PEAK_START[positionGroup];
  const peakEnd = AGE_PEAK_END[positionGroup];
  if (age < peakStart) return Math.min(12, 2 + (peakStart - age) * 2);
  if (age <= peakEnd) return 0;
  return -Math.min(18, (age - peakEnd) * 2);
};

export type PlayerScoreInputs = {
  level: number | null;
  performance: number | null;
  role: number | null;
  experience: number | null;
  trend: number | null;
  availability: number | null;
  age: number | null;
  positionGroup: PositionGroup;
};

export const calculatePlayerScoreV2 = (inputs: PlayerScoreInputs) => {
  if (inputs.level == null) return { status: "benchmark_required" as const, score: null, coverage: 0, ageAdjustment: 0 };
  if (inputs.role == null) return { status: "not_enough_playing_time_data" as const, score: null, coverage: 0, ageAdjustment: 0 };
  if (inputs.performance == null) {
    const coverage = CURRENT_SCORE_WEIGHTS.level + CURRENT_SCORE_WEIGHTS.role + (inputs.experience != null ? CURRENT_SCORE_WEIGHTS.experience : 0) + (inputs.trend != null ? CURRENT_SCORE_WEIGHTS.trend : 0) + (inputs.availability != null ? CURRENT_SCORE_WEIGHTS.availability : 0);
    return { status: "performance_data_required" as const, score: null, coverage, ageAdjustment: 0 };
  }

  const components: Array<[keyof typeof CURRENT_SCORE_WEIGHTS, number | null]> = [
    ["level", inputs.level],
    ["performance", inputs.performance],
    ["role", inputs.role],
    ["experience", inputs.experience],
    ["trend", inputs.trend],
    ["availability", inputs.availability],
  ];
  let weighted = 0;
  let coverage = 0;
  for (const [key, value] of components) {
    if (value == null) continue;
    const weight = CURRENT_SCORE_WEIGHTS[key];
    weighted += clamp(value) * weight;
    coverage += weight;
  }
  if (coverage < 75) return { status: "not_enough_model_coverage" as const, score: null, coverage, ageAdjustment: 0 };
  const core = weighted / coverage;
  const ageAdjustment = agePerformanceAdjustment({
    age: inputs.age,
    positionGroup: inputs.positionGroup,
    performanceScore: inputs.performance,
  });
  return {
    status: "calculated" as const,
    score: Math.round(clamp(core + ageAdjustment)),
    coreScore: Math.round(clamp(core)),
    coverage,
    ageAdjustment,
  };
};

export const calculatePotentialV2 = ({
  currentScore,
  age,
  positionGroup,
  trendScore,
}: {
  currentScore: number | null;
  age: number | null;
  positionGroup: PositionGroup;
  trendScore: number | null;
}) => {
  if (currentScore == null) return null;
  const ageAdjustment = potentialAgeAdjustment(age, positionGroup);
  if (ageAdjustment == null) return null;
  const trendAdjustment = trendScore == null ? 0 : Math.max(-6, Math.min(6, (trendScore - 50) * 0.12));
  return Math.round(clamp(currentScore + ageAdjustment + trendAdjustment));
};

export const dataConfidence = ({
  coverage,
  recentMinutes,
  benchmarkFreshness,
  performanceConfidence,
  playerVerified,
}: {
  coverage: number;
  recentMinutes: number;
  benchmarkFreshness: "fresh" | "aging" | "stale" | "unknown";
  performanceConfidence: number | null;
  playerVerified: boolean;
}) => {
  const coveragePart = clamp(coverage) * 0.5;
  const minutesPart = Math.min(20, Math.max(0, recentMinutes) / 1800 * 20);
  const benchmarkPart = benchmarkFreshness === "fresh" ? 10 : benchmarkFreshness === "aging" ? 7 : benchmarkFreshness === "stale" ? 3 : 0;
  const performancePart = performanceConfidence == null ? 0 : clamp(performanceConfidence <= 1 ? performanceConfidence * 100 : performanceConfidence) * 0.15;
  const verificationPart = playerVerified ? 5 : 0;
  return Math.round(clamp(coveragePart + minutesPart + benchmarkPart + performancePart + verificationPart));
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));
