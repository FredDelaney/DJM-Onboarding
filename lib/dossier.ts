export const dossierList = (
  value: any,
) =>
  Array.isArray(value)
    ? value.filter(Boolean)
    : [];

const numeric = (
  value: any,
): number | null => {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
};

export const dossierNationality = (
  value: any,
) => {
  const values =
    dossierList(value);

  if (values.length) {
    return values.join(' / ');
  }

  return value
    ? String(value)
    : '-';
};

// Contract dates are calendar dates, never local timestamps or inferred terms.
export const dossierContractExpiry = (value: unknown): string | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(date);
};

export const dossierHeadline = (profile: any): string | null => {
  const headline = String(profile?.headline || '').trim();
  const identity = [profile?.primary_position, profile?.current_club].filter(Boolean).join(' · ');
  const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
  return headline && normalise(headline) !== normalise(identity) ? headline : null;
};

export const dossierVerifiedDate = (
  value: any,
) => {
  if (!value) return null;

  try {
    return new Intl.DateTimeFormat(
      'en-GB',
      {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      },
    ).format(
      new Date(value),
    );
  } catch {
    return null;
  }
};

const dossierCareerKey = (
  row: any,
) => {
  const label =
    String(
      row?.season_label ??
      row?.season ??
      '',
    );

  const year =
    label.match(
      /(19|20)\d{2}/,
    );

  if (year) {
    return Number(
      year[0],
    );
  }

  if (row?.start_date) {
    const date =
      new Date(
        row.start_date,
      );

    if (
      !Number.isNaN(
        date.getTime(),
      )
    ) {
      return date.getFullYear();
    }
  }

  return 0;
};

export const dossierCareer = (
  profile: any,
) =>
  dossierList(
    profile?.career_timeline,
  )
    .filter(
      (row: any) =>
        row?.club_name ||
        row?.club ||
        row?.season_label ||
        row?.season,
    )
    .sort(
      (a: any, b: any) =>
        dossierCareerKey(b) -
          dossierCareerKey(a) ||
        Number(
          a?.sort_order || 0,
        ) -
          Number(
            b?.sort_order || 0,
          ),
    );

export const dossierCareerStatLine = (
  row: any,
) => {
  const bits = [
    numeric(row?.appearances) !==
      null
      ? `${numeric(
          row.appearances,
        )} ${numeric(row.appearances) === 1 ? 'app' : 'apps'}`
      : null,

    numeric(row?.starts) !==
      null
      ? `${numeric(
          row.starts,
        )} ${numeric(row.starts) === 1 ? 'start' : 'starts'}`
      : null,

    numeric(row?.minutes) !==
      null
      ? `${numeric(
          row.minutes,
        )!.toLocaleString(
          'en-GB',
        )} ${numeric(row.minutes) === 1 ? 'min' : 'mins'}`
      : null,

    numeric(row?.goals) !==
      null
      ? `${numeric(
          row.goals,
        )} ${numeric(row.goals) === 1 ? 'goal' : 'goals'}`
      : null,

    numeric(row?.assists) !==
      null
      ? `${numeric(
          row.assists,
        )} ${numeric(row.assists) === 1 ? 'assist' : 'assists'}`
      : null,
  ].filter(Boolean);

  return bits.length
    ? bits.join(' · ')
    : 'Sporting record';
};

const positionGroup = (
  position: any,
) => {
  const value =
    String(
      position || '',
    ).toLowerCase();

  if (
    value.includes(
      'goalkeep',
    ) ||
    value === 'gk'
  ) {
    return 'goalkeeper';
  }

  if (
    value.includes(
      'winger',
    ) ||
    value.includes(
      'forward',
    ) ||
    value.includes(
      'striker',
    ) ||
    value.includes(
      'attacking',
    ) ||
    ['rw', 'lw', 'cf', 'st']
      .includes(value)
  ) {
    return 'attacking';
  }

  if (
    value.includes(
      'midfield',
    ) ||
    [
      'cm',
      'dm',
      'am',
      'cdm',
      'cam',
    ].includes(value)
  ) {
    return 'midfield';
  }

  if (
    value.includes(
      'defender',
    ) ||
    value.includes(
      'centre-back',
    ) ||
    value.includes(
      'center-back',
    ) ||
    value.includes(
      'full-back',
    ) ||
    [
      'cb',
      'lb',
      'rb',
      'lcb',
      'rcb',
    ].includes(value)
  ) {
    return 'defensive';
  }

  return 'general';
};

type PositionCoordinate = {
  label: string;
  x: number;
  y: number;
};

export type DossierPositionSpot = PositionCoordinate & {
  primary: boolean;
  sourceLabel: string;
};

