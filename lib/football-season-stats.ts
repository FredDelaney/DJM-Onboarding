export type FootballSeasonStatRow = {
  season_label?: unknown;
  stats_year?: unknown;
  appearances?: unknown;
  starts?: unknown;
  minutes?: unknown;
  goals?: unknown;
  assists?: unknown;
  club_name?: unknown;
  league?: unknown;
};

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const whole = (value: unknown): number | null => {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.max(0, Math.round(parsed));
};

export const normalizeSeasonLabel = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('/', '-')
    .replace(/\s+/g, '');

const hasStats = (row: FootballSeasonStatRow) =>
  [row.appearances, row.starts, row.minutes, row.goals, row.assists].some(
    (value) => numberOrNull(value) !== null,
  );

const seasonRank = (value: unknown) => {
  const label = normalizeSeasonLabel(value);
  const calendar = label.match(/^((?:19|20)\d{2})$/);
  if (calendar) return Number(calendar[1]) * 100 + 99;

  const split = label.match(/^((?:19|20)\d{2})-(\d{2}|\d{4})$/);
  if (split) {
    const start = Number(split[1]);
    const rawEnd = Number(split[2]);
    const end = split[2].length === 2 ? Math.floor(start / 100) * 100 + rawEnd : rawEnd;
    return end * 100 + 50;
  }

  const year = label.match(/(19|20)\d{2}/);
  return year ? Number(year[0]) * 100 : 0;
};

export const headlineSeasonRows = <T extends FootballSeasonStatRow>(
  rows: T[],
  selectedSeason: unknown,
): T[] => {
  const selected = normalizeSeasonLabel(selectedSeason);
  if (!selected) return [];

  const calendarYear = /^(19|20)\d{2}$/.test(selected) ? Number(selected) : null;

  return rows.filter((row) => {
    if (!hasStats(row)) return false;
    if (normalizeSeasonLabel(row.season_label) === selected) return true;
    return calendarYear !== null && whole(row.stats_year) === calendarYear;
  });
};

export const resolveHeadlineSeason = <T extends FootballSeasonStatRow>(
  rows: T[],
  preferredSeason?: unknown,
): string | null => {
  const preferred = String(preferredSeason || '').trim();
  if (preferred && headlineSeasonRows(rows, preferred).length) return preferred;

  const labels = Array.from(
    new Set(
      rows
        .filter(hasStats)
        .map((row) => String(row.season_label || '').trim())
        .filter(Boolean),
    ),
  );

  labels.sort(
    (left, right) =>
      seasonRank(right) - seasonRank(left) ||
      right.localeCompare(left, undefined, { numeric: true, sensitivity: 'base' }),
  );

  return labels[0] || null;
};

export const aggregateFootballStats = (rows: FootballSeasonStatRow[]) => {
  const usable = rows.filter(hasStats);
  const sum = (key: 'appearances' | 'starts' | 'minutes' | 'goals' | 'assists') => {
    const known = usable
      .map((row) => whole(row[key]))
      .filter((value): value is number => value !== null);

    return known.length ? known.reduce((total, value) => total + value, 0) : null;
  };

  const goals = sum('goals');
  const assists = sum('assists');

  return {
    appearances: sum('appearances'),
    starts: sum('starts'),
    minutes: sum('minutes'),
    goals,
    assists,
    contributions:
      goals === null && assists === null ? null : (goals || 0) + (assists || 0),
  };
};

export const distinctFootballValues = (
  rows: FootballSeasonStatRow[],
  key: 'club_name' | 'league',
) =>
  Array.from(
    new Set(
      rows
        .map((row) => String(row[key] || '').trim())
        .filter(Boolean),
    ),
  );
