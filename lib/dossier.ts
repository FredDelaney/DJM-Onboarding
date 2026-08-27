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
    : '—';
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
        )} apps`
      : null,

    numeric(row?.starts) !==
      null
      ? `${numeric(
          row.starts,
        )} starts`
      : null,

    numeric(row?.minutes) !==
      null
      ? `${numeric(
          row.minutes,
        )!.toLocaleString(
          'en-GB',
        )} mins`
      : null,

    numeric(row?.goals) !==
      null
      ? `${numeric(
          row.goals,
        )} goals`
      : null,

    numeric(row?.assists) !==
      null
      ? `${numeric(
          row.assists,
        )} assists`
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

export const dossierHeadlineStats = (
  profile: any,
  limit = 4,
) => {
  const manual =
    dossierList(
      profile?.key_stats,
    )
      .map((item: any) => ({
        label:
          String(
            item?.label ??
              item?.name ??
              '',
          ).trim(),

        value:
          String(
            item?.value ??
              item?.stat ??
              '',
          ).trim(),
      }))
      .filter(
        (item) =>
          item.label &&
          item.value,
      );

  const output =
    [...manual];

  const seen =
    new Set(
      output.map(
        (item) =>
          item.label
            .toLowerCase(),
      ),
    );

  const latest =
    dossierCareer(
      profile,
    )[0];

  if (!latest) {
    return output.slice(
      0,
      limit,
    );
  }

  const apps =
    numeric(
      latest.appearances,
    );

  const starts =
    numeric(
      latest.starts,
    );

  const minutes =
    numeric(
      latest.minutes,
    );

  const goals =
    numeric(
      latest.goals,
    );

  const assists =
    numeric(
      latest.assists,
    );

  const contributions =
    goals !== null ||
    assists !== null
      ? (goals || 0) +
        (assists || 0)
      : null;

  const candidates: any = {
    Apps:
      apps,

    Starts:
      starts,

    Minutes:
      minutes !== null
        ? minutes.toLocaleString(
            'en-GB',
          )
        : null,

    Goals:
      goals,

    Assists:
      assists,

    'G + A':
      contributions,
  };

  const group =
    positionGroup(
      profile?.primary_position,
    );

  const order =
    group === 'goalkeeper'
      ? [
          'Starts',
          'Apps',
          'Minutes',
        ]
      : group === 'defensive'
        ? [
            'Starts',
            'Minutes',
            'Apps',
            'Goals',
          ]
        : group === 'attacking'
          ? [
              'Apps',
              'Goals',
              'Assists',
              'G + A',
              'Minutes',
            ]
          : [
              'Apps',
              'Starts',
              'Minutes',
              'Goals',
              'Assists',
            ];

  order.forEach(
    (label) => {
      if (
        output.length >=
        limit
      ) {
        return;
      }

      const value =
        candidates[label];

      if (
        value === null ||
        value === undefined ||
        seen.has(
          label.toLowerCase(),
        )
      ) {
        return;
      }

      output.push({
        label,
        value:
          String(value),
      });

      seen.add(
        label.toLowerCase(),
      );
    },
  );

  return output.slice(
    0,
    limit,
  );
};

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

  const values =
    rows.map(
      (row: any) =>
        numeric(
          row?.[metric],
        ) || 0,
    );

  const max =
    Math.max(
      1,
      ...values,
    );

  return {
    metric,

    rows:
      rows.map(
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
