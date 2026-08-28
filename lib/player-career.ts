export type ReadinessTone =
  | 'ready'
  | 'attention'
  | 'missing';

export type ReadinessComponent = {
  id: string;
  label: string;
  detail: string;
  href: string;
  score: number;
  weight: number;
  tone: ReadinessTone;
};

export type CareerReadiness = {
  score: number;
  label: string;
  summary: string;
  components: ReadinessComponent[];
};

export type WeeklyPlanItem = {
  id: string;
  eyebrow: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
  priority: number;
};

export type CareerPlaybook = {
  id: string;
  category:
    | 'Perform'
    | 'Prepare'
    | 'Move'
    | 'Protect'
    | 'Communicate';
  title: string;
  description: string;
  outcome: string;
  minutes: number;
  situations: string[];
  steps: Array<{
    title: string;
    detail: string;
  }>;
  action: {
    label: string;
    href: string;
  };
  note?: string;
};

type PlayerLike = Record<string, unknown> | null;

type PrivateLike = Record<string, unknown> | null;

type ProfileLike = Record<string, unknown> | null;

const hasText = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0;

const hasItems = (value: unknown) =>
  Array.isArray(value) && value.length > 0;

const percentage = (
  completed: number,
  total: number,
) =>
  total > 0
    ? Math.round((completed / total) * 100)
    : 0;

const toneFor = (score: number): ReadinessTone =>
  score >= 100
    ? 'ready'
    : score > 0
      ? 'attention'
      : 'missing';

const currentWeekStart = () => {
  const date = new Date();
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(
    2,
    '0',
  );
  const dateNumber = String(date.getDate()).padStart(
    2,
    '0',
  );

  return `${year}-${month}-${dateNumber}`;
};

