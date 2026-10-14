// This module selects recorded evidence for a profile draft. It does not write player data
// or treat a model's proposed number as evidence. Callers must load rows for one tenant.
import { matchesCurrentSeasonContext } from "./football-data/player-data-workflow.ts";

export type PlayerProfileStatField =
  | "appearances"
  | "starts"
  | "minutes"
  | "goals"
  | "assists";

export type PlayerProfileCareerRow = {
  id: string;
  season_label?: string | null;
  club_name?: string | null;
  league?: string | null;
  appearances?: number | null;
  starts?: number | null;
  minutes?: number | null;
  goals?: number | null;
  assists?: number | null;
  source_provider?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  source_reviewed_at?: string | null;
  source_synced_at?: string | null;
};

export type PlayerProfileVideoRow = {
  id: string;
  title?: string | null;
  url?: string | null;
  featured?: boolean | null;
};

export type PlayerProfileEvidenceInput = {
  player: {
    primary_position?: string | null;
    current_club?: string | null;
    current_league?: string | null;
    current_season_label?: string | null;
    transfermarkt_url?: string | null;
  };
  career: PlayerProfileCareerRow[];
  videos?: PlayerProfileVideoRow[];
  now?: string;
};

export type PlayerProfilePositionGroup =
  | "goalkeeper"
  | "centre_back"
  | "full_back"
  | "defensive_midfield"
  | "central_midfield"
  | "attacking_midfield"
  | "winger"
  | "striker"
  | "other";

export type PlayerProfileStatCandidate = {
  ref: string;
  careerEntryId: string;
  field: PlayerProfileStatField;
  label: string;
  value: number;
  seasonLabel: string;
  competition: string | null;
  club: string | null;
  seasonScope: "current" | "previous" | "recent";
  source: {
    provenance: "verified" | "manual";
    provider: string | null;
    name: string | null;
    url: string | null;
    reviewedAt: string | null;
    syncedAt: string | null;
  };
};

export type PlayerProfileReviewSuggestion = {
  code:
    | "missing_position"
    | "missing_current_season"
    | "missing_current_stats"
    | "stale_current_stats"
    | "missing_video"
    | "feature_video"
    | "missing_transfermarkt"
    | "invalid_featured_stat"
    | "new_player_data"
    | "stronger_stat_available"
    | "long_introduction";
  message: string;
};

export type PlayerProfileReviewInput = PlayerProfileEvidenceInput & {
  draft?: {
    featuredStatRefs?: string[];
    primaryVideoId?: string | null;
    introLine?: string | null;
  };
};

const statLabels: Record<PlayerProfileStatField, string> = {
  appearances: "Appearances",
  starts: "Starts",
  minutes: "Minutes",
  goals: "Goals",
  assists: "Assists",
};

const statOrder: Record<PlayerProfilePositionGroup, PlayerProfileStatField[]> = {
  goalkeeper: ["starts", "minutes", "appearances"],
  centre_back: ["starts", "minutes", "appearances", "goals", "assists"],
  full_back: ["starts", "assists", "minutes", "appearances", "goals"],
  defensive_midfield: ["starts", "minutes", "assists", "appearances", "goals"],
  central_midfield: ["starts", "assists", "minutes", "goals", "appearances"],
  attacking_midfield: ["assists", "goals", "starts", "minutes", "appearances"],
  winger: ["goals", "assists", "starts", "minutes", "appearances"],
  striker: ["goals", "starts", "assists", "minutes", "appearances"],
  other: ["appearances", "starts", "minutes", "goals", "assists"],
};

const connectedProviders = new Set([
  "wyscout",
  "sportmonks",
  "api_football",
  "thesportsdb",
  "public_web_verified",
]);

