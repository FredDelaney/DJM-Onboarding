export const FOOTBALL_PROVIDER_CAPABILITIES = [
  "licensed_api",
  "manual_import",
  "reference_only",
  "disabled",
] as const;

export type FootballProviderCapability =
  (typeof FOOTBALL_PROVIDER_CAPABILITIES)[number];

export const FOOTBALL_PROVIDER_POLICY = {
  wyscout: {
    capability: "disabled",
    configuredLabel: "Licensed API",
    unavailableLabel: "API not configured",
  },
  manual: {
    capability: "manual_import",
    configuredLabel: "CSV or JSON import",
    unavailableLabel: "Manual import available",
  },
  transfermarkt: {
    capability: "reference_only",
    configuredLabel: "Reference only",
    unavailableLabel: "Reference only",
  },
  sofascore: {
    capability: "disabled",
    configuredLabel: "Disabled",
    unavailableLabel: "No licensed integration configured",
  },
} satisfies Record<
  string,
  {
    capability: FootballProviderCapability;
    configuredLabel: string;
    unavailableLabel: string;
  }
>;

export const SEASON_FIELDS = [
  "season_label",
  "club_name",
  "league",
  "country",
  "appearances",
  "starts",
  "minutes",
  "goals",
  "assists",
  "source_name",
  "source_url",
] as const;

export type SeasonField = (typeof SEASON_FIELDS)[number];

export type NormalisedSeasonRecord = {
  season_label: string | null;
  club_name: string | null;
  league: string | null;
  country: string | null;
  appearances: number | null;
  starts: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  source_name: string | null;
  source_url: string | null;
};

export type EvidencePreview = {
  field: SeasonField;
  currentValue: string | number | null;
  incomingValue: string | number | null;
  conflict: boolean;
  reviewState: "pending" | "unchanged";
};

const HEADER_ALIASES: Record<string, SeasonField> = {
  season: "season_label",
  seasonlabel: "season_label",
  season_label: "season_label",
  club: "club_name",
  team: "club_name",
  clubname: "club_name",
  club_name: "club_name",
  competition: "league",
  league: "league",
  country: "country",
  apps: "appearances",
  matches: "appearances",
  appearances: "appearances",
  starts: "starts",
  minutes: "minutes",
  mins: "minutes",
  goals: "goals",
  assists: "assists",
  source: "source_name",
  sourcename: "source_name",
  source_name: "source_name",
  sourceurl: "source_url",
  source_url: "source_url",
  url: "source_url",
};

const normaliseHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "");

const nullableText = (value: unknown) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
};

export const nullableWholeNumber = (value: unknown) => {
  const text = nullableText(value);
  if (text == null) return null;
  const parsed = Number(text.replaceAll(",", ""));
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `Expected a whole number of 0 or more, received "${text}".`,
    );
  }
  return parsed;
};

export const parseCsvRows = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];

    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unclosed quoted value.");
  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
};

export const mapSeasonHeaders = (headers: string[]) =>
  headers.map((header) => HEADER_ALIASES[normaliseHeader(header)] || null);

export const normaliseSeasonRecord = (
  input: Partial<Record<SeasonField, unknown>>,
): NormalisedSeasonRecord => ({
  season_label: nullableText(input.season_label),
  club_name: nullableText(input.club_name),
  league: nullableText(input.league),
  country: nullableText(input.country),
  appearances: nullableWholeNumber(input.appearances),
  starts: nullableWholeNumber(input.starts),
  minutes: nullableWholeNumber(input.minutes),
  goals: nullableWholeNumber(input.goals),
  assists: nullableWholeNumber(input.assists),
  source_name: nullableText(input.source_name),
  source_url: nullableText(input.source_url),
});