export function calculateCareerReadiness({
  player,
  privateInfo,
  videoCount,
  documents,
  publicProfile,
  latestCheckin,
}: {
  player: PlayerLike;
  privateInfo: PrivateLike;
  videoCount: number;
  documents: Array<Record<string, unknown>>;
  publicProfile: ProfileLike;
  latestCheckin: Record<string, unknown> | null;
}): CareerReadiness {
  if (!player) {
    return {
      score: 0,
      label: 'Set-up required',
      summary:
        'Complete your player record before DJM prepares it for opportunities.',
      components: [],
    };
  }

  const basics = [
    player.first_name,
    player.last_name,
    player.date_of_birth,
    player.primary_position,
    player.preferred_foot,
    player.current_club || player.football_status,
  ];
  const basicsScore = percentage(
    basics.filter(hasText).length,
    basics.length,
  );

  const contractIsClear =
    hasText(player.contract_expiry) ||
    String(player.football_status || '') ===
      'free_agent' ||
    String(player.contract_status || '')
      .toLowerCase()
      .includes('free');
  const contractHasContext =
    contractIsClear || hasText(player.contract_status);
  const contractScore = contractIsClear
    ? 100
    : contractHasContext
      ? 50
      : 0;

  const checkinIsCurrent =
    String(latestCheckin?.week_start || '') ===
    currentWeekStart();
  const availabilityScore = checkinIsCurrent ? 100 : 0;

  const hasFootballSource = Boolean(
    player.transfermarkt_url ||
      player.wyscout_url ||
      player.stats_url,
  );
  const evidenceScore =
    videoCount > 0 && hasFootballSource
      ? 100
      : videoCount > 0 || hasFootballSource
        ? 50
        : 0;

  const documentTypes = new Set(
    documents.map((document) =>
      String(document.document_type || '').toLowerCase(),
    ),
  );
  const hasIdentityDocument = [...documentTypes].some(
    (type) =>
      type.includes('passport') ||
      type.includes('visa') ||
      type.includes('identity'),
  );
  const documentScore = hasIdentityDocument
    ? 100
    : documents.length > 0
      ? 50
      : 0;

  const profileScore = publicProfile?.published
    ? 100
    : publicProfile
      ? 60
      : 0;

  const marketFacts = [
    privateInfo?.market_preferences,
    privateInfo?.preferred_move_timing,
    privateInfo?.travel_availability,
  ];
  const hasPassport = hasItems(
    privateInfo?.passports_held,
  );
  const marketScore = percentage(
    marketFacts.filter(hasText).length +
      (hasPassport ? 1 : 0),
    marketFacts.length + 1,
  );

  const components: ReadinessComponent[] = [
    {
      id: 'profile',
      label: 'Professional profile',
      detail:
        basicsScore === 100
          ? 'Core football information is complete.'
          : 'Complete the football facts clubs ask for first.',
      href: '/profile?edit=football',
      score: basicsScore,
      weight: 20,
      tone: toneFor(basicsScore),
    },
    {
      id: 'contract',
      label: 'Contract clarity',
      detail:
        contractScore === 100
          ? 'Your current contract position is clear.'
          : 'Confirm your status and contract end date.',
      href: '/profile?edit=football',
      score: contractScore,
      weight: 15,
      tone: toneFor(contractScore),
    },
    {
      id: 'availability',
      label: 'Current availability',
      detail: checkinIsCurrent
        ? 'DJM has your position for this week.'
        : 'A current check-in tells DJM if it can move quickly.',
      href: '/check-in',
      score: availabilityScore,
      weight: 15,
      tone: toneFor(availabilityScore),
    },
    {
      id: 'evidence',
      label: 'Football evidence',
      detail:
        evidenceScore === 100
          ? 'Footage and a trusted statistics source are connected.'
          : 'Connect current footage and a trusted football source.',
      href: '/profile?edit=media',
      score: evidenceScore,
      weight: 15,
      tone: toneFor(evidenceScore),
    },
    {
      id: 'documents',
      label: 'Document readiness',
      detail:
        documentScore === 100
          ? 'A travel or identity document is stored securely.'
          : 'Add the documents that can unblock a fast move.',
      href: '/documents',
      score: documentScore,
      weight: 10,
      tone: toneFor(documentScore),
    },
    {
      id: 'club-profile',
      label: 'Club presentation',
      detail: publicProfile?.published
        ? 'Your DJM-approved club profile is live.'
        : publicProfile
          ? 'Your club presentation exists and is awaiting publication.'
          : 'DJM has not created a club-facing profile yet.',
      href: '/cv',
      score: profileScore,
      weight: 15,
      tone: toneFor(profileScore),
    },
    {
      id: 'market',
      label: 'Move brief',
      detail:
        marketScore === 100
          ? 'Your market, timing, travel and passport position is clear.'
          : 'Tell DJM where, when and how you would consider moving.',
      href: '/profile?edit=career',
      score: marketScore,
      weight: 10,
      tone: toneFor(marketScore),
    },
  ];

  const score = Math.round(
    components.reduce(
      (total, component) =>
        total +
        (component.score / 100) * component.weight,
      0,
    ),
  );

  return {
    score,
    label:
      score >= 90
        ? 'Opportunity ready'
        : score >= 70
          ? 'Nearly ready'
          : score >= 45
            ? 'Building readiness'
            : 'Action needed',
    summary:
      score >= 90
        ? 'DJM has the core information needed to respond quickly when the right call comes.'
        : 'This measures preparation, not football ability. Complete the weakest items to help DJM move faster.',
    components,
  };
}