const clean = (value: unknown) => String(value ?? "").trim();
const normalise = (value: unknown) => clean(value).toLowerCase().normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const dateStamp = (value: unknown) => {
  const stamp = Date.parse(clean(value));
  return Number.isFinite(stamp) ? stamp : null;
};
const safeUrl = (value: unknown) => {
  try {
    const url = new URL(clean(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
};
const validTransfermarktUrl = (value: unknown) => {
  const valueUrl = safeUrl(value);
  if (!valueUrl) return false;
  const url = new URL(valueUrl);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return (host === "transfermarkt.com" || host.endsWith(".transfermarkt.com")) &&
    /\/profil\/spieler\/\d+\/?$/i.test(url.pathname);
};
const seasonYear = (value: unknown) => {
  const match = /(?:^|\D)(20\d{2})(?:\D|$)/.exec(clean(value));
  return match ? Number(match[1]) : null;
};

export function playerProfilePositionGroup(position: string | null | undefined): PlayerProfilePositionGroup {
  const value = normalise(position);
  if (/^(gk|goalkeeper|goal keeper|keeper)$/.test(value)) return "goalkeeper";
  if (/^(cb|centre back|center back|central defender|centre half|center half)$/.test(value)) return "centre_back";
  if (/^(rb|lb|rwb|lwb|full back|fullback|wing back|wingback|right back|left back)$/.test(value)) return "full_back";
  if (/^(dm|cdm|defensive midfielder|holding midfielder)$/.test(value)) return "defensive_midfield";
  if (/^(cm|central midfielder|centre midfielder|center midfielder|midfielder)$/.test(value)) return "central_midfield";
  if (/^(am|cam|attacking midfielder|number 10)$/.test(value)) return "attacking_midfield";
  if (/^(rw|lw|winger|right winger|left winger|wide forward)$/.test(value)) return "winger";
  if (/^(st|cf|striker|centre forward|center forward|forward)$/.test(value)) return "striker";
  return "other";
}

function sourceFor(row: PlayerProfileCareerRow): PlayerProfileStatCandidate["source"] | null {
  const reviewedAt = dateStamp(row.source_reviewed_at) === null ? null : clean(row.source_reviewed_at);
  const syncedAt = dateStamp(row.source_synced_at) === null ? null : clean(row.source_synced_at);
  const provider = clean(row.source_provider).toLowerCase().replace(/[^a-z0-9]+/g, "_") || null;
  const url = safeUrl(row.source_url);
  // Public-web AI extraction is not an approved fact until an operator reviews it.
  const connected = Boolean(provider && connectedProviders.has(provider) && syncedAt && url);
  if (!reviewedAt && !connected) return null;
  return {
    provenance: connected || (reviewedAt && url && provider !== "manual") ? "verified" : "manual",
    provider,
    name: clean(row.source_name) || null,
    url,
    reviewedAt,
    syncedAt,
  };
}

type PreparedCore = {
  positionGroup: PlayerProfilePositionGroup;
  statCandidates: PlayerProfileStatCandidate[];
  featuredStats: PlayerProfileStatCandidate[];
  videoCandidates: { id: string; title: string; url: string }[];
  featuredVideoId: string | null;
};

function prepareCore(input: PlayerProfileEvidenceInput): PreparedCore {
  const positionGroup = playerProfilePositionGroup(input.player.primary_position);
  const currentSeason = normalise(input.player.current_season_label);
  const currentYear = seasonYear(input.player.current_season_label);
  const eligible = (input.career || []).filter((row) => clean(row.id) && clean(row.season_label) && sourceFor(row));
  const mostRecentYear = Math.max(0, ...eligible.map((row) => seasonYear(row.season_label) || 0));
  const effectiveYear = currentYear || mostRecentYear || null;
  const previousYear = effectiveYear ? effectiveYear - 1 : null;
  const currentClub = normalise(input.player.current_club);
  const fields = statOrder[positionGroup];
  const statCandidates: PlayerProfileStatCandidate[] = [];

  for (const row of eligible) {
    const rowYear = seasonYear(row.season_label);
    const isCurrent = currentSeason
      ? normalise(row.season_label) === currentSeason
      : Boolean(effectiveYear && rowYear === effectiveYear);
    const isPrevious = Boolean(previousYear && rowYear === previousYear);
    if (!isCurrent && !isPrevious) continue;
    if (isCurrent && currentClub) {
      const trackedContext = Boolean(currentSeason && clean(input.player.current_league));
      if (trackedContext) {
        if (!matchesCurrentSeasonContext(row, input.player)) continue;
      } else if (normalise(row.club_name) !== currentClub) continue;
    }
    const source = sourceFor(row);
    if (!source) continue;
    const seasonScope = isPrevious ? "previous" : currentSeason ? "current" : "recent";
    for (const field of fields) {
      const value = row[field];
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) continue;
      statCandidates.push({
        ref: `${row.id}:${field}`,
        careerEntryId: row.id,
        field,
        label: statLabels[field],
        value,
        seasonLabel: clean(row.season_label),
        competition: clean(row.league) || null,
        club: clean(row.club_name) || null,
        seasonScope,
        source,
      });
    }
  }

  const priority = (candidate: PlayerProfileStatCandidate) =>
    (candidate.seasonScope === "current" ? 0 : candidate.seasonScope === "recent" ? 1 : 2) * 100 +
    fields.indexOf(candidate.field) * 10 -
    (candidate.source.reviewedAt || candidate.source.syncedAt ? 1 : 0);
  statCandidates.sort((a, b) => priority(a) - priority(b) ||
    (dateStamp(b.source.reviewedAt || b.source.syncedAt) || 0) -
    (dateStamp(a.source.reviewedAt || a.source.syncedAt) || 0) ||
    a.ref.localeCompare(b.ref));
  const usedFields = new Set<PlayerProfileStatField>();
  const featuredStats = statCandidates.filter((candidate) => {
    if (usedFields.has(candidate.field) || usedFields.size >= 4) return false;
    usedFields.add(candidate.field);
    return true;
  });
  const videoCandidates = (input.videos || []).flatMap((video) => {
    const url = safeUrl(video.url);
    return clean(video.id) && url ? [{ id: video.id, title: clean(video.title) || "Player video", url }] : [];
  });
  const featuredVideoId = (input.videos || []).find((video) => video.featured &&
    videoCandidates.some((candidate) => candidate.id === video.id))?.id || videoCandidates[0]?.id || null;

  return { positionGroup, statCandidates, featuredStats, videoCandidates, featuredVideoId };
}

export function reviewPlayerProfileEvidence(input: PlayerProfileReviewInput): PlayerProfileReviewSuggestion[] {
  const prepared = prepareCore(input);
  const suggestions: PlayerProfileReviewSuggestion[] = [];
  const add = (code: PlayerProfileReviewSuggestion["code"], message: string) => suggestions.push({ code, message });
  if (!clean(input.player.primary_position)) add("missing_position", "Add the player's primary position.");
  if (!clean(input.player.current_season_label)) add("missing_current_season", "Record the current season before featuring current statistics.");
  if (clean(input.player.current_season_label) && !prepared.statCandidates.some((candidate) => candidate.seasonScope === "current")) {
    add("missing_current_stats", "Add sourced current-season statistics.");
  }

  const now = dateStamp(input.now);
  const current = prepared.statCandidates.filter((candidate) => candidate.seasonScope === "current");
  if (current.length) {
    const latest = Math.max(...current.map((candidate) =>
      dateStamp(candidate.source.reviewedAt || candidate.source.syncedAt) || 0));
    if (latest && now !== null && now - latest > 30 * 86_400_000) {
      add("stale_current_stats", `Current-season statistics were last checked ${Math.floor((now - latest) / 86_400_000)} days ago.`);
    }
  }
  if (!prepared.videoCandidates.length) add("missing_video", "Add highlights video.");
  else if (input.draft && !input.draft.primaryVideoId) add("feature_video", "Feature an existing player video.");
  if (!validTransfermarktUrl(input.player.transfermarkt_url)) add("missing_transfermarkt", "Add Transfermarkt URL.");

  if (input.draft) {
    const selected = input.draft.featuredStatRefs || [];
    const allowed = new Set(prepared.statCandidates.map((candidate) => candidate.ref));
    if (selected.some((ref) => !allowed.has(ref))) {
      add("invalid_featured_stat", "Remove a featured statistic that no longer has eligible source evidence.");
    }
    if (selected.length && prepared.featuredStats.length && !selected.includes(prepared.featuredStats[0].ref)) {
      add("stronger_stat_available", `Consider featuring sourced ${prepared.featuredStats[0].label.toLowerCase()} for this position.`);
    }
    if (clean(input.draft.introLine).length > 220) add("long_introduction", "Shorten the player introduction.");
  }
  return suggestions;
}

export function preparePlayerProfileEvidence(input: PlayerProfileEvidenceInput) {
  return { ...prepareCore(input), suggestions: reviewPlayerProfileEvidence(input) };
}
