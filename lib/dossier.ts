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

export const dossierCareer = (
  profile: any,
) =>
  dossierList(
    profile?.career_timeline,
  ).filter(
    (row: any) =>
      row?.club_name ||
      row?.club ||
      row?.season_label ||
      row?.season,
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
