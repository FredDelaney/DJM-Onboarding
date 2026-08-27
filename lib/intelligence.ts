export const TRUTH_STATES = [
  'verified',
  'direct',
  'sourced',
  'inferred',
  'unknown',
  'contested',
  'stale',
] as const;

export type TruthState = (typeof TRUTH_STATES)[number];

export const VISIBILITY_LEVELS = [
  'player_private',
  'djm_internal',
  'club_shareable',
  'explicit_collaboration',
] as const;

export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number];

export type MatchStrength =
  | 'Strong'
  | 'Moderate'
  | 'Weak'
  | 'Insufficient evidence';

export type RecommendationKind =
  | 'Act now'
  | 'Review'
  | 'Prepare'
  | 'Qualify'
  | 'Hold';

export type CommandItem = {
  kind?: string | null;
  action_at?: string | null;
  created_at?: string | null;
  subtitle?: string | null;
  score?: number | null;
};

export type CandidateEvidence = {
  hard_blockers?: unknown;
  blockers?: unknown;
  strengths?: unknown;
  concerns?: unknown;
  missing_information?: unknown;
  reasoning?: unknown;
};

const list = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
};

const reasoningObject = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

export const truthStateLabel = (state?: string | null) => {
  const normalised = TRUTH_STATES.includes(state as TruthState)
    ? (state as TruthState)
    : 'unknown';

  const labels: Record<TruthState, string> = {
    verified: 'Verified',
    direct: 'Direct from source',
    sourced: 'Source attached',
    inferred: 'Inferred',
    unknown: 'Unknown',
    contested: 'Contested',
    stale: 'Needs reverification',
  };

  return labels[normalised];
};

export const matchAssessment = (candidate: CandidateEvidence) => {
  const reasoning = reasoningObject(candidate.reasoning);
  const hardBlockers = [
    ...list(candidate.hard_blockers),
    ...list(candidate.blockers),
    ...list(reasoning.hard_blockers),
    ...list(reasoning.blockers),
  ];
  const strengths = [
    ...list(candidate.strengths),
    ...list(reasoning.strengths),
    ...list(reasoning.match_strengths),
  ];
  const concerns = [
    ...list(candidate.concerns),
    ...list(reasoning.concerns),
    ...list(reasoning.match_concerns),
  ];
  const missing = [
    ...list(candidate.missing_information),
    ...list(reasoning.missing_information),
    ...list(reasoning.missing),
  ];

  let strength: MatchStrength = 'Insufficient evidence';
  if (hardBlockers.length) strength = 'Weak';
  else if (strengths.length >= 2 && concerns.length === 0) strength = 'Strong';
  else if (strengths.length > 0) strength = 'Moderate';
  else if (concerns.length > 0) strength = 'Weak';

  return {
    strength,
    hardBlockers: [...new Set(hardBlockers)],
    strengths: [...new Set(strengths)],
    concerns: [...new Set(concerns)],
    missing: [...new Set(missing)],
  };
};

const hoursFromNow = (value?: string | null, referenceTimeMs = Date.now()) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return (date.getTime() - referenceTimeMs) / 3_600_000;
};

export const commandRecommendation = (
  item: CommandItem,
  referenceTimeMs?: number,
): {
  kind: RecommendationKind;
  explanation: string;
} => {
  const kind = String(item.kind || '').toLowerCase();
  const hours = hoursFromNow(item.action_at, referenceTimeMs);

  if (kind === 'review') {
    return {
      kind: 'Review',
      explanation: 'A material record needs human verification before DJM relies on it.',
    };
  }

  if (kind === 'meeting') {
    return {
      kind: 'Prepare',
      explanation:
        hours !== null && hours <= 24
          ? 'The meeting is within 24 hours; prepare the relationship and opportunity context.'
          : 'Prepare the evidence, promises and questions while there is still time.',
    };
  }

  if (kind === 'need') {
    return {
      kind: 'Qualify',
      explanation: 'Confirm the requirement and missing constraints before investing in outreach.',
    };
  }

  if ((kind === 'task' || kind === 'deal') && hours !== null && hours < 0) {
    return {
      kind: 'Act now',
      explanation: 'The agreed next action is overdue and delay may reduce opportunity or service value.',
    };
  }

  if (kind === 'deal' && hours === null) {
    return {
      kind: 'Review',
      explanation: 'The live deal has no dated next action; decide the next move or consciously hold it.',
    };
  }

  if (hours !== null && hours > 24) {
    return {
      kind: 'Hold',
      explanation: 'A future action is already scheduled and no newer evidence requires another chase.',
    };
  }

  return {
    kind: 'Act now',
    explanation: 'This is the highest-value unresolved action supported by the current operational record.',
  };
};

export const dealCredibility = (deal: {
  stage?: string | null;
  primary_blocker?: string | null;
  next_action_at?: string | null;
  club_need_id?: string | null;
}) => {
  const stage = String(deal.stage || '').toLowerCase();
  if (deal.primary_blocker) return 'Low credibility';
  if (['offer', 'negotiating', 'terms', 'contracting'].includes(stage)) {
    return 'High credibility';
  }
  if (deal.club_need_id && deal.next_action_at) return 'Medium credibility';
  return 'Insufficient evidence';
};

export const brainIntent = (query: string) => {
  const value = query.trim().toLowerCase();
  if (!value) return 'empty';
  if (/what.*(do|today)|priority|next action/.test(value)) return 'today';
  if (/missing|blind spot|data quality/.test(value)) return 'missing';
  if (/need|demand|market/.test(value)) return 'demand';
  if (/deal|opportunit|pipeline/.test(value)) return 'deals';
  if (/budget|salary|fee/.test(value)) return 'commercial';
  return 'unsupported';
};
