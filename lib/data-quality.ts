const CURRENT_SEASON_MAX_AGE_MS =
  548 * 86_400_000;

export function publishedDossierNeedsCurrentSeason({
  published,
  currentSeasonLabel,
  currentSeasonStart,
  now = new Date(),
}: {
  published: unknown;
  currentSeasonLabel: unknown;
  currentSeasonStart: unknown;
  now?: Date;
}) {
  if (!published) return false;

  if (
    typeof currentSeasonLabel !== 'string' ||
    !currentSeasonLabel.trim()
  ) {
    return true;
  }

  const seasonStart =
    new Date(
      String(
        currentSeasonStart || '',
      ),
    ).getTime();

  return (
    !Number.isFinite(seasonStart) ||
    now.getTime() - seasonStart >
      CURRENT_SEASON_MAX_AGE_MS
  );
}