const positionCoordinate = (
  position: unknown,
): PositionCoordinate => {
  const raw =
    String(position || '')
      .trim();

  const value = raw
    .toLowerCase()
    .replace(/[._/]+/g, ' ')
    .replace(/\s+/g, ' ');

  const exact: Record<string, PositionCoordinate> = {
    gk: { label: 'GK', x: 50, y: 89 },
    goalkeeper: { label: 'GK', x: 50, y: 89 },
    rb: { label: 'RB', x: 82, y: 73 },
    'right back': { label: 'RB', x: 82, y: 73 },
    rcb: { label: 'RCB', x: 64, y: 73 },
    cb: { label: 'CB', x: 50, y: 73 },
    'centre back': { label: 'CB', x: 50, y: 73 },
    'center back': { label: 'CB', x: 50, y: 73 },
    lcb: { label: 'LCB', x: 36, y: 73 },
    lb: { label: 'LB', x: 18, y: 73 },
    'left back': { label: 'LB', x: 18, y: 73 },
    rwb: { label: 'RWB', x: 86, y: 59 },
    'right wing back': { label: 'RWB', x: 86, y: 59 },
    lwb: { label: 'LWB', x: 14, y: 59 },
    'left wing back': { label: 'LWB', x: 14, y: 59 },
    cdm: { label: 'DM', x: 50, y: 59 },
    dm: { label: 'DM', x: 50, y: 59 },
    'defensive midfielder': { label: 'DM', x: 50, y: 59 },
    'defensive midfield': { label: 'DM', x: 50, y: 59 },
    rcm: { label: 'RCM', x: 66, y: 46 },
    cm: { label: 'CM', x: 50, y: 46 },
    'central midfielder': { label: 'CM', x: 50, y: 46 },
    'central midfield': { label: 'CM', x: 50, y: 46 },
    lcm: { label: 'LCM', x: 34, y: 46 },
    cam: { label: 'AM', x: 50, y: 34 },
    am: { label: 'AM', x: 50, y: 34 },
    'attacking midfielder': { label: 'AM', x: 50, y: 34 },
    'attacking midfield': { label: 'AM', x: 50, y: 34 },
    rm: { label: 'RM', x: 78, y: 43 },
    'right midfielder': { label: 'RM', x: 78, y: 43 },
    lm: { label: 'LM', x: 22, y: 43 },
    'left midfielder': { label: 'LM', x: 22, y: 43 },
    rw: { label: 'RW', x: 84, y: 25 },
    'right winger': { label: 'RW', x: 84, y: 25 },
    lw: { label: 'LW', x: 16, y: 25 },
    'left winger': { label: 'LW', x: 16, y: 25 },
    ss: { label: 'SS', x: 50, y: 24 },
    'second striker': { label: 'SS', x: 50, y: 24 },
    cf: { label: 'CF', x: 50, y: 19 },
    'centre forward': { label: 'CF', x: 50, y: 19 },
    'center forward': { label: 'CF', x: 50, y: 19 },
    st: { label: 'ST', x: 50, y: 12 },
    striker: { label: 'ST', x: 50, y: 12 },
  };

  if (exact[value]) return exact[value];

  const group = positionGroup(value);
  if (group === 'goalkeeper') return exact.gk;
  if (group === 'defensive') return exact.cb;
  if (group === 'midfield') return exact.cm;
  if (group === 'attacking') return exact.cf;
  return { label: raw.slice(0, 4).toUpperCase() || 'POS', x: 50, y: 46 };
};