export function buildWeeklyPlan({
  readiness,
  openRequests,
  checkinDue,
}: {
  readiness: CareerReadiness;
  openRequests: Array<Record<string, unknown>>;
  checkinDue: boolean;
}): WeeklyPlanItem[] {
  const items: WeeklyPlanItem[] = [];

  openRequests.slice(0, 2).forEach((request, index) => {
    items.push({
      id: `request-${String(request.id || index)}`,
      eyebrow: 'DJM REQUEST',
      title:
        String(request.title || '') ||
        'DJM needs an update',
      detail:
        String(request.message || '') ||
        'Reply so your representative can keep moving this forward.',
      href: '/inbox',
      cta: 'Reply to DJM',
      priority: 100 - index,
    });
  });

  if (checkinDue) {
    items.push({
      id: 'weekly-checkin',
      eyebrow: '60-SECOND CHECK-IN',
      title: 'Give DJM this week’s picture',
      detail:
        'Confirm availability, fitness, minutes and anything that changed at your club.',
      href: '/check-in',
      cta: 'Check in now',
      priority: 90,
    });
  }

  readiness.components
    .filter((component) => component.score < 100)
    .sort(
      (a, b) =>
        b.weight * (1 - b.score / 100) -
        a.weight * (1 - a.score / 100),
    )
    .slice(0, 3)
    .forEach((component, index) => {
      items.push({
        id: `readiness-${component.id}`,
        eyebrow: 'CAREER READINESS',
        title: component.label,
        detail: component.detail,
        href: component.href,
        cta: 'Improve readiness',
        priority: 70 - index,
      });
    });

  if (items.length === 0) {
    items.push({
      id: 'review-career',
      eyebrow: 'YOU ARE UP TO DATE',
      title: 'Review what clubs can see',
      detail:
        'Your core actions are complete. Check that your DJM club profile still tells the right story.',
      href: '/cv',
      cta: 'Review club profile',
      priority: 1,
    });
  }

  return items
    .sort((a, b) => b.priority - a.priority)
    .filter(
      (item, index, all) =>
        all.findIndex(
          (candidate) => candidate.href === item.href,
        ) === index,
    )
    .slice(0, 4);
}

export type ContractSignal = {
  label: string;
  detail: string;
  tone: ReadinessTone;
  daysRemaining: number | null;
};

export function getContractSignal(
  player: PlayerLike,
): ContractSignal {
  const status = String(
    player?.football_status ||
      player?.contract_status ||
      '',
  ).toLowerCase();

  if (status.includes('free')) {
    return {
      label: 'Free agent',
      detail: 'Availability is clear',
      tone: 'ready',
      daysRemaining: null,
    };
  }

  if (!hasText(player?.contract_expiry)) {
    return {
      label: 'Contract date needed',
      detail: 'Confirm the end date with DJM',
      tone: 'missing',
      daysRemaining: null,
    };
  }

  const end = new Date(
    `${String(player?.contract_expiry)}T12:00:00`,
  );
  const daysRemaining = Math.ceil(
    (end.getTime() - Date.now()) /
      (1000 * 60 * 60 * 24),
  );

  if (!Number.isFinite(daysRemaining)) {
    return {
      label: 'Contract date needs review',
      detail: 'Ask DJM to verify it',
      tone: 'attention',
      daysRemaining: null,
    };
  }

  return {
    label:
      daysRemaining < 0
        ? 'Contract date passed'
        : daysRemaining <= 180
          ? `${daysRemaining} days remaining`
          : daysRemaining <= 365
            ? 'Inside 12 months'
            : 'Contract recorded',
    detail:
      daysRemaining <= 365
        ? 'Plan the next conversation with DJM'
        : 'DJM has the key date',
    tone:
      daysRemaining <= 180
        ? 'missing'
        : daysRemaining <= 365
          ? 'attention'
          : 'ready',
    daysRemaining,
  };
}

