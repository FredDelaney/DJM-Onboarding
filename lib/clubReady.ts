export type ClubReadyItem = {
  key: string;
  label: string;
  ok: boolean;
};

const present = (value: any) => {
  if (Array.isArray(value)) {
    return value.some(
      (item) => String(item || '').trim(),
    );
  }

  return !!String(value || '').trim();
};

const validDob = (value: any) => {
  if (!value) return false;

  const date = new Date(
    `${String(value).slice(0, 10)}T12:00:00`,
  );

  return (
    !Number.isNaN(date.getTime()) &&
    date.getTime() < Date.now()
  );
};

const hasCurrentSituation = (
  player: any,
) => {
  if (present(player?.current_club)) {
    return true;
  }

  if (
    String(
      player?.football_status || '',
    ).toLowerCase() === 'free_agent'
  ) {
    return true;
  }

  return String(
    player?.contract_status || '',
  )
    .toLowerCase()
    .includes('free');
};

const hasSource = (player: any) =>
  !!(
    present(player?.transfermarkt_url) ||
    present(player?.wyscout_url) ||
    present(player?.stats_url)
  );

const hasCareerRecord = (
  career: any[],
) =>
  (career || []).some(
    (row) =>
      present(row?.club_name) &&
      (
        present(row?.season_label) ||
        present(row?.start_date)
      ),
  );

const hasCareerNumbers = (
  career: any[],
) =>
  (career || []).some(
    (row) =>
      row?.appearances != null ||
      row?.starts != null ||
      row?.minutes != null ||
      row?.goals != null ||
      row?.assists != null,
  );

export function getClubReadyState(
  player: any,
  cv: any,
  career: any[] = [],
  videos: any[] = [],
) {
  const required: ClubReadyItem[] = [
    {
      key: 'identity',
      label: 'Player name',
      ok:
        present(player?.first_name) &&
        present(player?.last_name),
    },
    {
      key: 'dob',
      label: 'Valid date of birth',
      ok: validDob(player?.date_of_birth),
    },
    {
      key: 'nationality',
      label: 'Nationality',
      ok: present(player?.nationalities),
    },
    {
      key: 'position',
      label: 'Primary position',
      ok: present(
        player?.primary_position,
      ),
    },
    {
      key: 'foot',
      label: 'Preferred foot',
      ok: present(
        player?.preferred_foot,
      ),
    },
    {
      key: 'situation',
      label:
        'Current club or free-agent status',
      ok: hasCurrentSituation(player),
    },
    {
      key: 'headline',
      label: 'DJM positioning headline',
      ok:
        String(
          cv?.intro_line || '',
        ).trim().length >= 8,
    },
    {
      key: 'why_review',
      label: 'Why review this player',
      ok:
        String(
          cv?.why_review || '',
        ).trim().length >= 20,
    },
    {
      key: 'evidence',
      label: 'Sporting record or source',
      ok:
        hasCareerRecord(career) ||
        hasSource(player),
    },
  ];

  const recommended: ClubReadyItem[] = [
    {
      key: 'photo',
      label: 'Professional player photo',
      ok: present(
        player?.profile_photo_path,
      ),
    },
    {
      key: 'video',
      label: 'Current player footage',
      ok:
        (videos || []).length > 0,
    },
    {
      key: 'career_numbers',
      label: 'Season performance numbers',
      ok: hasCareerNumbers(career),
    },
    {
      key: 'external_source',
      label: 'External verification source',
      ok: hasSource(player),
    },
    {
      key: 'season_period',
      label: 'Current season period',
      ok:
        present(
          player?.current_season_label,
        ) &&
        present(
          player?.current_season_start,
        ),
    },
  ];

  const requiredDone =
    required.filter(
      (item) => item.ok,
    ).length;

  const requiredTotal =
    required.length;

  const missingRequired =
    required.filter(
      (item) => !item.ok,
    );

  const recommendedMissing =
    recommended.filter(
      (item) => !item.ok,
    );

  return {
    isReady:
      requiredDone === requiredTotal,

    required,
    recommended,

    requiredDone,
    requiredTotal,

    score: Math.round(
      (requiredDone / requiredTotal) *
        100,
    ),

    missingRequired,
    recommendedMissing,
  };
}