export const dossierPositionMap = (
  profile: any,
): DossierPositionSpot[] => {
  const positions = [
    profile?.primary_position,
    ...dossierList(profile?.secondary_positions),
  ]
    .map((position) => String(position || '').trim())
    .filter(Boolean);

  const seen = new Set<string>();

  return positions
    .map((sourceLabel, index) => ({
      ...positionCoordinate(sourceLabel),
      primary: index === 0,
      sourceLabel,
    }))
    .filter((spot) => {
      const key = `${spot.x}:${spot.y}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
};

function headlinePeriodEvidence(profile: any) {
  const career = dossierCareer(profile);
  const selected = career[0] || null;
  const selectedYear = numeric(selected?.stats_year);
  const label = String(selected?.season_label ?? selected?.season ?? '').trim();
  const normalise = (value: unknown) => String(value ?? '').trim().toLowerCase().replaceAll('/', '-').replace(/\s+/g, '');
  const rows = selected ? career.filter((row: any) => {
    const year = numeric(row?.stats_year);
    if (selectedYear !== null && year !== null) return year === selectedYear;
    const rowLabel = normalise(row?.season_label ?? row?.season);
    return rowLabel && rowLabel === normalise(label);
  }) : [];
  return {rows, period: selectedYear !== null ? String(selectedYear) : label};
}

export const dossierHeadlineStats = (
  profile: any,
  limit = 6,
) => {
  const key = (value: unknown) =>
    String(value || '')
      .toLowerCase()
      .replace(/\s+/g, '');

  const manual =
    dossierList(profile?.key_stats)
      .map((item: any) => ({
        label: String(item?.label ?? item?.name ?? '').trim(),
        value: String(item?.value ?? item?.stat ?? '').trim(),
      }))
      .filter((item) => item.label && item.value);

  // An agent-curated selection is intentional. Do not append other career
  // numbers that were not chosen for this presentation.
  if (manual.length) return manual.slice(0, limit);

  const output = [...manual];
  const seen = new Set(output.map((item) => key(item.label)));
  const {rows: periodRows} = headlinePeriodEvidence(profile);

  const sum = (
    field:
      | 'appearances'
      | 'starts'
      | 'minutes'
      | 'goals'
      | 'assists',
  ) => {
    const known = periodRows
      .map((row: any) => numeric(row?.[field]))
      .filter((value): value is number => value !== null);

    return known.length
      ? known.reduce((total, value) => total + value, 0)
      : null;
  };

  const apps = sum('appearances');
  const starts = sum('starts');
  const minutes = sum('minutes');
  const goals = sum('goals');
  const assists = sum('assists');
  const contributions =
    goals !== null && assists !== null
      ? goals + assists
      : null;

  const candidates: Record<string, number | string | null> = {
    Apps: apps,
    Starts: starts,
    Minutes:
      minutes !== null
        ? minutes.toLocaleString('en-GB')
        : null,
    Goals: goals,
    Assists: assists,
    'G+A': contributions,
  };

  ['Apps', 'Starts', 'Minutes', 'Goals', 'Assists', 'G+A'].forEach(
    (label) => {
      if (output.length >= limit) return;

      const value = candidates[label];
      if (
        value === null ||
        value === undefined ||
        seen.has(key(label))
      ) {
        return;
      }

      output.push({ label, value: String(value) });
      seen.add(key(label));
    },
  );

  return output.slice(0, limit);
};

// Describe the figures actually displayed, never borrow the latest career row's
// season, source or freshness for an intentional custom/historical selection.
export function dossierHeadlineStatContext(profile: any, limit = 6) {
  const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const curated = dossierList(profile?.key_stats).filter((row: any) =>
    String(row?.label ?? row?.name ?? '').trim() && String(row?.value ?? row?.stat ?? '').trim()).slice(0,limit);
  const evidence = headlinePeriodEvidence(profile);
  const records = curated.length ? curated : evidence.rows;
  const scopes = records.map((row: any) => {
    const period = text(row.season_label) || text(row.season);
    return period ? [period,text(row.club_name),text(row.league)].filter(Boolean).join(' · ') : '';
  });
  const sources = records.map((row: any) => text(row.source_name) || text(row.source_provider) || text(row.provider));
  const dates = records.map((row: any) => {
    for (const [field,label] of [['checked_at','Checked'],['source_reviewed_at','Reviewed'],['source_synced_at','Updated']]) {
      const value = text(row[field]);
      if (/^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)))
        return label+' '+new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value));
    }
    return '';
  });
  const mixed = (values: string[]) => new Set(values).size > 1;
  const common = (values: string[], missing: string, varied: string) =>
    mixed(values) ? varied : values[0] || missing;
  return {
    period: curated.length ? common(scopes,'Period not recorded','Selected evidence') : evidence.period || 'Period not recorded',
    source: common(sources,'Source not recorded',curated.length ? 'Sources by figure' : 'Sources vary'),
    date: common(dates,'Source date not recorded','Source dates vary'),
    notes: curated.length ? records.map((_: any,index: number) => [
      mixed(scopes) ? scopes[index] || 'Period not recorded' : null,
      mixed(sources) ? sources[index] || 'Source not recorded' : null,
      mixed(dates) ? dates[index] || 'Date not recorded' : null,
    ].filter(Boolean).join(' · ')) : [],
  };
}

export const dossierPerformance = (
  profile: any,
  limit = 5,
) => {
  const rows =
    dossierCareer(
      profile,
    ).slice(
      0,
      limit,
    );

  const useMinutes =
    rows.some(
      (row: any) =>
        numeric(
          row?.minutes,
        ) !== null,
    );

  const metric =
    useMinutes
      ? 'minutes'
      : 'appearances';

  const recordedRows = rows.filter((row: any) => numeric(row?.[metric]) !== null);
  const values =
    recordedRows.map(
      (row: any) =>
        numeric(
          row?.[metric],
        )!,
    );

  const max =
    Math.max(
      1,
      ...values,
    );

  return {
    metric,

    rows:
      recordedRows.map(
        (
          row: any,
          index,
        ) => {
          const value =
            values[index];

          const percentage =
            value > 0
              ? Math.max(
                  6,
                  Math.round(
                    (
                      value /
                      max
                    ) *
                      100,
                  ),
                )
              : 0;

          return {
            ...row,

            visualValue:
              value,

            visualPercentage:
              percentage,

            visualLabel:
              metric ===
              'minutes'
                ? `${value.toLocaleString(
                    'en-GB',
                  )} mins`
                : `${value} apps`,
          };
        },
      ),
  };
};