export const CAREER_PLAYBOOKS: CareerPlaybook[] = [
  {
    id: 'match-evidence',
    category: 'Perform',
    title: 'Turn your last match into useful evidence',
    description:
      'A focused post-match review that gives you and DJM more than a scoreline or stats page.',
    outcome:
      'One clear strength, one improvement action and the exact clips worth keeping.',
    minutes: 12,
    situations: ['playing', 'minutes', 'video'],
    steps: [
      {
        title: 'Name the role you actually played',
        detail:
          'Write the position, game state and the main job your coach asked you to do.',
      },
      {
        title: 'Find three decision moments',
        detail:
          'Choose one strong action, one difficult moment and one repeatable action-not only highlights.',
      },
      {
        title: 'Write the next-match cue',
        detail:
          'Finish with one short behaviour you can control in the next match or training week.',
      },
    ],
    action: {
      label: 'Log the week',
      href: '/check-in',
    },
  },
  {
    id: 'opportunity-48',
    category: 'Prepare',
    title: 'The 48-hour opportunity pack',
    description:
      'Prepare the information and files DJM needs before a club call, trial or move becomes urgent.',
    outcome:
      'A current profile, trusted footage, travel documents and a clear move brief in one place.',
    minutes: 15,
    situations: ['free_agent', 'move', 'trial', 'missing_video'],
    steps: [
      {
        title: 'Check the football story',
        detail:
          'Confirm club, position, status, recent playing record and the two best current video links.',
      },
      {
        title: 'Check movement readiness',
        detail:
          'Confirm passport position, travel availability, preferred markets and move timing.',
      },
      {
        title: 'Check the club view',
        detail:
          'Open your DJM club profile and report anything that is wrong, stale or missing.',
      },
    ],
    action: {
      label: 'Open readiness room',
      href: '/career#readiness',
    },
  },
  {
    id: 'agent-call',
    category: 'Communicate',
    title: 'Get more from your next agent call',
    description:
      'A short preparation format for a focused conversation with DJM-especially when something has changed.',
    outcome:
      'A clear update, the decision you need help with and an agreed next action.',
    minutes: 8,
    situations: ['club_change', 'support', 'decision'],
    steps: [
      {
        title: 'State what changed',
        detail:
          'Separate what you know first-hand from what you heard and what you are worried may happen.',
      },
      {
        title: 'Name the decision',
        detail:
          'Ask one direct question: what decision or action do you need DJM to help with?',
      },
      {
        title: 'Leave with ownership',
        detail:
          'Agree what you will do, what DJM will do and when you will speak again.',
      },
    ],
    action: {
      label: 'Send DJM the context',
      href: '/inbox?compose=1',
    },
  },
  {
    id: 'contract-checkpoint',
    category: 'Protect',
    title: 'Prepare for a contract checkpoint',
    description:
      'Organise the facts and questions that matter before a renewal, option or offer conversation.',
    outcome:
      'A documented contract position and a question list for DJM and qualified legal advisers.',
    minutes: 12,
    situations: ['contract', 'expiry', 'offer'],
    steps: [
      {
        title: 'Locate the signed documents',
        detail:
          'Keep the executed contract and any later variation together-not screenshots or remembered terms.',
      },
      {
        title: 'Mark the decision dates',
        detail:
          'Identify the end date, option notice date and any registration or release timing that needs verification.',
      },
      {
        title: 'Separate priorities from assumptions',
        detail:
          'Write your sporting, financial and family priorities, then list any term that needs professional clarification.',
      },
    ],
    action: {
      label: 'Open secure documents',
      href: '/documents',
    },
    note:
      'This checklist is preparation, not legal, tax or financial advice. Use appropriately qualified advisers for decisions.',
  },
  {
    id: 'move-abroad',
    category: 'Move',
    title: 'Build your move-abroad brief',
    description:
      'Decide what a realistic international move must work for-before pressure and deadlines arrive.',
    outcome:
      'Clear preferred markets, non-negotiables, travel readiness and family considerations for DJM.',
    minutes: 15,
    situations: ['move', 'international', 'passport'],
    steps: [
      {
        title: 'Define the football fit',
        detail:
          'List the role, minutes pathway, level and coaching environment that would make a move worthwhile.',
      },
      {
        title: 'Define the real-life fit',
        detail:
          'Consider language, housing, family, travel, schooling and support-not only country or salary.',
      },
      {
        title: 'Confirm practical eligibility',
        detail:
          'Record passports and known work rights, then ask DJM to verify any registration or permit question.',
      },
    ],
    action: {
      label: 'Update move preferences',
      href: '/profile?edit=career',
    },
  },
  {
    id: 'interview-ready',
    category: 'Communicate',
    title: 'Be ready for the five-minute interview',
    description:
      'A practical media routine for post-match, signing-day and club-content interviews.',
    outcome:
      'Three natural messages you can deliver clearly without sounding rehearsed.',
    minutes: 10,
    situations: ['media', 'transfer', 'match'],
    steps: [
      {
        title: 'Prepare three honest messages',
        detail:
          'Have one line on the team, one on your contribution and one on what comes next.',
      },
      {
        title: 'Bridge difficult questions',
        detail:
          'Acknowledge the question, avoid speculation and return to what you know and can control.',
      },
      {
        title: 'Record one phone rehearsal',
        detail:
          'Watch it once for pace, clarity and body language. Improve one thing, then stop.',
      },
    ],
    action: {
      label: 'Ask DJM for feedback',
      href: '/inbox?compose=1',
    },
  },
  {
    id: 'setback-comms',
    category: 'Protect',
    title: 'Communicate an injury or setback well',
    description:
      'Give DJM useful context without turning the player app into a medical record.',
    outcome:
      'DJM understands your availability, expected next update and the support you want.',
    minutes: 5,
    situations: ['injured', 'limited', 'setback'],
    steps: [
      {
        title: 'State availability, not a diagnosis',
        detail:
          'Say whether you are training, limited or unavailable and what your club has formally communicated.',
      },
      {
        title: 'Give the next known checkpoint',
        detail:
          'Share when you expect the next assessment or club update, if known.',
      },
      {
        title: 'Say what support you need',
        detail:
          'Tell DJM whether you need a conversation, practical help or simply for the agency to stay informed.',
      },
    ],
    action: {
      label: 'Update DJM privately',
      href: '/check-in',
    },
    note:
      'DJM Player does not diagnose injuries or replace your club and qualified medical professionals.',
  },
  {
    id: 'money-safety',
    category: 'Protect',
    title: 'Protect yourself around money decisions',
    description:
      'A safety check for introductions, investment pressure and financial requests around football.',
    outcome:
      'A pause-and-verify habit before money or personal information moves.',
    minutes: 7,
    situations: ['finance', 'offer', 'introduction'],
    steps: [
      {
        title: 'Slow down urgency',
        detail:
          'Do not send money, codes or identity documents because someone creates artificial time pressure.',
      },
      {
        title: 'Verify the person independently',
        detail:
          'Check identity, company and regulatory status using a channel you found yourself-not only their link.',
      },
      {
        title: 'Bring in the right professional',
        detail:
          'Ask DJM and use independently qualified legal, tax or financial advice before committing.',
      },
    ],
    action: {
      label: 'Ask DJM to verify',
      href: '/inbox?compose=1',
    },
    note:
      'This is a fraud-safety checklist, not investment, legal, tax or financial advice.',
  },
];

