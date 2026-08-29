import type { NormalisedSeason } from "./types.ts";

export const textOrNull = (value: unknown) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
};

export const wholeNumberOrNull = (value: unknown) => {
  const text = textOrNull(value);
  if (text == null) return null;
  const parsed = Number(text.replaceAll(",", ""));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

export const normaliseSeason = (
  value: Record<string, any>,
  sourceName: string,
  sourceUrl: string | null,
): NormalisedSeason => ({
  season_label: textOrNull(
    value.season_label ?? value.seasonName ?? value.season?.name,
  ),
  club_name: textOrNull(value.club_name ?? value.teamName ?? value.team?.name),
  league: textOrNull(
    value.league ?? value.competitionName ?? value.competition?.name,
  ),
  country: textOrNull(
    value.country ?? value.competition?.area?.name ?? value.team?.area?.name,
  ),
  appearances: wholeNumberOrNull(value.appearances ?? value.matches),
  starts: wholeNumberOrNull(value.starts ?? value.lineups),
  minutes: wholeNumberOrNull(value.minutes ?? value.minutesPlayed),
  goals: wholeNumberOrNull(value.goals),
  assists: wholeNumberOrNull(value.assists),
  source_name: sourceName,
  source_url: sourceUrl,
  provider_competition_id: textOrNull(
    value.competitionId ?? value.competition?.wyId,
  ),
  provider_season_id: textOrNull(value.seasonId ?? value.season?.wyId),
});