export const parseManualSeasonCsv = (input: string) => {
  const rows = parseCsvRows(input.replace(/^\uFEFF/, ""));
  if (rows.length < 2)
    throw new Error("Add a header row and at least one season row.");

  const mapping = mapSeasonHeaders(rows[0]);
  if (!mapping.includes("season_label") || !mapping.includes("club_name")) {
    throw new Error("CSV must include season and club columns.");
  }

  const records = rows.slice(1).map((row, rowIndex) => {
    const source: Partial<Record<SeasonField, unknown>> = {};
    mapping.forEach((field, columnIndex) => {
      if (field) source[field] = row[columnIndex] ?? "";
    });
    try {
      return normaliseSeasonRecord(source);
    } catch (error) {
      throw new Error(
        `Row ${rowIndex + 2}: ${error instanceof Error ? error.message : "Invalid value."}`,
      );
    }
  });

  return { mapping, records };
};

export const parseManualSeasonJson = (input: string) => {
  const parsed = JSON.parse(input);
  const rows = Array.isArray(parsed) ? parsed : parsed?.seasons;
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error(
      "JSON must be an array of season records or an object with a seasons array.",
    );
  }
  return rows.map((row) => normaliseSeasonRecord(row));
};

export const buildEvidencePreview = (
  current: Partial<NormalisedSeasonRecord> | null,
  incoming: NormalisedSeasonRecord,
): EvidencePreview[] =>
  SEASON_FIELDS.map((field) => {
    const currentValue = current?.[field] ?? null;
    const incomingValue = incoming[field];
    const unchanged = currentValue === incomingValue;
    return {
      field,
      currentValue,
      incomingValue,
      conflict: currentValue != null && incomingValue != null && !unchanged,
      reviewState: unchanged ? ("unchanged" as const) : ("pending" as const),
    };
  }).filter((item) => item.currentValue != null || item.incomingValue != null);

export type FreshnessCategory =
  | "recent_match"
  | "current_club"
  | "contract"
  | "league_benchmark"
  | "historical_career"
  | "passport";

const FRESHNESS_DAYS: Record<FreshnessCategory, number | null> = {
  recent_match: 14,
  current_club: 45,
  contract: 90,
  league_benchmark: 365,
  historical_career: null,
  passport: null,
};

export const evidenceFreshness = (
  category: FreshnessCategory,
  observedAt?: string | null,
  referenceTimeMs = Date.now(),
): {
  state: "Fresh" | "Aging" | "Stale" | "Unknown";
  ageDays: number | null;
} => {
  if (!observedAt) return { state: "Unknown", ageDays: null };
  const observed = new Date(observedAt);
  if (Number.isNaN(observed.getTime()))
    return { state: "Unknown", ageDays: null };
  const ageDays = Math.max(
    0,
    Math.floor((referenceTimeMs - observed.getTime()) / 86_400_000),
  );
  const cadence = FRESHNESS_DAYS[category];
  if (cadence == null) return { state: "Fresh", ageDays };
  if (ageDays <= cadence * 0.65) return { state: "Fresh", ageDays };
  if (ageDays <= cadence) return { state: "Aging", ageDays };
  return { state: "Stale", ageDays };
};

export const playerScoreState = ({
  recentSeniorMinutes,
  benchmarkScore,
  benchmarkVerifiedAt,
  scoreStale = false,
  manualScore = null,
}: {
  recentSeniorMinutes: number | null;
  benchmarkScore: number | null;
  benchmarkVerifiedAt?: string | null;
  scoreStale?: boolean;
  manualScore?: number | null;
}) => {
  if (recentSeniorMinutes == null || recentSeniorMinutes < 500) {
    return {
      status: "insufficient_minutes",
      label: "Not enough playing-time data",
      eligible: false,
    };
  }
  if (benchmarkScore == null || !benchmarkVerifiedAt) {
    return {
      status: "missing_benchmark",
      label: "Not enough benchmark data",
      eligible: false,
    };
  }
  if (scoreStale) {
    return { status: "stale", label: "Needs recalculation", eligible: true };
  }
  if (manualScore != null) {
    return {
      status: "manual_override",
      label: "Manually overridden",
      eligible: true,
    };
  }
  return { status: "ready", label: "Ready to calculate", eligible: true };
};
