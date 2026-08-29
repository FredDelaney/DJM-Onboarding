export const OPTA_LEAGUE_BENCHMARK_REFERENCE_URL =
  "https://theanalyst.com/articles/strongest-football-leagues-in-the-world-opta-power-rankings";

export const OPTA_LEAGUE_BENCHMARK_METHOD =
  "Use the league-average Opta Power Rating across active clubs on the provider 0-100 scale. Do not substitute the top-five or top-ten average.";

export type BenchmarkImportRecord = {
  competition: string;
  country: string | null;
  raw_strength_value: number;
  strength_score: number;
  aliases: string[];
  level_tier: number | null;
  gender: string | null;
  note: string | null;
};

const HEADER_ALIASES: Record<string, keyof BenchmarkImportRecord | "strength"> = {
  competition: "competition",
  league: "competition",
  competitionname: "competition",
  leaguename: "competition",
  country: "country",
  strength: "strength",
  score: "strength",
  rating: "strength",
  power: "strength",
  powerrating: "strength",
  leaguestrength: "strength",
  aliases: "aliases",
  alias: "aliases",
  tier: "level_tier",
  level: "level_tier",
  leveltier: "level_tier",
  gender: "gender",
  note: "note",
  notes: "note",
  sourcenote: "note",
};

const normaliseHeader = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

const textOrNull = (value: unknown) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
};

const strength = (value: unknown) => {
  const text = textOrNull(value);
  if (text == null) throw new Error("Strength is required.");
  const parsed = Number(text.replaceAll(",", ""));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`Strength must be between 0 and 100, received "${text}".`);
  }
  return parsed;
};

const levelTier = (value: unknown) => {
  const text = textOrNull(value);
  if (text == null) return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Tier must be a whole number of 1 or more, received "${text}".`);
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

export const normaliseBenchmarkRecord = (
  input: Record<string, unknown>,
): BenchmarkImportRecord => {
  const competition = textOrNull(input.competition);
  if (!competition) throw new Error("Competition is required.");
  const raw = strength(input.raw_strength_value ?? input.strength_score ?? input.strength);
  const aliases = Array.isArray(input.aliases)
    ? input.aliases.map((item) => String(item).trim()).filter(Boolean)
    : String(input.aliases || "")
        .split(/[|;]/)
        .map((item) => item.trim())
        .filter(Boolean);

  return {
    competition,
    country: textOrNull(input.country),
    raw_strength_value: raw,
    strength_score: Math.round(raw),
    aliases,
    level_tier: levelTier(input.level_tier),
    gender: textOrNull(input.gender) || "male",
    note: textOrNull(input.note),
  };
};

export const parseBenchmarkCsv = (input: string) => {
  const rows = parseCsvRows(input.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("Add a header row and at least one benchmark row.");

  const mapping = rows[0].map((header) => HEADER_ALIASES[normaliseHeader(header)] || null);
  if (!mapping.includes("competition") || !mapping.includes("strength")) {
    throw new Error("CSV must include Competition and Strength columns.");
  }

  return rows.slice(1).map((row, rowIndex) => {
    const source: Record<string, unknown> = {};
    mapping.forEach((field, columnIndex) => {
      if (!field) return;
      if (field === "strength") source.strength = row[columnIndex] ?? "";
      else source[field] = row[columnIndex] ?? "";
    });
    try {
      return normaliseBenchmarkRecord(source);
    } catch (error) {
      throw new Error(
        `Row ${rowIndex + 2}: ${error instanceof Error ? error.message : "Invalid benchmark row."}`,
      );
    }
  });
};

export const parseBenchmarkJson = (input: string) => {
  const parsed = JSON.parse(input);
  const rows = Array.isArray(parsed) ? parsed : parsed?.benchmarks;
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("JSON must be an array or an object with a benchmarks array.");
  }
  return rows.map((row) => normaliseBenchmarkRecord(row));
};

export const inferSeasonEvidenceDate = (seasonLabel?: string | null) => {
  const value = String(seasonLabel || "").trim();
  let match = value.match(/^((?:19|20)\d{2})\s*[/-]\s*(\d{2}|(?:19|20)\d{2})$/);
  if (match) {
    const start = Number(match[1]);
    let end = match[2].length === 2 ? Math.floor(start / 100) * 100 + Number(match[2]) : Number(match[2]);
    if (end < start) end += 100;
    return `${end}-06-30`;
  }

  match = value.match(/^(\d{2})\s*[/-]\s*(\d{2})$/);
  if (match) {
    const first = Number(match[1]);
    const start = (first <= 50 ? 2000 : 1900) + first;
    let end = Math.floor(start / 100) * 100 + Number(match[2]);
    if (end < start) end += 100;
    return `${end}-06-30`;
  }

  if (/^(19|20)\d{2}$/.test(value)) return `${value}-12-31`;
  return null;
};

export const evidenceDateWithinMonths = (
  seasonLabel: string | null | undefined,
  referenceDate: string,
  months: number,
) => {
  const inferred = inferSeasonEvidenceDate(seasonLabel);
  if (!inferred) return false;
  const evidence = new Date(`${inferred}T00:00:00Z`);
  const reference = new Date(`${referenceDate}T00:00:00Z`);
  if (Number.isNaN(evidence.getTime()) || Number.isNaN(reference.getTime())) return false;
  const threshold = new Date(reference);
  threshold.setUTCMonth(threshold.getUTCMonth() - months);
  return evidence.getTime() >= threshold.getTime();
};