export function getRecommendedPlaybook({
  player,
  latestCheckin,
  readiness,
}: {
  player: PlayerLike;
  latestCheckin: Record<string, unknown> | null;
  readiness: CareerReadiness;
}) {
  const contract = getContractSignal(player);
  const fitness = String(
    latestCheckin?.fitness_status || '',
  );

  if (
    fitness === 'injured' ||
    fitness === 'managing' ||
    String(latestCheckin?.availability_status || '') ===
      'limited'
  ) {
    return CAREER_PLAYBOOKS.find(
      (playbook) => playbook.id === 'setback-comms',
    )!;
  }

  if (
    contract.daysRemaining !== null &&
    contract.daysRemaining <= 365
  ) {
    return CAREER_PLAYBOOKS.find(
      (playbook) =>
        playbook.id === 'contract-checkpoint',
    )!;
  }

  if (
    String(player?.football_status || '') ===
      'free_agent' ||
    readiness.score < 70
  ) {
    return CAREER_PLAYBOOKS.find(
      (playbook) => playbook.id === 'opportunity-48',
    )!;
  }

  if (latestCheckin?.club_situation_changed) {
    return CAREER_PLAYBOOKS.find(
      (playbook) => playbook.id === 'agent-call',
    )!;
  }

  return CAREER_PLAYBOOKS[0];
}
